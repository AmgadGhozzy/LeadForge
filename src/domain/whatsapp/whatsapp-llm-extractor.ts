import { GoogleGenAI } from "@google/genai";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import type { WhatsappEvidence, WhatsappSignalType } from "./whatsapp-evidence.js";

const MODEL = process.env.VALIDATION_REFERENCE_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.VALIDATION_GEMINI_API_KEY;
const KEY_FILE = process.env.VALIDATION_GOOGLE_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;

export const WHATSAPP_EXTRACTION_PROMPT_VERSION = "2.0.0";
export const WHATSAPP_EXTRACTOR_VERSION = "2.0.1";
export const INPUT_PROJECTION_VERSION = "1.0.1";

export const WHATSAPP_EXTRACTION_PROMPT = `
You are an evidence extraction component. Your task is to analyze the provided text and HTML content of a business website and extract explicit contact signals according to a strict schema.

You MUST extract only signals directly supported by the supplied snapshot.
Do not infer:
- WhatsApp usage from a mobile number
- WhatsApp usage from the country
- WhatsApp usage from a phone number
- WhatsApp absence from missing text
- WhatsApp exclusion from ordinary phone/email/contact forms

Every signal MUST cite:
- source page (e.g., "home", "contact")
- exact evidence text or structural evidence (e.g., the exact HTML snippet or text)
- reason (A brief explanation of why this qualifies as the signal)

IMPORTANT — EXPLICIT EXCLUSION:
Only emit whatsapp_explicit_exclusion when the snapshot contains an explicit statement that WhatsApp is not supported, not accepted, not available, or is otherwise explicitly excluded.
Never emit whatsapp_explicit_exclusion merely because:
- WhatsApp was not found
- no WhatsApp link exists
- no WhatsApp number exists
- only phone/email/contact form is present
- the page is silent about WhatsApp
- you could not find supporting evidence

If there is no explicit exclusion statement, OMIT the signal entirely.
The evidence field MUST quote or closely reproduce the actual exclusion statement from the snapshot. Never use meta-statements such as "No evidence found", "Not mentioned", "Not present", or "the site does not state...".

IMPORTANT — CARDINALITY:
You are extracting evidence-level signals, not enumerating DOM elements.
Do not enumerate every occurrence of a contact method, form, link, widget, or text fragment.
For each signal type on each page, emit at most ONE representative signal supported by the strongest traceable evidence.
One factual observation should produce one signal. Repeated DOM occurrences of the same fact do not produce additional signals.

OUTPUT STRUCTURE:
You must output a JSON object with exactly two arrays: "positiveSignals" and "negativeSignals".

POSITIVE SIGNALS (Must only contain these types):
- whatsapp_business_link: Actionable link like wa.me/<number> or api.whatsapp.com/send. Ignore generic social sharing links without a business number.
- whatsapp_widget: A dedicated WhatsApp chat widget or button.
- whatsapp_explicit_cta: Explicit CTA text associated with the business (e.g., "Chat with us on WhatsApp: +1234").

NEGATIVE SIGNALS (Must only contain these types):
- whatsapp_explicit_exclusion: The site explicitly states WhatsApp is not supported ("We do not use WhatsApp").
- explicit_phone_contact_cta: Prominently advertised phone number or explicit phone instruction.
- explicit_email_contact_cta: Prominently advertised email instruction.
- live_chat: Presence of a non-WhatsApp live chat widget.
- generic_contact_form: A standard web form for contacting the business.
`;

export function getPromptHash(): string {
  return createHash('sha256').update(WHATSAPP_EXTRACTION_PROMPT).digest('hex');
}

export interface SnapshotProjection {
  text: string;
  sha256: string;
  pageCount: number;
}

/**
 * Builds a deterministic, domain-agnostic compacted projection of a snapshot.
 *
 * Invariants:
 *   - Same snapshot  → same text  → same sha256 (deterministic)
 *   - pages_in_projection === pages_in_snapshot  (no page drop)
 *   - All links retained (href + text)
 *   - All iframe srcs retained
 *   - All form metadata retained (action, method, field names)
 *   - visible_text: first 5,000 chars per page
 *   - html: first 3,000 chars per page
 *
 * This function must NOT contain any domain-specific logic (e.g., WhatsApp).
 */
