# Gate 5.12.1 — Legacy Commercial Inference Bypass Audit

**Status:** INVESTIGATION COMPLETE — BYPASS CONFIRMED  
**Type:** READ-ONLY — ZERO CODE CHANGES — ZERO DB MUTATIONS  
**Opened:** 2026-09-23  
**Trigger:** Production observation on مجمع نهج الطبي showing `Automated Lead Nurturing` in Opportunity Matrix despite no Evidence Gate authorizing it.  
**Follows:** Gate 5.9 (DBPG/QIG activation), Gate 5.11 (production monitoring)  
**Precedes:** Gate 5.12.2 (Remediation Design), Gate 5.12.3 (Implementation)

---

## 0. Mandate

This gate is strictly forensic. Its job is to answer one question:

> **Is there any path from source data to a commercial Offer recommendation that does NOT pass through the Opportunity Engine?**

No fixes. No schema changes. No offer catalog changes. No prompt changes.  
Read. Map. Classify. Report.

---

## 1. Authoritative Data-Flow Map

The intended architecture (Gate 5.9 sealed):

```
Evidence Engine
    ↓
evaluateProductionOpportunities()    ← ONLY authorized entry to commercial recommendations
    ↓
OpportunityEvaluationOutput
    ↓
Offer Matching
    ↓
Sales Assets / Opportunity Matrix
```

What the code actually implements (traced from source):

```
Analysis Pipeline                 Sales Pipeline
─────────────────                 ──────────────
ProfileBuilder.build()            AnalysisRepo.getFullAnalysis()
    ↓                                 ↓
EvidenceEngine.extractEvidence()  analysis.analysis_items   ← PERSISTED from LLM
    ↓                                 ↓
evaluateOpportunities()  ←STUB→   analysis_items.type       ← 'AI_OPPORTUNITY'
    returns []                       'AUTOMATION_OPPORTUNITY'
    ↓                                 ↓
OpportunityOutput = EMPTY         SalesService.generateSales()
    ↓                                 ↓
NOT PERSISTED                     OfferMatcher.match(offers, {
NOT FORWARDED                         category,
                                      analysis: ConsultantAnalysisResult,  ← from LLM
                                      capabilities,
                                      technologies
                                  })
                                      ↓
                                  GeminiService.generateSales()
                                      ↓
                                  generated_messages table
                                      ↓
                                  Opportunity Matrix (UI)
```

**Finding:** The two pipelines are completely disconnected. `evaluateProductionOpportunities()` output is **never consumed** by `SalesService`.

---

## 2. Input Classification Table for OfferMatcher

Every input that `OfferMatcher.match()` accepts and its evidence status:

| Input | Source | Gate-Authorized? | Evidence-Backed? | Can Produce Offer? | Notes |
|---|---|---|---|---|---|
| `category` | DB (businesses.categories) | ✅ | ✅ | ✅ | Factual — business registration |
| `capabilities` | Detection Engine / Evidence | ✅ | ✅ | ✅ | Deterministic scraped signals |
| `technologies` | Detection Engine / Evidence | ✅ | ✅ | ✅ | Deterministic scraped signals |
| `analysis.weaknesses` | **LLM (consultant-v2)** | ❌ | ❌ | **✅ ← BYPASS** | `matchWeaknesses()` — lines 44–50 in offer-matcher.ts |
| `analysis.ai_opportunities` | **LLM (consultant-v2)** | ❌ | ❌ | **✅ ← BYPASS** | `matchAiOpportunities()` — lines 66–71 in offer-matcher.ts |
| `analysis.lead_score` | **LLM (consultant-v2)** | ❌ | N/A | **✅ ← BYPASS** | `lead_score >= 70` bonus — lines 73–77 in offer-matcher.ts |
| `analysis.automation_opportunities` | Stored from LLM but NOT read by OfferMatcher | N/A | ❌ | ❌ | Not a direct OfferMatcher input — but persisted in `analysis_items` |
| `evaluateProductionOpportunities()` output | Opportunity Engine | ✅ | ✅ | ❌ ← NOT WIRED | Computed but **never passed to OfferMatcher** |

