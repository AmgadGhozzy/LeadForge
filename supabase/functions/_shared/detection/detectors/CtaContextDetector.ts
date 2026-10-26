// ──────────────────────────────────────────────
// CTA Context Detector — DBPG v2.1
//
// Emits: QUOTE_CTA, CONSULTATION_CTA, APPOINTMENT_CTA, APPLICATION_CTA,
//        WHATSAPP (channel atom), and a raw CtaContext observation for
//        the evaluator / Level-2 consumers.
// ──────────────────────────────────────────────

import type { AtomDetector, AtomResults, CtaContext } from '../atomic-evidence-types.ts';
import { extractHrefValues, isWhatsAppHref } from '../atomic-evidence-types.ts';

interface Pattern {
  name: string;
  re: RegExp;
}

// QUOTE_CTA Ground Truth (§3.1) & Contract:
const QUOTE_PATTERNS: Pattern[] = [
  { name: 'request quote', re: /request(?: a| an)? (?:custom )?quote|request a custom quotation/i },
  { name: 'get quote / pricing', re: /get a quote|get project pricing|get pricing|quote within/i },
  { name: 'submit rfq', re: /submit rfq|rfq-form/i },
  { name: 'request proposal', re: /request proposal|request (?:a |an )?(?:executive )?proposal/i },
];

// CONSULTATION_CTA Ground Truth (Appointment/Consultative Eligibility Signal):
const CONSULTATION_PATTERNS: Pattern[] = [
  // English consultative & appointment phrasing
  { name: 'book/schedule consultation', re: /(?:book|schedule|reserve|request)[^<]{0,40}consultation/i },
  { name: 'speak with an advisor', re: /speak with an advisor/i },
  { name: 'free assessment', re: /free assessment/i },
  { name: 'book appointment cta', re: /\b(?:book|make|schedule|request|reserve)\s+(?:an?\s+)?(?:appointment|visit|slot)\b/i },
  { name: 'book online / book now', re: /\b(?:book\s+online|book\s+now|online\s+booking|appointments?)\b/i },
  { name: 'contact / get in touch cta', re: /\b(?:contact\s+us|get\s+in\s+touch|contact\s+clinic|reach\s+out\s+to\s+us|call\s+us)\b/i },

  // Arabic consultative & appointment phrasing
  { name: 'arabic-consult-احجز', re: /احجز\s*(?:استشارتك|استشارة|موعد|موعدك|الآن|معنا)?/u },
  { name: 'arabic-consult-طلب', re: /طلب\s*(?:استشارة|موعد)/u },
  { name: 'arabic-consult-مجانية', re: /استشارة\s*(?:مجانية|طبية)/u },
  { name: 'arabic-consult-تحدث', re: /تحدث\s*مع\s*استشاري/u },
  { name: 'arabic-consult-حجز', re: /حجز\s*(?:موعد|موعدك|استشارة|الآن)/u },
  { name: 'arabic-consult-تواصل', re: /(?:تواصل\s*معنا|اتصل\s*بنا|للحجز)/u },

  // Dutch consultative & appointment phrasing
  { name: 'dutch-afspraak-maken', re: /\b(?:afspraak\s+maken|maak\s+een\s+afspraak|afspraak)\b/i },
  { name: 'dutch-inschrijven', re: /\b(?:inschrijven|inschrijving|aanmelden|aanmelding)\b/i },
  { name: 'dutch-nieuwe-patient', re: /\bnieuwe\s+pati[eë]nt(?:en)?\b/i },
  { name: 'dutch-contact-opnemen', re: /\b(?:contact\s+opnemen|neem\s+contact\s+op)\b/i },
];

// Explicit appointment-sector clinic identity (broad coverage across English, Arabic, Dutch)
const CLINIC_IDENTITY_RE = /\b(?:dental|dentist|orthodont(?:ic|ist)?|periodont(?:ic|ist)?|endodont(?:ic|ist)?|implant(?:ology)?|doctor|clinic|medical|health|hospital|physio(?:therapy)?|chiro(?:practic)?|derma(?:tology)?|skin|eye|salon|spa|tandarts|mondzorg|praktijk)\b|(?:عيادة|عيادات|طبيب|دكتور|مركز|مجمع|أسنان|طب\s*الأسنان|جلدية|تجميل|صحة)/iu;

