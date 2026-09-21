import type { WhatsappEvidence, WhatsappEvaluationResult } from "./whatsapp-evidence.js";

export const WHATSAPP_CONTRACT_VERSION = "1.0.0";

export interface FrozenWhatsappReference {
  snapshot_sha256: string;
  prompt_sha256: string;
  model: string;
  extractor_version: string;
  reference_contract_version: string;
  generated_at: string;
  evidence: WhatsappEvidence;
  evaluation: WhatsappEvaluationResult;
  input_projection_version?: string;
  input_projection_sha256?: string;
}
