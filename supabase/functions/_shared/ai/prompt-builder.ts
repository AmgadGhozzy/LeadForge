// ──────────────────────────────────────────────
// Prompt Builder (Phase 1.7)
// ──────────────────────────────────────────────

import { CanonicalBusinessProfile } from '../types/canonical.ts';
import { Evidence } from '../intelligence/evidence/types.ts';

export class PromptBuilder {
  static buildUserPrompt(profile: CanonicalBusinessProfile, evidence: Evidence[]): string {
    // We strip out internal properties like hashes and raw page content 
    // that the LLM doesn't need for insight generation (since facts are pre-computed).
    return JSON.stringify(
      {
        identity: profile.identity,
        reputation: profile.reputation,
        digitalPresence: {
          website: profile.digitalPresence.website,
          pagesScraped: profile.digitalPresence.pagesScraped,
          pageSummaries: profile.digitalPresence.pages.map(p => ({
            url: p.url,
            type: p.pageType,
            title: p.title
            // 'content' removed to force LLM to rely strictly on Verified Evidence for factual capabilities
          }))
        },
        contacts: profile.contacts,
        technologies: profile.technologies,
        verified_evidence: evidence.map(e => ({
          type: e.type,
          polarity: e.polarity,
          claim: e.claim,
          confidence: e.confidence,
          coverage_score: e.coverage_score
        })),
        knowledge_score: profile.knowledgeScore
      },
      null,
      2
    );
  }
}
