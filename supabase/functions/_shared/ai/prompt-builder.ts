// ──────────────────────────────────────────────
// Prompt Builder (Phase 1.7)
// ──────────────────────────────────────────────

import { CanonicalBusinessProfile } from '../types/canonical.ts';

export class PromptBuilder {
  static buildUserPrompt(profile: CanonicalBusinessProfile): string {
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
            title: p.title,
            content: p.content
          }))
        },
        contacts: profile.contacts,
        technologies: profile.technologies,
        verified_facts: profile.facts,
        knowledge_score: profile.knowledgeScore
      },
      null,
      2
    );
  }
}
