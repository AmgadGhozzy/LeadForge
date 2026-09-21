import * as fs from 'fs';
import * as path from 'path';
import { 
  BOOKING_PROVIDER_DOMAINS,
  BOOKING_URL_PATHS,
  BOOKING_CTA_STRONG_EN,
  BOOKING_CTA_MEDIUM_EN,
  BOOKING_CTA_STRONG_AR,
  BOOKING_CTA_WEAK,
  CHATBOT_SCRIPTS, 
  CHATBOT_GLOBALS, 
  WHATSAPP_PATTERNS, 
  SOCIAL_DOMAINS,
  REFERENCE_RULES_VERSION
} from './reference-patterns.js';

const VALIDATION_DATASET = process.env.VALIDATION_DATASET;
if (!VALIDATION_DATASET) {
  console.error("ERROR: VALIDATION_DATASET environment variable is required.");
  process.exit(1);
}

const DATASET_DIR = path.resolve(process.cwd(), `scripts/validate/datasets/${VALIDATION_DATASET}`);
const SNAPSHOTS_DIR = path.join(DATASET_DIR, 'snapshots');
const REFERENCES_DIR = path.join(DATASET_DIR, 'references-v2');
const LEADS_FILE = path.join(DATASET_DIR, 'leads.json');

if (!fs.existsSync(SNAPSHOTS_DIR)) {
  console.error(`ERROR: Snapshots directory not found at ${SNAPSHOTS_DIR}`);
  process.exit(1);
}
if (!fs.existsSync(REFERENCES_DIR)) {
  fs.mkdirSync(REFERENCES_DIR, { recursive: true });
}

const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
const leadsMap = new Map(leads.map((l: any) => [l.id, l]));

function isComplete(snapshot: any, type: string): boolean {
  const routesScraped = snapshot.pages.map((p: any) => p.route);
  const hasHome = routesScraped.includes('home');
  const hasContact = routesScraped.includes('contact');
  const hasServices = routesScraped.includes('services');
  const hasBooking = routesScraped.includes('booking');
  
  if (snapshot.crawl_blocked) return false;

  switch (type) {
    case 'BOOKING':
      return hasHome && (hasContact || hasServices || hasBooking) && snapshot.pages_scraped >= 2;
    case 'WHATSAPP':
    case 'PHONE':
    case 'SOCIAL':
      return hasHome;
    case 'CHATBOT':
      return snapshot.pages_scraped >= 2;
    default:
      return false;
  }
}

