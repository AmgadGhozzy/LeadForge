// Independent definitions for Validation Harness Reference Logic.
// CRITICAL: NEVER import from production `DetectionEngine` or Supabase functions here.
// Duplication is an intentional architectural boundary to prevent correlated bugs.

// Booking — reference patterns (v2)
export const BOOKING_PROVIDER_DOMAINS = [
  'calendly.com', 'zocdoc.com', 'mindbody.io', 'doctolib',
  'setmore.com', 'simplybook', 'acuityscheduling', 'fresha.com',
  'booksy.com', 'vagaro.com', 'appointy.com', '10to8.com',
  'clinicmaster', 'healthengine', 'practo.com'
];

export const BOOKING_URL_PATHS = [
  '/appointment', '/appointments', '/book', '/book-online',
  '/online-booking', '/online-appointment', '/schedule',
  '/booking', '/reserve', '/book-now'
];

export const BOOKING_CTA_STRONG_EN = [
  /\b(book now|book an appointment|book your appointment|schedule a visit|make an appointment|schedule now|book online|reserve your spot)\b/i
];

export const BOOKING_CTA_MEDIUM_EN = [
  /\b(book appointment|schedule appointment|book a consultation|request an appointment)\b/i
];

export const BOOKING_CTA_STRONG_AR = [
  /احجز موعد|احجز الآن|احجز موعدك|حجز موعد|حجز أونلاين|حجز اونلاين|حجز عبر الإنترنت|حجز إلكتروني/
];

export const BOOKING_CTA_WEAK = [
  /\bappointment\b/i, // context-free "appointment" word
  /احجز(?!\s+موعد|\s+الآن|\s+موعدك)/,  // احجز without qualifier
  /\bحجز\b/,  // standalone حجز
  /\bمواعيد\b/, // مواعيد (schedule/hours context)
];

export const CHATBOT_SCRIPTS = [
  'intercom.io', 'drift.com', 'crisp.chat', 'tawk.to',
  'tidio.com', 'freshchat.com', 'livechat.com', 'olark.com',
  'zendesk.com/embeddable', 'hubspot.com/conversations-visitor'
];

export const CHATBOT_GLOBALS = [
  'window.Intercom', 'window.drift', 'window.$crisp',
  'window.tawk', 'window.fcWidget', 'window.zE',
  'Intercom', 'drift', '$crisp', 'tawk', 'fcWidget', 'zE' // from page.evaluate
];

export const WHATSAPP_PATTERNS = [
  'wa.me/', 'api.whatsapp.com/send', 'whatsapp.com/send'
];

export const SOCIAL_DOMAINS = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'tiktok.com', 'youtube.com'
];

export const REFERENCE_RULES_VERSION = "2.0.0";
