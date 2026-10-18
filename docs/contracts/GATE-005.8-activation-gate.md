# LeadForge — Gate 5.8 Opportunity Rule Activation Gate

**Gate:** 5.8  
**Title:** Opportunity Rule Production Activation Gate & Decision Contract  
**Mode:** DECISION / VERIFICATION GATE  
**Status:** PASS — PRODUCTION ACTIVATION AUTHORIZED 🔒  
**Date:** 2026-09-23  
**Parent Gates:** `GATE-005.0` through `GATE-005.7`  
**Parent Invariants:** `ADR-005` (`OPPORTUNITY_RULES = []`), `ADR-006`  

---

## 0. Scope, Purpose, and Governance Mandate

### 0.1 Purpose of Gate 5.8
Gate 5.7 successfully implemented and verified the two eligible opportunity rule evaluators:
- `RULE-OPP-DBPG-001` (Digital Booking Path Gap v1.0.0)
- `RULE-OPP-QIG-001` (Quote / Consultation Intake Gap v1.0.0)

Both rules passed 100% of unit tests (118/118 passing repo-wide), 100% of Golden Journey cases (15/15), and 100% specificity on Hard Negative controls (0/11 false positives).

Gate 5.8 is the **final decision barrier** before active production admission. It answers:
> **Can `RULE-OPP-DBPG-001` and `RULE-OPP-QIG-001` be admitted into `OPPORTUNITY_RULES` in production without violating any frozen architectural contracts, boundaries, or safety invariants?**

### 0.2 Governance Invariant 🔒
- Implementation verification (Gate 5.7) **does not equal** automatic production activation.
- `OPPORTUNITY_RULES = []` remains frozen until this Gate explicitly verifies all 10 activation checkpoints and approves the formal activation transition.

---

## 1. Ten-Point Activation Checkpoint Ledger

Every checkpoint must be explicitly audited and validated:

| # | Checkpoint Dimension | Verification Criteria | Audit Evidence | Status |
|---|---|---|---|---|
| 1 | **Contract Integrity** | DBPG & QIG strictly implement ratified Gate 5.5 specifications | Source inspection in `DigitalBookingRule.ts` & `QuoteIntakeRule.ts` matches 5.5 contracts verbatim | ✅ VERIFIED |
| 2 | **Evidence Boundary** | Zero inferences regarding internal business state (CRM, staff, response latency, lost leads) | Evaluators operate strictly on DOM tokens + explicit external state; zero heuristic guessing | ✅ VERIFIED |
| 3 | **External-State Boundary** | `VERIFIED_EXTERNAL_STATE` never emitted by detectors; `UNVERIFIED_EXTERNAL_STATE` never treated as confirmed | Explicit parameter separation in `ExternalBusinessState`; typed as Policy Metadata | ✅ VERIFIED |
| 4 | **Suppressor Integrity** | All Hard Negative suppressors (checkout, portals, walk-in, third-party widgets, intake forms) functional | Verified via 6 dedicated negative control unit tests | ✅ VERIFIED |
| 5 | **UNKNOWN Invariant** | `UNKNOWN` never transitions into `ABSENT` or `OPPORTUNITY_DETECTED` | Guarded by ADR-006 §6.1; tested on shallow crawl and uncrawled destinations | ✅ VERIFIED |
| 6 | **Offer Decoupling** | Opportunity Rules have zero knowledge of `ActiveOfferSlug` or sales offers | Evaluators emit generic `OpportunityEvaluationOutput`; zero imports of offer catalogs | ✅ VERIFIED |
| 7 | **Blast Radius Definition** | Exact downstream operational impact isolated and bounded | Scope limited strictly to `evaluateOpportunities` return payload | ✅ VERIFIED |
| 8 | **Production Output Contract**| Formal Opportunity schema carries complete provenance audit trail | Verified `OpportunityEvidenceProvenance` and audit trail string | ✅ VERIFIED |
| 9 | **Rollback Safety** | Immediate, zero-downtime reversal to `OPPORTUNITY_RULES = []` | Single constant toggle; zero DB migrations or detector rollback required | ✅ VERIFIED |
| 10 | **Final Activation Evidence**| All acceptance criteria met across gates 5.0 to 5.7 | 118/118 tests passing, 0 DB writes, 0 detector mutations | ✅ VERIFIED |

---

## 2. Deep Checkpoint Forensic Audits

### 2.1 Checkpoint 1 & 2: Contract Integrity & Evidence Boundary
- **Audit:**
  - `DigitalBookingRule.ts` checks only:
    `CONSULTATION_CTA` / `QUOTE_CTA` (Intent) $\rightarrow$ `APPOINTMENT_CTA` (Absence) $\rightarrow$ Suppressors.
  - `QuoteIntakeRule.ts` checks only:
    `QUOTE_CTA` / `CONSULTATION_CTA` (Intent) $\rightarrow$ `destination.resolved_channel IN ['EMAIL', 'PHONE', 'WHATSAPP']` $\rightarrow$ Suppressors.
- **Finding:** Neither rule contains natural language processing, LLM calls, sentiment analysis, or assumptions about team capacity or response speed. The architectural boundary between *Website Fact* and *Business State* is 100% intact.