export function buildSnapshotProjection(snapshot: any): SnapshotProjection {
  const parts: string[] = [];

  for (const page of snapshot.pages) {
    const lines: string[] = [];
    lines.push(`=== PAGE: ${page.route} ===`);
    lines.push(`URL: ${page.url || ''}`);
    lines.push('');

    // --- VISIBLE TEXT (5,000 chars) ---
    const visibleText = (page.visible_text || '').substring(0, 5000);
    lines.push('VISIBLE TEXT:');
    lines.push(visibleText);
    lines.push('');

    // --- LINKS (all hrefs + anchor text) ---
    const links: string[] = [];
    for (const link of (page.links || [])) {
      if (typeof link === 'string') {
        const href = link.trim();
        if (href) links.push(`- ${href}`);
        continue;
      }
      const text = (link.text || '').trim();
      const href = (link.href || '').trim();
      if (href) links.push(`- [${text}] ${href}`);
    }
    if (links.length > 0) {
      lines.push('LINKS:');
      lines.push(...links);
      lines.push('');
    }

    // --- IFRAMES (all src) ---
    const iframes: string[] = [];
    for (const iframe of (page.iframes || [])) {
      const src = (iframe.src || iframe || '').toString().trim();
      if (src) iframes.push(`- ${src}`);
    }
    if (iframes.length > 0) {
      lines.push('IFRAMES:');
      lines.push(...iframes);
      lines.push('');
    }

    // --- FORMS (action, method, field names) ---
    const forms: string[] = [];
    for (const form of (page.forms || [])) {
      const action = (form.action || '').trim();
      const method = (form.method || 'GET').trim().toUpperCase();
      const fields = (form.fields || form.inputs || []).map((f: any) =>
        (f.name || f.id || f.placeholder || '').trim()
      ).filter(Boolean);
      forms.push(`- action=${action} method=${method} fields=[${fields.join(', ')}]`);
    }
    if (forms.length > 0) {
      lines.push('FORMS:');
      lines.push(...forms);
      lines.push('');
    }

    // --- HTML EXCERPT (3,000 chars) ---
    const htmlExcerpt = (page.html || '').substring(0, 3000);
    lines.push('HTML EXCERPT:');
    lines.push(htmlExcerpt);
    lines.push('');

    parts.push(lines.join('\n'));
  }

  const text = parts.join('\n');
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');

  return { text, sha256, pageCount: snapshot.pages.length };
}

export class ReferenceExtractionError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = "ReferenceExtractionError";
  }
}

const evidenceSchema = {
  type: "OBJECT",
  properties: {
    positiveSignals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { 
            type: "STRING", 
            enum: ["whatsapp_business_link", "whatsapp_widget", "whatsapp_explicit_cta"] 
          },
          strength: { type: "STRING", enum: ["STRONG", "MEDIUM", "WEAK"] },
          source: { type: "STRING" },
          evidence: { type: "STRING" },
          reason: { type: "STRING" }
        },
        required: ["type", "strength", "source", "evidence", "reason"]
      }
    },
    negativeSignals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { 
            type: "STRING", 
            enum: ["whatsapp_explicit_exclusion", "explicit_phone_contact_cta", "explicit_email_contact_cta", "live_chat", "generic_contact_form"] 
          },
          strength: { type: "STRING", enum: ["STRONG", "MEDIUM", "WEAK"] },
          source: { type: "STRING" },
          evidence: { type: "STRING" },
          reason: { type: "STRING" }
        },
        required: ["type", "strength", "source", "evidence", "reason"]
      }
    }
  },
  required: ["positiveSignals", "negativeSignals"]
};

