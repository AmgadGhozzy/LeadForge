export type WhatsappSignalType = 
  | "whatsapp_business_link"
  | "whatsapp_widget"
  | "whatsapp_explicit_cta"
  | "whatsapp_explicit_exclusion"
  | "explicit_phone_contact_cta"
  | "explicit_email_contact_cta"
  | "live_chat"
  | "generic_contact_form";

export type WhatsappSignalStrength = "STRONG" | "MEDIUM" | "WEAK";

export interface WhatsappSignal {
  type: WhatsappSignalType;
  strength: WhatsappSignalStrength;
  source: string;
  evidence: string;
  reason: string;
}

export interface WhatsappEvidence {
  observability: {
    home: boolean;
    contact: boolean;
    relevantPages: boolean;
    coverage: "FULL" | "PARTIAL" | "BLOCKED";
  };
  positiveSignals: WhatsappSignal[];
  negativeSignals: WhatsappSignal[];
}

export type WhatsappDecision = "YES" | "NO" | "UNKNOWN";

export interface WhatsappEvaluationResult {
  decision: WhatsappDecision;
  confidence: number;
  reasoning: string[];
}