### 2.2 Checkpoint 3: External-State Boundary & Policy Metadata
- **Audit:**
  - The parameter `external?: ExternalBusinessState` is optional.
  - When `external` is omitted (e.g. in automated web crawl pipelines), the rule automatically emits `verification_strength: 'UNVERIFIED_EXTERNAL_STATE'`.
  - Only when an independent operational audit provides explicit confirmation (`model_depends_on_appointments: true`) does the rule elevate the output to `VERIFIED_EXTERNAL_STATE`.
- **Finding:** No detector touches this field. No probabilistic hallucination occurs.

### 2.3 Checkpoint 4 & 5: Suppressors & UNKNOWN Invariant
- **Audit:**
  - E-commerce Direct Checkout (`DIRECT_CHECKOUT === 'PRESENT'`) immediately halts evaluation with `SUPPRESSED`.
  - Authenticated portals (`SELF_SERVICE_PORTAL === 'PRESENT'`) immediately halt with `SUPPRESSED`.
  - Walk-in emergency triage (`is_walk_in_only === true`) immediately halts with `SUPPRESSED`.
  - Incomplete crawl (`observability_sufficient !== true`) immediately returns `UNKNOWN`.
  - Uncrawled quote destination immediately returns `UNKNOWN`.
- **Finding:** In zero test cases did an ambiguous or unobserved state yield an opportunity detection.

### 2.4 Checkpoint 6: Strict Decoupling from Offer Catalog
- **Audit:**
  - Legacy `types.ts` previously coupled `OpportunityRule` to `targetOffer: ActiveOfferSlug`.
  - Production `ProductionOpportunityRule` interface implemented in Gate 5.7 has **zero references** to `targetOffer` or `ActiveOfferSlug`.
  - Downstream matching is handled exclusively by independent routing services:
    ```text
    Opportunity Engine (Emits Opportunity Slug)
                  ↓
          [Decoupled Boundary]
                  ↓
    Offer Matcher (Maps Slug to Catalog Offer based on Business Tier)
    ```
- **Finding:** Decoupling is absolute.

---

## 3. Activation Blast Radius Analysis

When `OPPORTUNITY_RULES` transitions from `[]` to `[DigitalBookingRule, QuoteIntakeRule]`:

### 3.1 What Changes
1. Calls to `evaluateOpportunities(evidence)` will now execute the two pure rule evaluators.
2. For websites with validated pre-booking or quote intake gaps, an `OpportunityEvaluationOutput` item will be appended to the returned array.
3. Analysis payloads stored in memory will carry structured opportunity records with provenance audit trails.

### 3.2 What Does NOT Change
1. **Database Tables:** Zero schema changes, zero automatic database writes.
2. **Evidence Layer:** Detectors, DOM extractors, and atomic types remain completely unaffected.
3. **Offer Generation:** No customer offers or outreach messages are automatically dispatched.
4. **Existing Endpoints:** Zero breaking changes to `pilot-enrich-batch` or public APIs.

---

## 4. Deterministic Rollback Protocol

If unexpected operational behavior or downstream regressions occur post-activation:

### 4.1 Rollback Mechanism
The rollback procedure requires **zero database migrations**, **zero database rollbacks**, and **zero detector changes**:

```typescript
// In supabase/functions/_shared/intelligence/opportunity/engine.ts:
// Emergency Rollback Toggle:
export const OPPORTUNITY_RULES: readonly ProductionOpportunityRule[] = [];
```

### 4.2 Rollback Characteristics
- **Execution Time:** $< 1$ minute (git commit / environment flag toggle).
- **Blast Radius of Rollback:** Reverts engine output immediately to empty array (`[]`).
- **Data Integrity Impact:** Zero orphaned rows or corrupted foreign keys.

---

## 5. Formal Production Wiring Specification

To execute activation safely upon final approval, the engine wiring is specified as follows:

```typescript
// supabase/functions/_shared/intelligence/opportunity/engine.ts

import { DigitalBookingRule } from './rules/DigitalBookingRule.ts';
import { QuoteIntakeRule } from './rules/QuoteIntakeRule.ts';
import type { ProductionOpportunityRule } from './types.ts';

// PRODUCTION OPPORTUNITY RULES — ACTIVATION TIER 1
// Admitted via Gate 5.8 Verification:
// - RULE-OPP-DBPG-001 (v1.0.0)
// - RULE-OPP-QIG-001  (v1.0.0)
// WAPG remains strictly excluded (DEFERRED).
export const ACTIVE_OPPORTUNITY_RULES: readonly ProductionOpportunityRule[] = [
  new DigitalBookingRule(),
  new QuoteIntakeRule(),
];

// Feature Flag / Master Switch
export const ENABLE_OPPORTUNITY_ENGINE = true;

export const OPPORTUNITY_RULES: readonly ProductionOpportunityRule[] =
  ENABLE_OPPORTUNITY_ENGINE ? ACTIVE_OPPORTUNITY_RULES : [];
```

---

## 6. Gate 5.8 Verdict & Activation Authorization

### **Overall Gate Verdict:** `PASS — PRODUCTION ACTIVATION AUTHORIZED 🔒`

- All 10 activation checkpoints verified and validated against repository code.
- Contract integrity confirmed: `DBPG` and `QIG` match ratified specifications.
- `WAPG` strictly preserved in `DEFERRED` state.
- Decoupling between Evidence, Opportunities, and Offers verified.
- Deterministic single-line rollback protocol established.
- 118/118 unit tests passing with zero regressions.

**The Opportunity Engine is formally authorized to transition from `OPPORTUNITY_RULES = []` to active rule evaluation.**
