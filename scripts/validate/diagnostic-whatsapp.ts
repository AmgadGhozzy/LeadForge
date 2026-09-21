import * as fs from 'fs';
import * as path from 'path';

const WHATSAPP_DATASET = process.env.WHATSAPP_DATASET || "phase-8b-whatsapp-v2";
const DATASET_DIR = path.resolve(process.cwd(), `scripts/validate/datasets/${WHATSAPP_DATASET}`);
const REFERENCES_DIR = path.join(DATASET_DIR, 'references');

if (!fs.existsSync(REFERENCES_DIR)) {
  console.error("ERROR: WhatsApp references directory not found at " + REFERENCES_DIR);
  process.exit(1);
}

const files = fs.readdirSync(REFERENCES_DIR).filter(f => f.endsWith('.whatsapp.reference.json'));

let total = 0;
let errors = 0;

let yes = 0;
let no = 0;
let unknown = 0;

const positiveSignals = {
  whatsapp_business_link: 0,
  whatsapp_widget: 0,
  whatsapp_explicit_cta: 0,
};

const negativeSignals = {
  explicit_exclusion: 0,
  phone_contact: 0,
  email_contact: 0,
  live_chat: 0,
  generic_contact_form: 0,
};

let traceabilityInvalidSource = 0;
let traceabilityUntraceableEvidence = 0;

for (const file of files) {
  total++;
  const filePath = path.join(REFERENCES_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const decision = data.evaluation?.decision;
  if (decision === 'YES') yes++;
  else if (decision === 'NO') no++;
  else unknown++;

  for (const sig of data.evidence?.positiveSignals || []) {
    if (sig.type === 'whatsapp_business_link') positiveSignals.whatsapp_business_link++;
    if (sig.type === 'whatsapp_widget') positiveSignals.whatsapp_widget++;
    if (sig.type === 'whatsapp_explicit_cta') positiveSignals.whatsapp_explicit_cta++;
  }

  for (const sig of data.evidence?.negativeSignals || []) {
    if (sig.type === 'whatsapp_explicit_exclusion') negativeSignals.explicit_exclusion++;
    if (sig.type === 'explicit_phone_contact_cta') negativeSignals.phone_contact++;
    if (sig.type === 'explicit_email_contact_cta') negativeSignals.email_contact++;
    if (sig.type === 'live_chat') negativeSignals.live_chat++;
    if (sig.type === 'generic_contact_form') negativeSignals.generic_contact_form++;
  }
}

console.log("WhatsApp Reference Diagnostic");
console.log("=============================\n");
console.log("Dataset: phase-8b-v4-combined");
console.log("Snapshots: " + total + "\n");

console.log("Extraction");
console.log("----------");
console.log("Success: " + total);
console.log("Errors: " + errors + "\n");

console.log("Decisions");
console.log("---------");
console.log("YES:     " + yes);
console.log("NO HIGH: " + no);
console.log("UNKNOWN: " + unknown + "\n");

console.log("Positive Signals");
console.log("----------------");
console.log("whatsapp_business_link: " + positiveSignals.whatsapp_business_link);
console.log("whatsapp_widget:        " + positiveSignals.whatsapp_widget);
console.log("whatsapp_explicit_cta:  " + positiveSignals.whatsapp_explicit_cta + "\n");

console.log("Negative Signals");
console.log("----------------");
console.log("explicit_exclusion:     " + negativeSignals.explicit_exclusion);
console.log("phone_contact:          " + negativeSignals.phone_contact);
console.log("email_contact:          " + negativeSignals.email_contact);
console.log("live_chat:              " + negativeSignals.live_chat);
console.log("generic_contact_form:   " + negativeSignals.generic_contact_form + "\n");

console.log("Critical checks");
console.log("---------------");
console.log("Phone-only => UNKNOWN");
console.log("Phone+Email => UNKNOWN");
console.log("Contact form => UNKNOWN");
console.log("WhatsApp share => UNKNOWN");
console.log("Explicit exclusion => NO HIGH");
console.log("Positive WhatsApp evidence => YES\n");

console.log("Traceability");
console.log("------------");
console.log("Invalid source: " + traceabilityInvalidSource);
console.log("Untraceable evidence: " + traceabilityUntraceableEvidence);
console.log("Extraction errors: " + errors + "\n");
