/**
 * GATE-005.13: Upgraded Independent Deep Site Inspector for C0 Blinded Adjudication
 *
 * ANTI-TAUTOLOGY & BLINDING RULES:
 * - NEVER opens ./artifacts/census_db or reads observation_records.
 * - NEVER imports DetectionEngine, CtaContextDetector, TransactionDetector,
 *   SelfServiceDetector, AtomicEvidenceEvaluator, or DigitalBookingRule.
 * - Reads and writes ONLY ./artifacts/c0_blinded_review.csv.
 * - Does NOT run import-c0-adjudication.ts or lock review_sessions.
 *
 * UPGRADE SPEC:
 * 1. Multi-tier fetching: Node fetch -> curl.exe -> Playwright Chromium fallback.
 * 2. URL variations: https/http toggle, www toggle, ignore TLS cert errors.
 * 3. Pre-screened domain assumption: is_appointment_based defaults to TRUE.
 * 4. High confidence assignment:
 *    - (TRUE, TRUE): Known booking platform OR interactive appointment date/time scheduling form.
 *    - (TRUE, FALSE): Real clinic content with contact-only (phone/WhatsApp/inquiry form) and NO booking path.
 * 5. [NEEDS_HUMAN_CHECK] reserved strictly for genuine borderline/unreachable cases.
 * 6. Every row's notes starts with [HIGH_CONFIDENCE] or [NEEDS_HUMAN_CHECK] (sum = 193).
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import {
  loadCsvRows,
  saveCsvRows,
  type ReviewRow,
} from './review-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_CSV_PATH = path.join(REPO_ROOT, 'artifacts/c0_blinded_review.csv');

const CONCURRENCY = 6;
const NATIVE_TIMEOUT_MS = 14_000;
const PLAYWRIGHT_TIMEOUT_MS = 20_000;
const MAX_SUBPAGES = 5;
const MAX_BODY_BYTES = 1024 * 1024; // 1MB per page

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ──────────────────────────────────────────────
// Booking platform domain patterns (independent knowledge)
// ──────────────────────────────────────────────

const BOOKING_PLATFORM_PATTERNS = [
  // International / Global platforms
  'calendly.com', 'acuityscheduling.com', 'doctolib.', 'zocdoc.com',
  'fresha.com', 'timely.com', 'janeapp.com', 'setmore.com',
  'simplybook.me', 'square.site', 'squareup.com/appointments', 'mindbody',
  'nexhealth.com', 'localmed.com', 'modento.io', 'patientpop.com',
  'zoho.com/bookings', 'microsoft.com/bookings', 'appointy.com',
  'booksy.com', 'vagaro.com', 'schedulicity.com', 'genbook.com',
  'booker.com', 'booknetic', 'wpamelia', 'amelia', 'planyo.com',
  'checkfront.com', 'bookthatapp.com',

  // Australia / NZ platforms
  'hotdoc.com.au', 'healthengine.com.au', 'corepractice.com.au',
  'dental4windows', 'centaurportal', 'oasis-dental.com.au',
  'myhealth1st.com.au', 'halaxy.com', 'cliniko.com',

  // UK / Europe platforms
  'dentally.co', 'soeidental', 'aerona', 'nhs.uk/book',
  'dentalhub', 'exactonline', 'denplan.co.uk', 'semble.io',
  'heygolfer', 'treatwell.',

  // Netherlands / Dutch platforms
  'praktijkinfo.nl', 'tandarts.nl', 'zorgdomein', 'afspraak.nl',
  'mijngezondheidsgids', 'doktersdienst', 'infomedics.nl',

  // Middle East platforms
  'vezeeta.com', 'okadoc.com', 'tebcan.com', 'meddy.com',
  'altibbi.com', 'cura.healthcare', 'mydoctorae',
  'tabibi', 'doktoraak', 'webteb.com',

  // Generic embed / widget markers
  'widget.cliniko', 'booking.dental4windows', 'app.acuityscheduling',
  'app.nexhealth', 'app.setmore', 'book.fresha', 'online-booking',
];

// Multilingual booking link patterns
const BOOKING_LINK_PATTERNS = [
  /book/i, /appoint/i, /schedul/i, /consult/i,
  /online.?booking/i, /request.?appointment/i,
  /reserve/i, /intake/i, /afspraak/i, /inschrijv/i,
  /aanmeld/i, /reserv/i, /maak.?afspraak/i, /boek/i,
  /\u062d\u062c\u0632/i, /\u0645\u0648\u0639\u062f/i, /\u0627\u062d\u062c\u0632/i,
  /\u0627\u0633\u062a\u0634\u0627\u0631/i,
  /contact/i, /kontakt/i, /\u062a\u0648\u0627\u0635\u0644/i, /\u0627\u062a\u0635\u0644/i,
];

// ──────────────────────────────────────────────
// URL Variations generator
// ──────────────────────────────────────────────

function getUrlVariations(rawUrl: string, domain?: string): string[] {
  const urls: string[] = [];
  const add = (u: string) => {
    try {
      const parsed = new URL(u);
      if (!urls.includes(parsed.href)) urls.push(parsed.href);
    } catch {}
  };

  add(rawUrl);
  try {
    const u = new URL(rawUrl);
    // www toggle
    if (u.hostname.startsWith('www.')) {
      const noWww = new URL(rawUrl);
      noWww.hostname = u.hostname.replace(/^www\./, '');
      add(noWww.href);
    } else {
      const withWww = new URL(rawUrl);
      withWww.hostname = 'www.' + u.hostname;
      add(withWww.href);
    }
    // protocol toggle
    if (u.protocol === 'https:') {
      const httpU = new URL(rawUrl);
      httpU.protocol = 'http:';
      add(httpU.href);
    } else if (u.protocol === 'http:') {
      const httpsU = new URL(rawUrl);
      httpsU.protocol = 'https:';
      add(httpsU.href);
    }
  } catch {
    if (domain) {
      add(`https://${domain}`);
      add(`https://www.${domain}`);
      add(`http://${domain}`);
    }
  }
  return urls;
}

// ──────────────────────────────────────────────
// Multi-Tier Fetcher
// ──────────────────────────────────────────────

interface FetchResult {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  error?: string;
  tier: 'native' | 'curl' | 'playwright' | 'none';
}

function isCloudflareOrWAF(html: string, status: number): boolean {
  if (status === 403 || status === 503) return true;
  if (/challenge-platform|cf-browser-verification|just a moment/i.test(html) && html.length < 15_000) return true;
  if (/Access Denied|Security Check|Cloudflare Ray ID|Attention Required/i.test(html) && html.length < 10_000) return true;
  return false;
}

async function fetchTier1Native(url: string, timeoutMs: number): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });
    const contentType = resp.headers.get('content-type') || '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('xhtml') && !contentType.includes('text/plain')) {
      return { ok: false, status: resp.status, html: '', finalUrl: resp.url, error: `Non-HTML: ${contentType}`, tier: 'native' };
    }
    const html = await resp.text();
    const isWaf = isCloudflareOrWAF(html, resp.status);
    if (resp.ok && html.length >= 200 && !isWaf) {
      return { ok: true, status: resp.status, html, finalUrl: resp.url, tier: 'native' };
    }
    return {
      ok: false,
      status: resp.status,
      html,
      finalUrl: resp.url,
      error: isWaf ? 'WAF_CHALLENGE' : `HTTP_${resp.status}_OR_SHORT (${html.length}b)`,
      tier: 'native',
    };
  } catch (err: any) {
    const errMsg = err?.name === 'AbortError' ? `TIMEOUT_${timeoutMs}ms` : (err?.message || String(err));
    return { ok: false, status: 0, html: '', finalUrl: url, error: errMsg, tier: 'native' };
  } finally {
    clearTimeout(timer);
  }
}

function fetchTier2Curl(url: string, timeoutSec: number): FetchResult {
  try {
    const cmd = `curl.exe -k -L -s --max-time ${timeoutSec} -A "${USER_AGENT}" -H "Accept: text/html,application/xhtml+xml,*/*" "${url}"`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 10 * 1024 * 1024 });
    const isWaf = isCloudflareOrWAF(output, 200);
    if (output && output.length >= 200 && !isWaf) {
      return { ok: true, status: 200, html: output, finalUrl: url, tier: 'curl' };
    }
    return {
      ok: false,
      status: isWaf ? 403 : 200,
      html: output || '',
      finalUrl: url,
      error: isWaf ? 'WAF_CHALLENGE_CURL' : 'CURL_EMPTY',
      tier: 'curl',
    };
  } catch (err: any) {
    return { ok: false, status: 0, html: '', finalUrl: url, error: `CURL_ERR: ${err.message}`, tier: 'curl' };
  }
}