function processSnapshot(filename: string) {
  const snapshotPath = path.join(SNAPSHOTS_DIR, filename);
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const leadId = snapshot.lead_id;
  const leadMetadata = leadsMap.get(leadId) || {};

  const reference: Record<string, any> = {};

  const allLinks = snapshot.pages.flatMap((p: any) => p.links);
  const allIframes = snapshot.pages.flatMap((p: any) => p.iframes);
  const allForms = snapshot.pages.flatMap((p: any) => p.forms);
  const allScripts = snapshot.pages.flatMap((p: any) => p.scripts);
  const allGlobals = snapshot.pages.flatMap((p: any) => p.global_vars);
  const allText = snapshot.pages.map((p: any) => p.visible_text).join(' ');

  // BOOKING
  let hasProvider = false;
  let hasBookingStructure = false;
  let hasInternalUrl = false;
  let hasStrongCTA = false;
  let hasMediumCTA = false;
  let hasWeakCTA = false;
  const bookingSources: string[] = [];

  if (allLinks.some((l: string) => BOOKING_PROVIDER_DOMAINS.some(p => l.includes(p)))) { hasProvider = true; bookingSources.push('Provider URL in link'); }
  if (allIframes.some((i: string) => BOOKING_PROVIDER_DOMAINS.some(p => i.includes(p)))) { hasProvider = true; bookingSources.push('Provider URL in iframe'); }
  if (allForms.some((f: string) => BOOKING_PROVIDER_DOMAINS.some(p => f.includes(p)))) { hasProvider = true; bookingSources.push('Provider URL in form'); }

  // Check page structure (inputs of type date/time, calendars) inside a booking-like route
  const bookingPages = snapshot.pages.filter((p: any) => BOOKING_URL_PATHS.some(path => p.url.toLowerCase().includes(path)));
  for (const bp of bookingPages) {
    const html = (bp.html || '').toLowerCase();
    if (html.includes('<input type="date"') || html.includes('<input type="time"') || html.includes('calendar-widget') || html.includes('booking-widget')) {
      hasBookingStructure = true;
      bookingSources.push('Booking-specific interactive structure on booking page');
      break;
    }
  }

  if (allLinks.some((l: string) => BOOKING_URL_PATHS.some(p => l.toLowerCase().includes(p)))) {
    hasInternalUrl = true;
    bookingSources.push('Internal booking URL link found');
  }

  if (BOOKING_CTA_STRONG_EN.some(r => r.test(allText)) || BOOKING_CTA_STRONG_AR.some(r => r.test(allText))) {
    hasStrongCTA = true;
    bookingSources.push('Strong booking CTA found');
  }
  if (BOOKING_CTA_MEDIUM_EN.some(r => r.test(allText))) {
    hasMediumCTA = true;
    bookingSources.push('Medium booking CTA found');
  }
  if (BOOKING_CTA_WEAK.some(r => r.test(allText))) {
    hasWeakCTA = true;
    bookingSources.push('Weak booking CTA found');
  }

  // Corroboration Logic
  if (hasProvider || (hasInternalUrl && hasBookingStructure)) {
    reference['BOOKING'] = { truth: 'YES', confidence: 1.00, sources: bookingSources };
  } else if ((hasStrongCTA && hasInternalUrl) || (hasStrongCTA && hasBookingStructure)) {
    reference['BOOKING'] = { truth: 'YES', confidence: 0.90, sources: bookingSources };
  } else if (hasMediumCTA && hasInternalUrl) {
    reference['BOOKING'] = { truth: 'YES', confidence: 0.70, sources: bookingSources };
  } else if (isComplete(snapshot, 'BOOKING')) {
    if (hasInternalUrl || hasStrongCTA || hasMediumCTA || hasWeakCTA) {
      reference['BOOKING'] = { truth: 'UNKNOWN', confidence: 0.0, sources: [...bookingSources, 'Uncorroborated weak/medium signals'] };
    } else {
      reference['BOOKING'] = { truth: 'NO', confidence: 0.80, sources: ['Sufficient pages scanned, no booking signal'] };
    }
  } else {
    reference['BOOKING'] = { truth: 'UNKNOWN', confidence: 0.0, sources: ['Insufficient observability'] };
  }

  // WHATSAPP
  const waSources = [];
  if (allLinks.some((l: string) => WHATSAPP_PATTERNS.some(p => l.includes(p)))) waSources.push('WhatsApp URL found');
  if (waSources.length > 0) {
    reference['WHATSAPP'] = { truth: 'YES', confidence: 1.00, sources: waSources };
  } else if (isComplete(snapshot, 'WHATSAPP')) {
    reference['WHATSAPP'] = { truth: 'NO', confidence: 0.80, sources: ['Sufficient pages scanned, no whatsapp signal'] };
  } else {
    reference['WHATSAPP'] = { truth: 'UNKNOWN', confidence: 0.0, sources: ['Insufficient observability'] };
  }

  // CHATBOT
  const botSources = [];
  if (allScripts.some((s: string) => CHATBOT_SCRIPTS.some(p => s.includes(p)))) botSources.push('Chatbot script found');
  if (allGlobals.some((g: string) => CHATBOT_GLOBALS.includes(g))) botSources.push('Chatbot global var found');

  if (botSources.length > 0) {
    reference['CHATBOT'] = { truth: 'YES', confidence: 0.95, sources: botSources };
  } else if (isComplete(snapshot, 'CHATBOT')) {
    // Confidence 0.65 to reflect custom chatbots might exist
    reference['CHATBOT'] = { truth: 'NO', confidence: 0.65, sources: ['Sufficient pages scanned, no known chatbot signal'] };
  } else {
    reference['CHATBOT'] = { truth: 'UNKNOWN', confidence: 0.0, sources: ['Insufficient observability'] };
  }

  // SOCIAL
  const socialSources = [];
  if (allLinks.some((l: string) => SOCIAL_DOMAINS.some(p => l.includes(p)))) socialSources.push('Social URL found');
  if (socialSources.length > 0) {
    reference['SOCIAL'] = { truth: 'YES', confidence: 1.00, sources: socialSources };
  } else if (isComplete(snapshot, 'SOCIAL')) {
    reference['SOCIAL'] = { truth: 'NO', confidence: 0.80, sources: ['Sufficient pages scanned, no social link'] };
  } else {
    reference['SOCIAL'] = { truth: 'UNKNOWN', confidence: 0.0, sources: ['Insufficient observability'] };
  }

  // PHONE
  const phoneSources = [];
  if (allLinks.some((l: string) => l.startsWith('tel:'))) phoneSources.push('tel: link found');
  if (/(\+20|01[0-9])[0-9]{8,9}/.test(allText)) phoneSources.push('Phone regex match in text');
  if (leadMetadata.phone) phoneSources.push('Phone in frozen DB metadata');

  if (phoneSources.length > 0) {
    reference['PHONE'] = { truth: 'YES', confidence: 1.00, sources: phoneSources };
  } else if (isComplete(snapshot, 'PHONE')) {
    reference['PHONE'] = { truth: 'NO', confidence: 0.80, sources: ['Sufficient pages scanned, no phone signal'] };
  } else {
    reference['PHONE'] = { truth: 'UNKNOWN', confidence: 0.0, sources: ['Insufficient observability'] };
  }

  const output = {
    schema_version: "1.0",
    reference_rules_version: REFERENCE_RULES_VERSION,
    snapshot_sha256: snapshot.snapshot_sha256,
    generated_at: new Date().toISOString(),
    reference
  };

  const outputPath = path.join(REFERENCES_DIR, `${leadId}.reference.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[extractor] Generated reference for ${leadId}`);
}

async function main() {
  console.log(`[extractor] Extracting references...`);
  const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.snapshot.json'));
  for (const f of files) {
    processSnapshot(f);
  }
  console.log(`[extractor] Done.`);
}

main().catch(console.error);
