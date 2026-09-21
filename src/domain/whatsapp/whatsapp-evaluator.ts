import type { WhatsappEvidence, WhatsappEvaluationResult } from "./whatsapp-evidence.js";

export function evaluateWhatsappContract(evidence: WhatsappEvidence): WhatsappEvaluationResult {
  const reasoning: string[] = [];

  // Check Positive Evidence First
  const hasStrongPositive = evidence.positiveSignals.some(s => s.strength === "STRONG");

  if (hasStrongPositive) {
    reasoning.push("Found strong positive WhatsApp evidence.");
    return {
      decision: "YES",
      confidence: 1.0,
      reasoning
    };
  }

  // Without strong positive, observability becomes critical
  if (evidence.observability.coverage !== "FULL") {
    reasoning.push(`Observability is ${evidence.observability.coverage}. Cannot assert NO without full coverage.`);
    return {
      decision: "UNKNOWN",
      confidence: 0,
      reasoning
    };
  }

  // We have FULL observability and NO strong positive evidence.
  // Check for Explicit Exclusion
  const hasExplicitExclusion = evidence.negativeSignals.some(s => s.type === "whatsapp_explicit_exclusion");

  if (hasExplicitExclusion) {
    reasoning.push("Found explicit WhatsApp exclusion policy.");
    return {
      decision: "NO",
      confidence: 0.9, // HIGH CONFIDENCE
      reasoning
    };
  }

  // We have FULL observability, NO strong positive, and NO explicit exclusion.
  // Any other combination (phone, email, form) is UNKNOWN
  reasoning.push("No explicit exclusion found. Alternative contact methods do not prove WhatsApp absence.");
  return {
    decision: "UNKNOWN",
    confidence: 0,
    reasoning
  };
}