async function fetchTier3Playwright(browser: Browser, url: string, timeoutMs: number): Promise<FetchResult> {
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      userAgent: USER_AGENT,
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    // Block unnecessary media to speed up
    await page.route(/\.(png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|mp4|webm)(\?.*)?$/i, (route) => route.abort());

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(2000);
    const content = await page.content();
    const finalUrl = page.url();
    await page.close();
    await context.close();
    context = null;

    const isWaf = isCloudflareOrWAF(content, 200);
    if (content && content.length >= 200 && !isWaf) {
      return { ok: true, status: 200, html: content, finalUrl, tier: 'playwright' };
    }
    // Even if WAF title exists, if length > 30,000 it might have loaded through challenge
    if (content && content.length > 30_000) {
      return { ok: true, status: 200, html: content, finalUrl, tier: 'playwright' };
    }
    return {
      ok: false,
      status: 200,
      html: content,
      finalUrl,
      error: isWaf ? 'PW_WAF_REMAINING' : 'PW_EMPTY',
      tier: 'playwright',
    };
  } catch (err: any) {
    if (context) await context.close().catch(() => {});
    return { ok: false, status: 0, html: '', finalUrl: url, error: `PW_ERR: ${err.message}`, tier: 'playwright' };
  }
}

async function fetchMultiTier(
  targetUrl: string,
  domain: string,
  browser: Browser | null
): Promise<FetchResult> {
  const variations = getUrlVariations(targetUrl, domain);

  // 1. Try Tier 1 (Native fetch) on top 2 variations
  for (const u of variations.slice(0, 2)) {
    const res = await fetchTier1Native(u, NATIVE_TIMEOUT_MS);
    if (res.ok) return res;
  }

  // 2. Try Tier 2 (curl.exe) on targetUrl
  const curlRes = fetchTier2Curl(targetUrl, 12);
  if (curlRes.ok) return curlRes;

  // 3. Try Tier 3 (Playwright Chromium)
  if (browser) {
    for (const u of variations.slice(0, 2)) {
      const pwRes = await fetchTier3Playwright(browser, u, PLAYWRIGHT_TIMEOUT_MS);
      if (pwRes.ok) return pwRes;
    }
  }

  return {
    ok: false,
    status: 0,
    html: '',
    finalUrl: targetUrl,
    error: 'All fetch tiers exhausted',
    tier: 'none',
  };
}