---

## 3. Identified Bypass Paths — Exact File:Line

### BYPASS-1: LLM Weakness → OfferMatcher Score
**File:** `supabase/functions/_shared/services/offer-matcher.ts`  
**Lines:** 44–50  
**Method:** `matchWeaknesses(offer.problems, input.analysis.weaknesses)`  
**Mechanism:** `analysis.weaknesses` comes from `consultant-v2` LLM response, stored in `analysis_items` as type `WEAKNESS`, re-hydrated by `getFullAnalysis()` into `analysis_items` array, then passed to `OfferMatcher` via `SalesService` line 79–88.  
**Effect:** A LLM-generated weakness insight can add up to **+45 points** to an offer's match score.  
**Verdict:** `PROHIBITED COMMERCIAL INFERENCE`

---

### BYPASS-2: LLM AI_OPPORTUNITY → OfferMatcher Score
**File:** `supabase/functions/_shared/services/offer-matcher.ts`  
**Lines:** 66–71  
**Method:** `matchAiOpportunities(offer, input.analysis.ai_opportunities)`  
**Mechanism:** `analysis.ai_opportunities` are stored in `analysis_items` as type `AI_OPPORTUNITY`, and the `getFullAnalysis()` query in `analysis-repo.ts` (line 67) uses `SELECT *` which returns all types including `AI_OPPORTUNITY`. SalesService (lines 81–82) filters them and passes to OfferMatcher.  
**Effect:** A LLM-generated "AI opportunity" insight can add **+20 points** to an offer's match score.  
**Verdict:** `PROHIBITED COMMERCIAL INFERENCE`

---

### BYPASS-3: LLM lead_score → OfferMatcher Bonus
**File:** `supabase/functions/_shared/services/offer-matcher.ts`  
**Lines:** 73–77  
**Mechanism:** `input.analysis.lead_score >= 70` adds a flat +10 bonus. `lead_score` is produced by the LLM (consultant-v2 Step 3), stored in `website_analyses.lead_score`, re-read by `getFullAnalysis()`.  
**Effect:** A high LLM-generated score boosts every offer's match score by +10.  
**Verdict:** `SCORE CONTRACT VIOLATION` — lead_score is a Prioritization signal, not an Opportunity signal. Using it as an offer-matching input conflates the two contracts.

---

### BYPASS-4: Opportunity Engine Output is Orphaned
**File:** `supabase/functions/_shared/services/analysis-service.ts`  
**Lines:** 83–84  
**Code:**
```typescript
const opportunities = evaluateOpportunities(evidenceList as any);
this.logger.info('analysis.opportunities_evaluated', { ... });
```
**File:** `supabase/functions/_shared/intelligence/opportunity/engine.ts`  
**Lines:** 78–82  
**Code:**
```typescript
export function evaluateOpportunities(_evidence): readonly GeneratedOpportunity[] {
  return []; // STUB — legacy adapter
}
```
**Mechanism:** `analysis-service.ts` calls the **legacy stub** (`evaluateOpportunities`), not `evaluateProductionOpportunities`. The production function with DBPG/QIG rules is never called from the analysis pipeline. Its output is logged and discarded — never persisted, never forwarded to SalesService.  
**Effect:** DBPG/QIG, the only Gate-authorized rules, produce zero influence on any Offer recommendation in production.  
**Verdict:** `ARCHITECTURAL SEVERANCE` — the Opportunity Engine is activated but disconnected.

---

## 4. Blast Radius

### Every business analyzed after Gate 5.9 activation
All businesses that went through `AnalysisService.runAnalysis()` after DBPG/QIG were activated (Gate 5.9) have a `website_analyses` row whose `analysis_items` contain LLM-generated `AI_OPPORTUNITY` and `WEAKNESS` items.

When `generate-sales` is subsequently called for any of these businesses:
- `getFullAnalysis()` returns those LLM items
- `SalesService` passes them to `OfferMatcher`
- `OfferMatcher` uses BYPASS-1 and BYPASS-2 to influence offer selection
- **Every generated_message in the DB was influenced by LLM inference, not Opportunity Engine output**