function normalizeWhitespace(str: string): string {
  return (str || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function validateContractConstraints(evidence: WhatsappEvidence) {
  const allSignals = [...evidence.positiveSignals, ...evidence.negativeSignals];
  const counts = new Map<string, number>();

  for (const sig of allSignals) {
    // 1. Cardinality Validation (Max 1 per source, type)
    const key = `${sig.source}::${sig.type}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (counts.get(key)! > 1) {
      throw new ReferenceExtractionError(`Cardinality violation: More than 1 signal of type '${sig.type}' on page '${sig.source}'. Max 1 allowed per type per page.`);
    }

    // 2. Semantic Validation against Meta-Evidence for explicit exclusions
    if (sig.type === "whatsapp_explicit_exclusion") {
      const e = normalizeWhitespace(sig.evidence);
      const r = normalizeWhitespace(sig.reason);
      
      const bannedMetaPhrases = [
        "no evidence found",
        "no direct evidence found",
        "not mentioned",
        "not present",
        "could not find",
        "does not state",
        "is silent",
        "no whatsapp link"
      ];
      
      for (const phrase of bannedMetaPhrases) {
        if (e.includes(phrase) || r.includes(phrase)) {
          throw new ReferenceExtractionError(`Semantic violation: Meta-evidence detected for explicit exclusion on '${sig.source}'. Found banned phrase: "${phrase}". Evidence must be a factual website statement.`);
        }
      }
    }
  }
}

export function validateExtractedSignals(evidence: WhatsappEvidence, snapshot: any) {
  const routes = snapshot.pages.map((p: any) => p.route);
  
  // We must validate traceability against the projection, since that is what the LLM sees.
  const proj = buildSnapshotProjection(snapshot);
  const normalizedProj = normalizeWhitespace(proj.text);
  
  const allSignals = [...evidence.positiveSignals, ...evidence.negativeSignals];
  for (const sig of allSignals) {
    if (!routes.includes(sig.source)) {
      throw new ReferenceExtractionError(`LLM hallucinated source: ${sig.source}. Valid routes: ${routes.join(', ')}`);
    }

    const normalizedEvidence = normalizeWhitespace(sig.evidence);
    const evidenceWords = normalizedEvidence.split(' ').filter(w => w.length > 2);
    
    if (evidenceWords.length > 0) {
      let foundWords = 0;
      for (const w of evidenceWords) {
        if (normalizedProj.includes(w)) {
          foundWords++;
        }
      }
      
      if (foundWords / evidenceWords.length < 0.3) {
         throw new ReferenceExtractionError(`LLM hallucinated evidence on ${sig.source}: "${sig.evidence}" is not traceable to the page content.`);
      }
    }
  }
}

export async function extractWhatsappSignals(
  snapshot: any,
  observability: WhatsappEvidence['observability']
): Promise<WhatsappEvidence> {
  let ai: GoogleGenAI;
  
  if (KEY_FILE && fs.existsSync(KEY_FILE)) {
    const keyData = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    ai = new GoogleGenAI({
      vertexai: {
        project: keyData.project_id,
        location: process.env.VALIDATION_VERTEX_LOCATION || 'us-central1'
      }
    });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = KEY_FILE;
  } else if (API_KEY) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } else {
    throw new ReferenceExtractionError("Missing VALIDATION_GEMINI_API_KEY or valid GOOGLE_APPLICATION_CREDENTIALS / VALIDATION_GOOGLE_KEY_FILE environment variable.");
  }

  const projection = buildSnapshotProjection(snapshot);
  const content = "WEBSITE SNAPSHOT:\n\n" + projection.text;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { role: 'user', parts: [{ text: WHATSAPP_EXTRACTION_PROMPT + "\n\n" + content }] }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: evidenceSchema as any,
        temperature: 0.0,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini.");
    }

    const parsed = JSON.parse(text);
    
    if (!Array.isArray(parsed.positiveSignals) || !Array.isArray(parsed.negativeSignals)) {
      throw new Error("Invalid schema: missing positiveSignals or negativeSignals array");
    }

    for (const sig of [...parsed.positiveSignals, ...parsed.negativeSignals]) {
      if (!sig.type || !sig.strength || !sig.source || !sig.evidence || !sig.reason) {
        throw new Error(`Invalid schema: signal missing required fields. ${JSON.stringify(sig)}`);
      }
    }

    const evidence: WhatsappEvidence = {
      observability,
      positiveSignals: parsed.positiveSignals,
      negativeSignals: parsed.negativeSignals
    };

    validateContractConstraints(evidence);
    validateExtractedSignals(evidence, snapshot);

    return evidence;
  } catch (error) {
    console.error("LLM Extraction failed:", error);
    throw new ReferenceExtractionError("Failed to extract signals using Gemini.", error);
  }
}