// Contact channel indicators
const CONTACT_CHANNEL_RE = /href=["'](?:tel:|mailto:)[^"']+["']|href=["'][^"']*(?:wa\.me|whatsapp)[^"']*["']|<form\b|href=["'][^"']*(?:\/contact|contact-us|contactus|tawasol|%d8%aa%d9%88%d8%a7%d8%b5%d9%84)[^"']*["']|\b(?:phone|call|email|address|location|hours|opening\s+hours|working\s+hours)\b/i;

// ──────────────────────────────────────────────
// APPOINTMENT_CTA: Verified Digital Booking Path Signal
// Aligned directly with independent-site-inspector.ts
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
  'mychart', 'patientaccess', 'carestack', 'curvehero', 'tabeo',
];

const SCHEDULING_PLATFORM_RE = new RegExp(
  `(?:href|src|data-[a-z0-9_-]+)=["'][^"']*(?:${BOOKING_PLATFORM_PATTERNS.map((p) => p.replace('.', '\\.')).join('|')})[^"']*["']`,
  'i'
);

const DATE_TIME_INPUT_RE = /type\s*=\s*["'](date|datetime-local|time)["']/i;

// Global calendar / datepicker widget patterns (outside or inside forms)
const GLOBAL_CALENDAR_WIDGET_PATTERNS = [
  /\bdatepicker\b/i, /\bdate-picker\b/i, /\bflatpickr\b/i, /\bpikaday\b/i,
  /\bdatetimepicker\b/i, /\bbooking-calendar\b/i, /\bappointment-time\b/i,
  /\bwpcf7-date\b/i, /\bgform_datepicker\b/i, /\bair-datepicker\b/i,
  /\breact-datepicker\b/i, /\bmat-datepicker\b/i, /\bel-date-picker\b/i,
  /\bvc_calendar\b/i, /\bbooking-widget\b/i, /\bcalendar-widget\b/i,
  /\bappointment-picker\b/i, /\bvoorkeursdatum\b/i,
  /\u062a\u0627\u0631\u064a\u062e\s*(\u0627\u0644\u0645\u0648\u0639\u062f|\u0627\u0644\u062d\u062c\u0632)/u,
  /\u0627\u062e\u062a\u0631\s*(\u0627\u0644\u062a\u0627\u0631\u064a\u062e|\u0627\u0644\u0645\u0648\u0639\u062f)/u,
  /preferred.?(?:date|time|day|slot)/i,
  /appointment.?(?:date|time|day|slot)/i,
  /\bselect\s+(?:a\s+)?(?:date|time|day|slot|treatment|doctor)\b/i,
  /\bchoose\s+(?:a\s+)?(?:date|time|day|slot)\b/i,
  /\u062d\u062c\u0632\s*\u0645\u0648\u0639\u062f/iu,
  /\u0627\u062e\u062a\u064a\u0627\u0631\s*(\u0627\u0644\u062a\u0627\u0631\u064a\u062e|\u0627\u0644\u0648\u0642\u062a|\u0627\u0644\u0645\u0648\u0639\u062f)/iu,
];

// Form-scoped patterns (inside <form> only)
const FORM_SCOPED_PATTERNS = [
  /preferred.?(date|time|day|slot)/i,
  /appointment.?(date|time|day|slot)/i,
  /select.?(date|time|day|treatment|doctor)/i,
  /choose.?(date|time|day|slot)/i,
  /\u062d\u062c\u0632\s*\u0645\u0648\u0639\u062f/i,
  /\u0627\u062e\u062a\u064a\u0627\u0631\s*(\u0627\u0644\u062a\u0627\u0631\u064a\u062e|\u0627\u0644\u0648\u0642\u062a|\u0627\u0644\u0645\u0648\u0639\u062f)/i,
];

const SCHEDULING_IFRAME_RE = /<iframe\b[^>]*src=["'][^"']*(?:booking|schedule|calendar|appointment|reserv)[^"']*["']/i;

// APPLICATION_CTA ground truth (§3.1)
const APPLICATION_PATTERNS: Pattern[] = [
  { name: 'apply now', re: /apply now/i },
  { name: 'submit application', re: /submit (?:an? )?application|application form/i },
  { name: 'onboarding intake', re: /onboarding intake/i },
  { name: 'credit application', re: /credit application/i },
  { name: 'open account', re: /open an account/i },
];

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export class CtaContextDetector implements AtomDetector {
  detect(html: string, links?: string[], pagesObserved?: string[]): AtomResults {
    const results: AtomResults = {};

    const firstMatch = (patterns: Pattern[]) => {
      for (const p of patterns) {
        const m = html.match(p.re);
        if (m) return { source: p.name, raw: m[0].slice(0, 120), index: m.index ?? 0 };
      }
      return null;
    };

    // 1. QUOTE_CTA
    const quote = firstMatch(QUOTE_PATTERNS);
    if (quote) results.QUOTE_CTA = { present: true, anchor_text: `${quote.source}: ${quote.raw}` };

    // 2. CONSULTATION_CTA (Intent / Eligibility signal)
    const consultation = firstMatch(CONSULTATION_PATTERNS);
    if (consultation && !this.isCareersContext(html, consultation.index)) {
      results.CONSULTATION_CTA = { present: true, anchor_text: `${consultation.source}: ${consultation.raw}` };
    } else {
      const urlText = (pagesObserved || []).join(' ');
      const combinedText = `${html}\n${urlText}`;
      const clinicMatch = html.match(CLINIC_IDENTITY_RE);
      const isDentalOrClinic = !!clinicMatch || /(?:dental|dentist|orthodont|periodont|endodont|implant|doctor|clinic|medical|health|hospital|tandarts|mondzorg|praktijk)\b|(?:عيادة|عيادات|طبيب|دكتور|مركز|مجمع|أسنان|طب\s*الأسنان|صحة)/iu.test(combinedText);
      const hasClinicIndicator = CONTACT_CHANNEL_RE.test(html) ||
        /<title\b[^>]*>[^<]*(?:dental|dentist|clinic|doctor|مركز|عيادة|أسنان|طبيب|ortho|perio|tandarts|implant)[^<]*<\/title>/i.test(html) ||
        /(?:dental|dentist|clinic|doctor|ortho|perio|tandarts|implant)/i.test(urlText);

      if (isDentalOrClinic && hasClinicIndicator && !this.isCareersContext(html, clinicMatch?.index ?? 0)) {
        results.CONSULTATION_CTA = { present: true, anchor_text: `clinic_identity: ${clinicMatch ? clinicMatch[0] : 'clinic_title_or_url'}` };
      }
    }

    // 3. APPOINTMENT_CTA (Verified Digital Booking Path Signal)
    // (a) Check external booking platform links passed in argument
    if (links && links.length > 0) {
      for (const link of links) {
        const lower = link.toLowerCase();
        for (const pattern of BOOKING_PLATFORM_PATTERNS) {
          if (lower.includes(pattern)) {
            results.APPOINTMENT_CTA = { present: true, destination_url: link, anchor_text: `booking_platform: ${pattern}` };
            break;
          }
        }
        if (results.APPOINTMENT_CTA) break;
      }
    }

    // (b) Check embedded platform widgets/links in HTML
    if (!results.APPOINTMENT_CTA) {
      const platformMatch = html.match(SCHEDULING_PLATFORM_RE);
      if (platformMatch) {
        results.APPOINTMENT_CTA = { present: true, anchor_text: `platform_embed: ${platformMatch[0].slice(0, 100)}` };
      }
    }

    // (c) Check booking platform keywords across HTML
    if (!results.APPOINTMENT_CTA) {
      const lowerHtml = html.toLowerCase();
      for (const p of BOOKING_PLATFORM_PATTERNS) {
        if (lowerHtml.includes(p)) {
          results.APPOINTMENT_CTA = { present: true, anchor_text: `platform_keyword: ${p}` };
          break;
        }
      }
    }

    // (d) Check HTML5 date/time inputs
    if (!results.APPOINTMENT_CTA) {
      const dateInput = html.match(DATE_TIME_INPUT_RE);
      if (dateInput) {
        results.APPOINTMENT_CTA = { present: true, anchor_text: `date_time_input: ${dateInput[0].slice(0, 80)}` };
      }
    }

    // (e) Check global calendar & datepicker widget patterns across HTML
    if (!results.APPOINTMENT_CTA) {
      for (const p of GLOBAL_CALENDAR_WIDGET_PATTERNS) {
        const m = html.match(p);
        if (m) {
          results.APPOINTMENT_CTA = { present: true, anchor_text: `calendar_widget: ${m[0].slice(0, 80)}` };
          break;
        }
      }
    }

    // (f) Check form-scoped patterns inside <form> tags
    if (!results.APPOINTMENT_CTA) {
      const forms = html.match(/<form[\s\S]*?<\/form>/gi) || [];
      for (const form of forms) {
        for (const p of FORM_SCOPED_PATTERNS) {
          const m = form.match(p);
          if (m) {
            results.APPOINTMENT_CTA = { present: true, anchor_text: `form_scheduling_field: ${m[0].slice(0, 80)}` };
            break;
          }
        }
        if (results.APPOINTMENT_CTA) break;
      }
    }

    // (g) Check embedded scheduling iframes
    if (!results.APPOINTMENT_CTA) {
      const iframeMatch = html.match(SCHEDULING_IFRAME_RE);
      if (iframeMatch) {
        results.APPOINTMENT_CTA = { present: true, anchor_text: `scheduling_iframe: ${iframeMatch[0].slice(0, 100)}` };
      }
    }

    // 4. APPLICATION_CTA
    const application = firstMatch(APPLICATION_PATTERNS);
    if (application && !this.isCareersContext(html, application.index)) {
      results.APPLICATION_CTA = { present: true, anchor_text: `${application.source}: ${application.raw}` };
    }

    // 5. WHATSAPP
    const waHref = extractHrefValues(html).find(isWhatsAppHref);
    if (waHref) {
      results.WHATSAPP = { present: true, destination_url: waHref };
    }

    return results;
  }

  extractContactContext(html: string): CtaContext | null {
    const wa = this.extractWhatsAppContext(html);
    if (wa) return wa;

    const footerChannel = this.extractFooterContactContext(html);
    if (footerChannel) return footerChannel;

    return null;
  }

  private extractWhatsAppContext(html: string): CtaContext | null {
    const anchorMatch = html.match(
      /<\s*a\b[^>]*href=["'][^"']*(?:wa\.me|whatsapp\.com|whatsapp:\/\/)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
    );
    if (!anchorMatch) return null;

    const waHref = extractHrefValues(html).find(isWhatsAppHref);
    const destination_url = waHref;

    const cta_label = stripHtml(anchorMatch[1]);
    const ariaMatch = html
      .slice(anchorMatch.index, (anchorMatch.index ?? 0) + 400)
      .match(/aria-label=["']([^"']*)["']/i);
    const label = cta_label || (ariaMatch ? ariaMatch[1] : '');

    const hrefIdx = html.indexOf('wa.me');
    const around = html.slice(Math.max(0, hrefIdx - 400), hrefIdx + 400);
    const surrounding_text = stripHtml(around);

    return {
      channel: 'WHATSAPP',
      cta_label: label,
      surrounding_text,
      destination_url,
    };
  }

  private extractFooterContactContext(html: string): CtaContext | null {
    const footerMatch = html.match(/<\s*footer\b[^>]*>([\s\S]*?)<\/footer>/i);
    if (!footerMatch) return null;
    const footer = footerMatch[1];

    const tel = footer.match(/href=["'](tel:[^"']+)["']/i);
    const mail = footer.match(/href=["'](mailto:[^"']+)["']/i);
    if (!tel && !mail) return null;

    const footerText = stripHtml(footer);
    const labelled = labelFromUrl(tel?.[1] ?? mail?.[1]!);

    return {
      channel: tel ? 'PHONE' : 'EMAIL',
      cta_label: labelled,
      surrounding_text: footerText,
      destination_url: tel?.[1] ?? mail?.[1],
    };
  }

  private extractSnippet(html: string, matchIndex: number, radius = 400): string {
    return html.slice(Math.max(0, matchIndex - radius), matchIndex + radius);
  }

  private isCareersContext(html: string, matchIndex: number): boolean {
    return /careers?\b|\bjobs?\b|\bhiring\b|\bresume\b|\bcv\b/i.test(this.extractSnippet(html, matchIndex));
  }
}

function labelFromUrl(raw: string): string {
  return raw.replace(/^mailto:/i, 'email').replace(/^tel:/i, 'phone');
}