### UI surfaces impacted
| UI Surface | Impact |
|---|---|
| Opportunity Matrix | Shows offers selected via BYPASS path |
| Next Best Action | May reflect LLM-scored offers |
| Sales Assets (email/whatsapp/cold call) | Generated by Gemini based on BYPASS-selected top-3 offers |
| Lead Score display | Displayed as-is but semantically misrepresented as commercial readiness |
| Messages Hub | All stored messages are BYPASS-path products |

### What is NOT impacted
| Component | Status |
|---|---|
| Evidence Engine | ✅ Correct — evidence is deterministic |
| DBPG / QIG rule logic | ✅ Correct — rules evaluate correctly |
| Lead prioritization / next_action | ✅ Separate path via `PriorityCalculator` |
| Evidence persistence (`evidence` table) | ✅ Correct |
| Opportunity evaluation correctness | ✅ Correct — but orphaned |

---

## 5. LLM Prompt Scope Audit

**consultant-v2 system instruction** (lines 36–37):
```
3. NO OPPORTUNITY INFERENCE.
   You must not invent pain points, deduce new sales opportunities, or pick sales offers.
```

And yet `ConsultantAnalysisResult` type (from `LegacyConsultantAnalysisResult` in `ai/types.ts` lines 68–81) includes:
```typescript
weaknesses?: EvidenceItem[];
automation_opportunities?: EvidenceItem[];
ai_opportunities?: EvidenceItem[];
recommended_offer?: string;
```

**Critical finding:** The prompt says "NO OPPORTUNITY INFERENCE" but the **response schema** fed to Gemini (in the OLD `gemini-service.ts`) included `strengths`, `weaknesses`, `ai_opportunities`, `automation_opportunities` as ARRAY fields. Gemini was structurally invited to produce opportunity items even when the system prompt said not to.

**Current state (post-refactor):** The new `gemini-service.ts` (post Gate 5.12.1 rewrite) uses only the `ConsultantResponse` type, which does NOT include `weaknesses`, `ai_opportunities`, or `automation_opportunities`. However, `AiValidator.validate()` only validates and returns `ConsultantResponse`. The LLM items that were saved under the old schema still exist in the DB.

**Sub-finding:** The `analysis_items` currently stored in the DB were produced under the old schema. Future calls to `generate-sales` will still read those legacy items via `getFullAnalysis()` → `analysis_items(*)`.

---

## 6. Authoritative Bypass Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    BYPASS PATH MAP                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  consultant-v2 (LLM)                                            │
│      ↓ weaknesses, ai_opportunities, lead_score                 │
│  website_analyses + analysis_items (DB)                         │
│      ↓ getFullAnalysis() SELECT *                               │
│  SalesService.generateSales()                                   │
│      ↓ analysis.weaknesses / ai_opportunities / lead_score      │
│  OfferMatcher.match()                                           │
│      BYPASS-1 matchWeaknesses()          +0 to +45 pts          │
│      BYPASS-2 matchAiOpportunities()     +0 to +20 pts          │
│      BYPASS-3 lead_score >= 70 bonus     +0 to +10 pts          │
│      ↓                                                          │
│  top3 → GeminiService.generateSales()                           │
│      ↓                                                          │
│  generated_messages (DB)                                        │
│      ↓                                                          │
│  Opportunity Matrix / Sales Assets (UI)                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    SEVERED CORRECT PATH                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EvidenceEngine.extractEvidence()                               │
│      ↓                                                          │
│  evaluateProductionOpportunities()  ← DBPG + QIG               │
│      ↓ returns OpportunityEvaluationOutput[]                    │
│  analysis-service logs it, DISCARDS it                          │
│  ↗ NOT PERSISTED                                                │
│  ↗ NOT FORWARDED TO SalesService                                │
│  ↗ NO INFLUENCE ON ANY OFFER RECOMMENDATION                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Classification of All Offer-Influencing Inputs

Per the contract established in Gate 5.5:

| Input to OfferMatcher | Classification | Permitted? |
|---|---|---|
| `category` | Factual identity signal | ✅ PERMITTED |
| `capabilities` (detector output) | Evidence signal | ✅ PERMITTED |
| `technologies` (detector output) | Evidence signal | ✅ PERMITTED |
| `analysis.weaknesses` (LLM) | PROHIBITED INFERENCE | ❌ BYPASS |
| `analysis.ai_opportunities` (LLM) | PROHIBITED INFERENCE | ❌ BYPASS |
| `analysis.lead_score` (LLM) as offer bonus | SCORE CONTRACT VIOLATION | ❌ BYPASS |
| `OpportunityEvaluationOutput` (DBPG/QIG) | Gate-authorized | ✅ PERMITTED — but ORPHANED |

---

## 8. Separation of Concerns Violation

Gate 5.9 established:

```
RULE HEALTH ≠ SALES RECOMMENDATION PIPELINE HEALTH
```

Current state conflates:
- **Lead Prioritization Score** (what `lead_score` represents — produced by LLM as a ranking heuristic) 
- **Commercial Opportunity Confidence** (what DBPG/QIG produce — evidence-backed gate output)
- **Offer Relevance Score** (what `OfferMatcher` produces — currently contaminated by LLM inputs)

These are three separate contracts. None of the three should read from the others without explicit architectural authorization.

---

## 9. Gate 5.12.1 Final Verdict

| Question | Answer |
|---|---|
| Is there a bypass from LLM inference to Offer recommendation? | **YES — CONFIRMED (3 bypass paths)** |
| Is the Opportunity Engine (DBPG/QIG) influencing any production Offer? | **NO — COMPLETELY ORPHANED** |
| Are all stored generated_messages BYPASS-path products? | **YES** |
| Is the Evidence Layer correct? | **YES — UNAFFECTED** |
| Is the DBPG/QIG rule logic correct? | **YES — UNAFFECTED** |
| Does Gate 5.13 monitoring need to be held? | **YES — HOLD until 5.12.3 complete** |

---

## 10. Pre-conditions for Gate 5.12.2

Gate 5.12.2 (Remediation Design) must not begin until this gate is reviewed and the following decisions are made:

- [ ] Confirm that `analysis.weaknesses` / `analysis.ai_opportunities` must be removed from `OfferMatcher` inputs entirely (not just tagged as unverified)
- [ ] Confirm that `lead_score` must NOT be used as an offer-matching bonus
- [ ] Define how `OpportunityEvaluationOutput` (DBPG/QIG) should be persisted and forwarded to `SalesService`
- [ ] Decide whether legacy `analysis_items` (AI_OPPORTUNITY / AUTOMATION_OPPORTUNITY types) should be preserved for diagnostic/display purposes only or purged
- [ ] Decide whether existing `generated_messages` should be invalidated or left as historical record with a bypass-source flag

---

## Appendix — Source File Reference

| File | Role | Bypass Involvement |
|---|---|---|
| `_shared/services/offer-matcher.ts` | Offer scoring | Lines 44–77: BYPASS-1, BYPASS-2, BYPASS-3 |
| `_shared/services/sales-service.ts` | Orchestrator | Lines 77–100: feeds LLM items to OfferMatcher |
| `_shared/repositories/analysis-repo.ts` | Data access | Line 67: `SELECT *` returns all analysis_items types |
| `_shared/services/analysis-service.ts` | Analysis orchestrator | Lines 83–84: calls stub, discards output |
| `_shared/intelligence/opportunity/engine.ts` | Opportunity Engine | Lines 78–82: legacy stub returns `[]`; lines 56–72: correct `evaluateProductionOpportunities` — NEVER CALLED from analysis pipeline |
| `_shared/ai/prompts/consultant-v2.ts` | LLM prompt | Lines 36–37: prohibits inference — but old schema violated this |
| `_shared/ai/validator.ts` | LLM output validator | Lines 9–33: validates `ConsultantResponse` only — does NOT validate EvidenceItem arrays anymore |
| `_shared/ai/types.ts` | Type definitions | Lines 68–81: `LegacyConsultantAnalysisResult` still exists — documentation debt |