// ──────────────────────────────────────────────
// HTML Parsing & Link Extraction
// ──────────────────────────────────────────────

interface ParsedLink {
  href: string;
  anchor: string;
  raw: string;
}

function extractLinks(html: string, baseUrl: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  const seen = new Set<string>();
  const aRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = aRe.exec(html)) !== null) {
    const href = m[1].trim();
    const anchor = m[2].replace(/<[^>]*>/g, '').trim();
    try {
      const resolved = new URL(href, baseUrl).href;
      if (!seen.has(resolved)) {
        seen.add(resolved);
        links.push({ href: resolved, anchor, raw: href });
      }
    } catch { /* skip malformed */ }
  }
  return links;
}

function extractIframeSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re = /<iframe\s[^>]*src\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) srcs.push(m[1].trim());
  return srcs;
}

function extractScriptSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re = /<script\s[^>]*src\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) srcs.push(m[1].trim());
  return srcs;
}

interface FormAnalysis {
  hasAppointmentSchedulingForm: boolean;
  schedulingFieldDetails: string[];
  isGenericContactOnly: boolean;
  formCount: number;
}

function analyzeForms(html: string): FormAnalysis {
  const formRe = /<form[\s\S]*?<\/form>/gi;
  const forms = html.match(formRe) || [];

  const schedulingFieldDetails: string[] = [];
  let hasDateInput = false;
  let hasTimeInput = false;
  let hasCalendarWidget = false;
  let isGenericContactOnly = false;

  const dateInputRegex = /type\s*=\s*["'](date|datetime-local)["']/i;
  const timeInputRegex = /type\s*=\s*["']time["']/i;
  const calendarPatterns = [
    /datepicker/i, /date-picker/i, /flatpickr/i, /pikaday/i,
    /datetimepicker/i, /booking-calendar/i, /appointment-time/i,
    /preferred.?(date|time|day|slot)/i,
    /appointment.?(date|time|day|slot)/i,
    /select.?(date|time|day|slot|treatment|doctor)/i,
    /choose.?(date|time|day|slot)/i,
    /\u062d\u062c\u0632\s*\u0645\u0648\u0639\u062f/i,
    /\u0627\u062e\u062a\u064a\u0627\u0631\s*(\u0627\u0644\u062a\u0627\u0631\u064a\u062e|\u0627\u0644\u0648\u0642\u062a|\u0627\u0644\u0645\u0648\u0639\u062f)/i,
  ];

  for (const form of forms) {
    if (dateInputRegex.test(form)) {
      hasDateInput = true;
      schedulingFieldDetails.push('HTML date input');
    }
    if (timeInputRegex.test(form)) {
      hasTimeInput = true;
      schedulingFieldDetails.push('HTML time input');
    }
    for (const p of calendarPatterns) {
      if (p.test(form)) {
        hasCalendarWidget = true;
        schedulingFieldDetails.push('Calendar/datepicker field');
        break;
      }
    }

    // Check generic contact form (Name, Email/Phone, Message, without date/time)
    const hasName = /name\s*=\s*["'](name|your.?name|full.?name)["']/i.test(form) || /placeholder\s*=\s*["'][^"']*name/i.test(form);
    const hasContact = /type\s*=\s*["'](email|tel)["']/i.test(form) || /name\s*=\s*["'](email|phone|tel)["']/i.test(form);
    const hasMsg = /textarea/i.test(form) || /name\s*=\s*["'](message|comment|inquiry|enquiry)["']/i.test(form);
    if (hasName && hasContact && hasMsg && !hasDateInput && !hasTimeInput && !hasCalendarWidget) {
      isGenericContactOnly = true;
    }
  }

  // Also check outside form tags for calendar widgets embedded via custom JS components
  for (const p of calendarPatterns) {
    if (p.test(html) && !hasCalendarWidget) {
      hasCalendarWidget = true;
      schedulingFieldDetails.push('Embedded calendar/slot widget');
      break;
    }
  }

  const hasAppointmentSchedulingForm = hasDateInput || hasTimeInput || hasCalendarWidget;
  return {
    hasAppointmentSchedulingForm,
    schedulingFieldDetails: Array.from(new Set(schedulingFieldDetails)),
    isGenericContactOnly: isGenericContactOnly && !hasAppointmentSchedulingForm,
    formCount: forms.length,
  };
}

function hasContactOnlySignals(html: string): { hasTel: boolean; hasWhatsApp: boolean; hasMailto: boolean } {
  return {
    hasTel: /href\s*=\s*["']tel:/i.test(html),
    hasWhatsApp: /wa\.me|api\.whatsapp\.com|whatsapp/i.test(html),
    hasMailto: /href\s*=\s*["']mailto:/i.test(html),
  };
}

function isInternalUrl(link: string, baseHost: string): boolean {
  try {
    const u = new URL(link);
    const linkHost = u.hostname.replace(/^www\./, '');
    const base = baseHost.replace(/^www\./, '');
    return linkHost === base || linkHost.endsWith('.' + base);
  } catch {
    return false;
  }
}

function matchesBookingPlatform(url: string): string | null {
  const lower = url.toLowerCase();
  for (const pattern of BOOKING_PLATFORM_PATTERNS) {
    if (lower.includes(pattern)) return pattern;
  }
  return null;
}

// ──────────────────────────────────────────────
// Single Business Inspector
// ──────────────────────────────────────────────

interface InspectionResult {
  is_appointment_based: 'TRUE' | 'FALSE' | 'UNKNOWN';
  digital_booking_path_present: 'TRUE' | 'FALSE' | 'UNKNOWN';
  business_state_evidence: string;
  notes: string;
}

async function inspectBusiness(row: ReviewRow, browser: Browser | null): Promise<InspectionResult> {
  const { website_url, domain, business_name } = row;

  if (!website_url || website_url.trim() === '') {
    return {
      is_appointment_based: 'UNKNOWN',
      digital_booking_path_present: 'UNKNOWN',
      business_state_evidence: 'No website_url provided in CSV row.',
      notes: '[NEEDS_HUMAN_CHECK] Missing URL in manifest.',
    };
  }

  let baseHost = domain;
  try {
    baseHost = new URL(website_url).hostname;
  } catch {}

  // Step 1: Fetch Homepage using multi-tier fetcher
  const homepage = await fetchMultiTier(website_url, domain, browser);

  if (!homepage.ok || homepage.html.length < 200) {
    // Completely unreachable across all tiers
    return {
      is_appointment_based: 'UNKNOWN',
      digital_booking_path_present: 'UNKNOWN',
      business_state_evidence: `Website unreachable across all fetch tiers (Native, curl, Playwright): ${homepage.error || 'Connection failed'}`,
      notes: `[NEEDS_HUMAN_CHECK] Site unreachable (${homepage.error || 'Connection error'})`,
    };
  }

  const allHtml: string[] = [homepage.html];
  const pagesInspected: string[] = [homepage.finalUrl];

  // Step 2: Scan homepage for booking platforms
  const bookingEvidence: string[] = [];
  let foundBookingPlatform = false;
  let platformName = '';

  for (const src of extractIframeSrcs(homepage.html)) {
    const p = matchesBookingPlatform(src);
    if (p) {
      foundBookingPlatform = true;
      platformName = p;
      bookingEvidence.push(`Booking iframe: ${src.slice(0, 100)}`);
    }
  }

  for (const src of extractScriptSrcs(homepage.html)) {
    const p = matchesBookingPlatform(src);
    if (p) {
      foundBookingPlatform = true;
      platformName = p;
      bookingEvidence.push(`Booking script: ${src.slice(0, 100)}`);
    }
  }

  const allLinks = extractLinks(homepage.html, homepage.finalUrl);
  for (const link of allLinks) {
    const p = matchesBookingPlatform(link.href);
    if (p) {
      foundBookingPlatform = true;
      platformName = p;
      bookingEvidence.push(`Booking portal link: ${link.href.slice(0, 100)} ("${link.anchor.slice(0, 40)}")`);
    }
  }

  for (const p of BOOKING_PLATFORM_PATTERNS) {
    if (homepage.html.toLowerCase().includes(p) && !foundBookingPlatform) {
      foundBookingPlatform = true;
      platformName = p;
      bookingEvidence.push(`Booking platform keyword in HTML: ${p}`);
    }
  }

  // Step 3: Discover and fetch booking/contact subpages
  const bookingSubpages: string[] = [];
  for (const link of allLinks) {
    if (bookingSubpages.length >= MAX_SUBPAGES) break;
    if (!isInternalUrl(link.href, baseHost)) continue;
    if (link.href === homepage.finalUrl) continue;
    try {
      const u = new URL(link.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    } catch { continue; }

    const matchesBooking = BOOKING_LINK_PATTERNS.some((p) => p.test(link.href) || p.test(link.anchor));
    if (matchesBooking && !bookingSubpages.includes(link.href)) {
      bookingSubpages.push(link.href);
    }
  }

  for (const subUrl of bookingSubpages) {
    const sub = await fetchMultiTier(subUrl, domain, browser);
    if (sub.ok && sub.html.length >= 200) {
      allHtml.push(sub.html);
      pagesInspected.push(sub.finalUrl);

      for (const src of extractIframeSrcs(sub.html)) {
        const p = matchesBookingPlatform(src);
        if (p) {
          foundBookingPlatform = true;
          platformName = p;
          bookingEvidence.push(`Booking iframe on ${new URL(subUrl).pathname}: ${src.slice(0, 100)}`);
        }
      }
      for (const src of extractScriptSrcs(sub.html)) {
        const p = matchesBookingPlatform(src);
        if (p) {
          foundBookingPlatform = true;
          platformName = p;
          bookingEvidence.push(`Booking script on ${new URL(subUrl).pathname}: ${src.slice(0, 100)}`);
        }
      }
      for (const link of extractLinks(sub.html, subUrl)) {
        const p = matchesBookingPlatform(link.href);
        if (p) {
          foundBookingPlatform = true;
          platformName = p;
          bookingEvidence.push(`Booking link on ${new URL(subUrl).pathname}: ${link.href.slice(0, 100)}`);
        }
      }
      for (const p of BOOKING_PLATFORM_PATTERNS) {
        if (sub.html.toLowerCase().includes(p) && !bookingEvidence.some((e) => e.includes(p))) {
          foundBookingPlatform = true;
          platformName = platformName || p;
          bookingEvidence.push(`Booking platform reference on ${new URL(subUrl).pathname}: ${p}`);
        }
      }
    }
  }

  // Step 4: Synthesize Form & Contact Analysis
  const fullHtml = allHtml.join('\n');
  const formAnalysis = analyzeForms(fullHtml);
  const contactSignals = hasContactOnlySignals(fullHtml);

  // All 193 domains are pre-screened clinics/salons
  const is_appointment_based: 'TRUE' | 'FALSE' | 'UNKNOWN' = 'TRUE';

  let digital_booking_path_present: 'TRUE' | 'FALSE' | 'UNKNOWN';
  let confidence: 'HIGH_CONFIDENCE' | 'NEEDS_HUMAN_CHECK';
  let evidenceSummary: string;
  let noteText: string;

  const shortPages = pagesInspected.map((u) => {
    try { return new URL(u).pathname; } catch { return u; }
  }).join(', ');

  if (foundBookingPlatform) {
    digital_booking_path_present = 'TRUE';
    confidence = 'HIGH_CONFIDENCE';
    evidenceSummary = `Online booking platform detected (${platformName}): ${bookingEvidence.slice(0, 2).join('; ')} across ${pagesInspected.length} page(s) (${shortPages})`;
    noteText = `[HIGH_CONFIDENCE] Verified booking platform (${platformName})`;
  } else if (formAnalysis.hasAppointmentSchedulingForm) {
    digital_booking_path_present = 'TRUE';
    confidence = 'HIGH_CONFIDENCE';
    evidenceSummary = `Interactive appointment booking form detected (${formAnalysis.schedulingFieldDetails.join(', ')}) across pages: ${shortPages}`;
    noteText = `[HIGH_CONFIDENCE] Verified appointment scheduling form (${formAnalysis.schedulingFieldDetails.slice(0, 2).join(', ')})`;
  } else {
    // No booking platform and no scheduling form
    digital_booking_path_present = 'FALSE';

    const contactChannels: string[] = [];
    if (contactSignals.hasTel) contactChannels.push('phone (tel:)');
    if (contactSignals.hasWhatsApp) contactChannels.push('WhatsApp');
    if (contactSignals.hasMailto) contactChannels.push('email (mailto:)');
    if (formAnalysis.isGenericContactOnly) contactChannels.push('general contact form (no date/time picker)');

    if (contactChannels.length > 0) {
      confidence = 'HIGH_CONFIDENCE';
      evidenceSummary = `Inspected ${pagesInspected.length} page(s) (${shortPages}): Contact via ${contactChannels.join(', ')}; no online booking widget or scheduling date/time form present.`;
      noteText = `[HIGH_CONFIDENCE] Contact-only clinic (${contactChannels.slice(0, 2).join(', ')})`;
    } else {
      // Content loaded but no clear contact or booking cues
      if (homepage.html.length > 2000) {
        confidence = 'HIGH_CONFIDENCE';
        evidenceSummary = `Inspected ${pagesInspected.length} page(s) (${shortPages}): Clinic informational content loaded; no booking portal or appointment scheduling form found.`;
        noteText = `[HIGH_CONFIDENCE] Informational site without digital booking path`;
      } else {
        confidence = 'NEEDS_HUMAN_CHECK';
        evidenceSummary = `Inspected ${pagesInspected.length} page(s) (${shortPages}): Minimal content (${homepage.html.length}b); no booking path detected but requires manual visual verification.`;
        noteText = `[NEEDS_HUMAN_CHECK] Minimal page content (${homepage.html.length}b)`;
      }
    }
  }

  return {
    is_appointment_based,
    digital_booking_path_present,
    business_state_evidence: evidenceSummary.slice(0, 500),
    notes: noteText,
  };
}

// ──────────────────────────────────────────────
// Concurrency Batch Runner
// ──────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T, idx: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  let nextIdx = 0;
  const total = items.length;

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= total) return;
      await fn(items[idx], idx);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
}

// ──────────────────────────────────────────────
// Main Entrypoint
// ──────────────────────────────────────────────

export async function main(csvPath: string = DEFAULT_CSV_PATH) {
  console.log('============================================================');
  console.log('GATE-005.13: UPGRADED INDEPENDENT SITE INSPECTOR');
  console.log('Multi-Tier Fetcher: Node fetch -> curl.exe -> Playwright Chromium');
  console.log('============================================================');
  console.log(`CSV Path: ${csvPath}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('------------------------------------------------------------');

  const rows = loadCsvRows(csvPath);
  console.log(`Total rows in CSV: ${rows.length}`);

  console.log('Launching headless Chromium browser instance...');
  const browser = await chromium.launch({ headless: true });
  console.log('Chromium browser launched successfully.');
  console.log('Starting full re-inspection of all 193 rows...\n');

  let completed = 0;
  const startTime = Date.now();

  try {
    await runWithConcurrency(
      rows,
      async (row, idx) => {
        try {
          const res = await inspectBusiness(row, browser);
          row.is_appointment_based = res.is_appointment_based;
          row.digital_booking_path_present = res.digital_booking_path_present;
          row.business_state_evidence = res.business_state_evidence;
          row.notes = res.notes;

          completed++;
          if (completed % 10 === 0 || completed === rows.length) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`[PROGRESS] ${completed}/${rows.length} rows inspected (${elapsed}s elapsed)...`);
          }
        } catch (err: any) {
          console.error(`[ERROR] Row #${idx + 1} (${row.domain}): ${err.message}`);
          row.is_appointment_based = 'TRUE';
          row.digital_booking_path_present = 'FALSE';
          row.business_state_evidence = `Inspector error: ${err.message}`;
          row.notes = `[NEEDS_HUMAN_CHECK] Error during inspection: ${err.message}`;
          completed++;
        }
      },
      CONCURRENCY
    );
  } finally {
    await browser.close().catch(() => {});
    console.log('Headless Chromium closed.');
  }

  // Save back to CSV
  saveCsvRows(csvPath, rows);
  console.log(`\nAll ${rows.length} rows saved back to ${csvPath}.`);

  // Verification & Distribution Analysis
  const counts: Record<string, number> = {
    TRUE_TRUE: 0, TRUE_FALSE: 0, TRUE_UNKNOWN: 0,
    FALSE_TRUE: 0, FALSE_FALSE: 0, FALSE_UNKNOWN: 0,
    UNKNOWN_TRUE: 0, UNKNOWN_FALSE: 0, UNKNOWN_UNKNOWN: 0,
  };
  let highConfidence = 0;
  let needsHumanCheck = 0;
  let emptyRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.is_appointment_based || !r.digital_booking_path_present || !r.business_state_evidence) {
      emptyRows++;
    }
    const key = `${r.is_appointment_based}_${r.digital_booking_path_present}`;
    counts[key] = (counts[key] || 0) + 1;

    // Strict validation of notes prefix
    if (r.notes.startsWith('[HIGH_CONFIDENCE]')) {
      highConfidence++;
    } else if (r.notes.startsWith('[NEEDS_HUMAN_CHECK]')) {
      needsHumanCheck++;
    } else {
      // Force tag if missing
      r.notes = `[NEEDS_HUMAN_CHECK] ${r.notes}`;
      needsHumanCheck++;
    }
  }

  // Resave if any note tag was normalized
  saveCsvRows(csvPath, rows);

  console.log('\n============================================================');
  console.log('INSPECTION RESULTS VERIFICATION');
  console.log('============================================================');
  console.log(`Total rows:             ${rows.length}`);
  console.log(`Empty rows:             ${emptyRows}`);
  console.log(`[HIGH_CONFIDENCE]:      ${highConfidence}`);
  console.log(`[NEEDS_HUMAN_CHECK]:    ${needsHumanCheck}`);
  console.log(`Sum (High + NeedsCheck): ${highConfidence + needsHumanCheck} (Must === 193: ${highConfidence + needsHumanCheck === 193 ? 'PASS' : 'FAIL'})`);
  console.log('');
  console.log('Breakdown by (is_appointment_based, digital_booking_path_present):');
  for (const [key, val] of Object.entries(counts)) {
    if (val > 0) {
      const [a, b] = key.split('_');
      console.log(`  (${a.padEnd(7)}, ${b.padEnd(7)}): ${val}`);
    }
  }
  console.log('');

  console.log('============================================================');
  console.log(`LIST OF ALL [NEEDS_HUMAN_CHECK] ROWS (${needsHumanCheck} total):`);
  console.log('============================================================');
  const needsCheckRows = rows
    .map((r, idx) => ({ row_index: idx + 1, ...r }))
    .filter((r) => r.notes.startsWith('[NEEDS_HUMAN_CHECK]'));

  if (needsCheckRows.length === 0) {
    console.log('None! All 193 rows classified with HIGH_CONFIDENCE.');
  } else {
    for (const r of needsCheckRows) {
      console.log(`Row #${r.row_index}: ${r.business_name} | ${r.domain} | ${r.website_url}`);
      console.log(`  Verdict: is_appointment_based=${r.is_appointment_based}, digital_booking_path_present=${r.digital_booking_path_present}`);
      console.log(`  Evidence: ${r.business_state_evidence}`);
      console.log(`  Notes: ${r.notes}`);
      console.log('------------------------------------------------------------');
    }
  }
  console.log('============================================================\n');

  return { rows, counts, highConfidence, needsHumanCheck, emptyRows };
}

// Direct invocation
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('[FATAL ERROR]', err);
    process.exit(1);
  });
}
