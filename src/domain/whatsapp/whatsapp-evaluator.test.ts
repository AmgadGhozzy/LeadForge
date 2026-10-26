import { it as test, describe } from "vitest";
import assert from "node:assert/strict";
import { evaluateWhatsappContract } from "./whatsapp-evaluator.js";
import type { WhatsappEvidence } from "./whatsapp-evidence.js";

const FULL_OBSERVABILITY = {
  home: true,
  contact: true,
  relevantPages: true,
  coverage: "FULL" as const
};

describe("Whatsapp Contract Evaluator - Golden Fixtures", () => {
  test("Direct wa.me CTA -> YES", () => {
    const evidence: WhatsappEvidence = {
      observability: FULL_OBSERVABILITY,
      positiveSignals: [{
        type: "whatsapp_business_link",
        strength: "STRONG",
        source: "home",
        evidence: "https://wa.me/123456789",
        reason: "Direct actionable link"
      }],
      negativeSignals: []
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "YES");
  });

  test("WhatsApp widget -> YES", () => {
    const evidence: WhatsappEvidence = {
      observability: FULL_OBSERVABILITY,
      positiveSignals: [{
        type: "whatsapp_widget",
        strength: "STRONG",
        source: "home",
        evidence: "Chat widget in corner",
        reason: "Dedicated widget"
      }],
      negativeSignals: []
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "YES");
  });

  test("WhatsApp text + number -> YES", () => {
    const evidence: WhatsappEvidence = {
      observability: FULL_OBSERVABILITY,
      positiveSignals: [{
        type: "whatsapp_explicit_cta",
        strength: "STRONG",
        source: "contact",
        evidence: "Chat with us on WhatsApp: +1234",
        reason: "Explicit CTA"
      }],
      negativeSignals: []
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "YES");
  });

  test("WhatsApp hidden on footer -> YES", () => {
    const evidence: WhatsappEvidence = {
      observability: FULL_OBSERVABILITY,
      positiveSignals: [{
        type: "whatsapp_business_link",
        strength: "STRONG",
        source: "home",
        evidence: "href='https://wa.me/123'",
        reason: "Actionable link in footer"
      }],
      negativeSignals: [{
        type: "explicit_phone_contact_cta",
        strength: "MEDIUM",
        source: "home",
        evidence: "Call us today",
        reason: "Phone CTA"
      }]
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "YES");
  });

  test("Generic WhatsApp share -> UNKNOWN", () => {
    const evidence: WhatsappEvidence = {
      observability: FULL_OBSERVABILITY,
      positiveSignals: [], // explicitly excluded from extraction as positive
      negativeSignals: []
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "UNKNOWN");
  });

  test("Mobile number without explicit label -> UNKNOWN", () => {
    const evidence: WhatsappEvidence = {
      observability: FULL_OBSERVABILITY,
      positiveSignals: [], // Ambiguous
      negativeSignals: []
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "UNKNOWN");
  });

  test("Blocked contact page -> UNKNOWN", () => {
    const evidence: WhatsappEvidence = {
      observability: {
        home: true,
        contact: false,
        relevantPages: false,
        coverage: "BLOCKED"
      },
      positiveSignals: [],
      negativeSignals: [{
        type: "explicit_phone_contact_cta",
        strength: "MEDIUM",
        source: "home",
        evidence: "Call us",
        reason: "Phone number listed"
      }]
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "UNKNOWN");
  });

  test("Contact form only -> UNKNOWN", () => {
    const evidence: WhatsappEvidence = {
      observability: FULL_OBSERVABILITY,
      positiveSignals: [],
      negativeSignals: [{
        type: "generic_contact_form",
        strength: "WEAK",
        source: "contact",
        evidence: "<form>",
        reason: "Standard form"
      }]
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "UNKNOWN");
  });

  test("Phone + email + form, full coverage -> UNKNOWN", () => {
    const evidence: WhatsappEvidence = {
      observability: FULL_OBSERVABILITY,
      positiveSignals: [],
      negativeSignals: [
        {
          type: "explicit_phone_contact_cta",
          strength: "MEDIUM",
          source: "contact",
          evidence: "Call us at +123",
          reason: "Phone prominently advertised"
        },
        {
          type: "explicit_email_contact_cta",
          strength: "MEDIUM",
          source: "contact",
          evidence: "Email us at a@b.com",
          reason: "Email prominently advertised"
        },
        {
          type: "generic_contact_form",
          strength: "WEAK",
          source: "contact",
          evidence: "Contact form",
          reason: "Form present"
        }
      ]
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "UNKNOWN");
  });

  test("Explicit phone/email-only policy + full coverage -> NO / HIGH", () => {
    const evidence: WhatsappEvidence = {
      observability: FULL_OBSERVABILITY,
      positiveSignals: [],
      negativeSignals: [{
        type: "whatsapp_explicit_exclusion",
        strength: "STRONG",
        source: "contact",
        evidence: "Appointments are available by phone or email. We do not provide WhatsApp support.",
        reason: "Explicit exclusion policy"
      }]
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "NO");
    assert.ok(result.confidence >= 0.9);
  });

  test("Poor coverage + no WhatsApp -> UNKNOWN", () => {
    const evidence: WhatsappEvidence = {
      observability: {
        home: true,
        contact: false,
        relevantPages: false,
        coverage: "PARTIAL"
      },
      positiveSignals: [],
      negativeSignals: []
    };
    const result = evaluateWhatsappContract(evidence);
    assert.strictEqual(result.decision, "UNKNOWN");
  });
});
