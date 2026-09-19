// ──────────────────────────────────────────────
// AI Output Validator (Phase 1.6 - Knowledge Layer)
// ──────────────────────────────────────────────

import { ConsultantResponse } from './types.ts';

export class AiValidator {
  
  static validate(raw: any): ConsultantResponse {
    if (!raw || typeof raw !== 'object') {
      throw new Error('AI output must be a JSON object');
    }

    const requiredStrings = ['business_summary', 'sales_angle', 'score_explanation', 'confidence_score'];
    for (const field of requiredStrings) {
      if (typeof raw[field] !== 'string' || raw[field].trim() === '') {
        throw new Error(`Missing or invalid string field: ${field}`);
      }
    }

    if (typeof raw.business_summary_confidence !== 'number' || raw.business_summary_confidence < 0 || raw.business_summary_confidence > 100) {
      throw new Error(`Invalid business_summary_confidence: ${raw.business_summary_confidence}`);
    }

    if (typeof raw.lead_score !== 'number' || raw.lead_score < 0 || raw.lead_score > 100) {
      throw new Error(`Invalid lead_score: ${raw.lead_score}`);
    }

    if (!['HIGH', 'MEDIUM', 'LOW'].includes(raw.confidence_score)) {
      throw new Error(`Invalid confidence_score: ${raw.confidence_score}`);
    }

    return raw as ConsultantResponse;
  }

  private static validateEvidenceItem(item: any) {
    if (!item || typeof item !== 'object') throw new Error('Item must be an object');
    
    if (typeof item.insight !== 'string' || item.insight.trim() === '') throw new Error('Missing insight');
    
    const validSeverities = ['Critical', 'High', 'Medium', 'Low', 'Info'];
    if (!validSeverities.includes(item.severity)) throw new Error(`Invalid severity: ${item.severity}`);

    if (item.technical_fix && typeof item.technical_fix !== 'string') throw new Error('Invalid technical_fix');
    
    if (!Array.isArray(item.tags)) throw new Error('tags must be an array of strings');
    item.tags.forEach((tag: any) => {
      if (typeof tag !== 'string') throw new Error('tags must be strings');
    });

    if (!item.confidence || typeof item.confidence !== 'object') throw new Error('Missing confidence object');
    if (typeof item.confidence.score !== 'number' || item.confidence.score < 0 || item.confidence.score > 100) {
      throw new Error('Invalid confidence.score');
    }
    if (typeof item.confidence.reason !== 'string' || item.confidence.reason.trim() === '') {
      throw new Error('Missing confidence.reason');
    }

    const validLevels = ['VERIFIED', 'STRONG', 'MEDIUM', 'WEAK', 'UNKNOWN'];
    if (!validLevels.includes(item.evidence_level)) {
      // Gemini sometimes confuses evidence_level with severity (e.g. returns "LOW").
      // Coerce to 'MEDIUM' rather than failing the entire analysis.
      item.evidence_level = 'MEDIUM';
    }

    if (typeof item.detection_method !== 'string' || item.detection_method.trim() === '') {
      throw new Error('Missing detection_method');
    }

    // Business Impact
    if (!item.business_impact || typeof item.business_impact !== 'object') {
      throw new Error('Missing or invalid business_impact object');
    }
    const validImpacts = ['Revenue', 'Operations', 'Marketing', 'SEO', 'Customer Service', 'Automation', 'Sales'];
    // Lenient check: coerce unknown impact_type to 'Operations' rather than throwing.
    if (!validImpacts.includes(item.business_impact.impact_type)) {
      item.business_impact.impact_type = 'Operations';
    }
    if (typeof item.business_impact.impact_score !== 'number' || item.business_impact.impact_score < 0 || item.business_impact.impact_score > 100) {
      throw new Error(`Invalid impact_score: ${item.business_impact.impact_score}`);
    }
    if (typeof item.business_impact.description !== 'string' || item.business_impact.description.trim() === '') {
      throw new Error('Missing impact description');
    }

    // Metrics
    if (item.opportunity_metrics) {
      const validTiers = ['Low', 'Medium', 'High'];
      if (!validTiers.includes(item.opportunity_metrics.estimated_effort)) throw new Error('Invalid estimated_effort');
      if (!validTiers.includes(item.opportunity_metrics.estimated_roi)) throw new Error('Invalid estimated_roi');
    }

    // Offers
    if (item.suggested_offers) {
      if (!Array.isArray(item.suggested_offers)) throw new Error('suggested_offers must be an array');
      item.suggested_offers.forEach((offer: any, idx: number) => {
        if (typeof offer.offer_slug !== 'string') throw new Error(`Invalid offer_slug at index ${idx}`);
        if (typeof offer.offer_name !== 'string') throw new Error(`Invalid offer_name at index ${idx}`);
        if (typeof offer.confidence !== 'number' || offer.confidence < 0 || offer.confidence > 100) {
          throw new Error(`Invalid confidence at index ${idx}`);
        }
      });
    }

    // Signals are excluded from responseSchema (to avoid "too many states" error),
    // so Gemini may not always emit them. Default to empty arrays.
    if (!Array.isArray(item.positive_signals)) item.positive_signals = [];
    if (!Array.isArray(item.negative_signals)) item.negative_signals = [];
    
    // Check signals
    const validSources = ['RULE_ENGINE', 'AI', 'SCRAPER', 'GOOGLE', 'HYBRID', 'AI_INFERENCE'];
    [...item.positive_signals, ...item.negative_signals].forEach((sig: any, idx: number) => {
      if (!sig.type || typeof sig.type !== 'string') throw new Error(`Signal ${idx} missing type`);
      if (!sig.source || typeof sig.source !== 'string') throw new Error(`Signal ${idx} missing source`);
      if (typeof sig.confidence !== 'number' || sig.confidence < 0 || sig.confidence > 100) throw new Error(`Signal ${idx} invalid confidence`);
      // Lenient: coerce unknown confidence_source to 'AI' rather than throwing.
      if (!validSources.includes(sig.confidence_source)) {
        sig.confidence_source = 'AI';
      }
      if (sig.page_url && typeof sig.page_url !== 'string') throw new Error(`Signal ${idx} invalid page_url`);
      if (sig.snapshot_id && typeof sig.snapshot_id !== 'string') throw new Error(`Signal ${idx} invalid snapshot_id`);
    });
  }
}
