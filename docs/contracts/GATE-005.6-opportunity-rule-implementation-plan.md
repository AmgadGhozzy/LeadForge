# LeadForge — Gate 5.6 Opportunity Rule Implementation Plan

**Gate:** 5.6  
**Title:** Opportunity Rule Implementation Plan & Architectural Contract  
**Mode:** READ-ONLY / DESIGN & IMPLEMENTATION PLAN ONLY  
**Status:** DRAFT / IMPLEMENTATION PLAN COMPLETE 🔒  
**Date:** 2026-09-23  
**Parent Gates:** `GATE-005.0` through `GATE-005.5`  
**Parent Contracts:** `ADR-005` (`OPPORTUNITY_RULES = []`), `ADR-006`  

---

## 0. Scope, Purpose, and Frozen Preconditions

### 0.1 Purpose of Gate 5.6
Gate 5.5 ratified the formal specifications of the two eligible production opportunity rules:
- `RULE-OPP-DBPG-001` (Digital Booking Path Gap v1.0.0)
- `RULE-OPP-QIG-001` (Quote / Consultation Intake Gap v1.0.0)

Gate 5.6 converts these ratified specifications into an exact, step-by-step, reviewable **Implementation Plan** before a single line of production code is authored.

### 0.2 Governance & Frozen Invariants 🔒
```text
Production code changes:       0 (DESIGN-ONLY)
Production DB mutations:        0
Detector changes:               0
Active Opportunity Rules:       OPPORTUNITY_RULES = [] (STILL FROZEN)
Offer Catalog coupling:         STRICTLY DECOUPLED
```

---

## 1. Inspection of Existing Repository Architecture

### 1.1 Existing Layout
An inspection of the workspace confirms the exact architecture where Intelligence and Opportunity logic resides:

```text
supabase/functions/_shared/
├── detection/
│   ├── atomic-evidence-types.ts      (Level-1 types & polarity)
│   ├── AtomicEvidenceEvaluator.ts    (Level-1 orchestrator)
│   └── detectors/                    (Transaction, CtaContext, SelfService)
└── intelligence/
    ├── types.ts                      (General intelligence types)
    ├── evidence/                     (Legacy/Domain evidence definitions)
    └── opportunity/                  ← TARGET DOMAIN
        ├── engine.ts                 (Holds OPPORTUNITY_RULES = [] and evaluateOpportunities)
        └── types.ts                  (Opportunity types & interfaces)
```

### 1.2 Identified Architectural Decoupling Need
In `supabase/functions/_shared/intelligence/opportunity/types.ts`:
- The legacy draft coupled `OpportunityRule` directly to `targetOffer: ActiveOfferSlug`.
- **Architectural Correction (ADR-005 / Gate 5.5):** An Opportunity Rule detects an **Opportunity**, not an Offer. The target offer belongs to an independent downstream matching layer (`services/offer-matcher.ts` or `OfferRegistry`).
- The production Opportunity types will decouple the detected Opportunity from the Offer.

---

## 2. Target File Modifications & New Additions

When implementation authorization is granted in the next gate, the exact file operations will be:

| Action | Target Path | Responsibility |
|---|---|---|
| **[MODIFY]** | `supabase/functions/_shared/intelligence/opportunity/types.ts` | Introduce updated `OpportunityRuleResult`, `ExternalBusinessState`, `VerificationStrength`, and decoupled rule interfaces without touching legacy exports. |
| **[NEW]** | `supabase/functions/_shared/intelligence/opportunity/rules/DigitalBookingRule.ts` | Pure deterministic evaluator for `RULE-OPP-DBPG-001` with suppressors and audit trail. |
| **[NEW]** | `supabase/functions/_shared/intelligence/opportunity/rules/QuoteIntakeRule.ts` | Pure deterministic evaluator for `RULE-OPP-QIG-001` with suppressors and destination-surface guards. |
| **[MODIFY]** | `supabase/functions/_shared/intelligence/opportunity/engine.ts` | Register rules under feature flag or staged execution, preserving `OPPORTUNITY_RULES = []` default until full activation gate. |
| **[NEW]** | `tests/unit/opportunity_rules.test.ts` | Unit tests covering POSITIVE, HARD_NEGATIVE, BOUNDARY, SUPPRESSED, and UNKNOWN for both rules. |

---

## 3. Exact Interface Specifications

### 3.1 Policy Metadata & Verification Strength (Addressing Gate 5.5 Finding)
Per the Gate 5.5 review, numeric values (`0.95`, `0.70`) must **not** be presented as statistical probabilities or calibrated likelihoods. They are formally typed as **Policy Verification Strength Levels**:

```typescript
export type VerificationStrength =
  | 'VERIFIED_EXTERNAL_STATE'   // Independently confirmed via external operational audit (Policy Tier 1)
  | 'UNVERIFIED_EXTERNAL_STATE'; // Observable website gap present, external state unverified (Policy Tier 2)

export interface ExternalBusinessState {
  model_depends_on_appointments?: boolean | 'UNKNOWN';
  offline_booking_confirmed?: boolean | 'UNKNOWN';
  is_walk_in_only?: boolean | 'UNKNOWN';
}

export interface ExternalQuoteState {
  requires_qualification_parameters?: boolean | 'UNKNOWN';
  manual_qualification_overhead_confirmed?: boolean | 'UNKNOWN';
}
```

### 3.2 Output Record & Provenance Audit Trail
```typescript
export interface OpportunityEvidenceProvenance {
  intent_atoms: string[];
  absent_atoms: string[];
  suppressors_evaluated: string[];
  destination_channel?: string;
}

export interface OpportunityEvaluationOutput {
  rule_id: string;
  rule_version: string;
  opportunity_slug: 'digital_booking_path_gap' | 'quote_consultation_intake_gap';
  status: 'OPPORTUNITY_DETECTED' | 'SUPPRESSED' | 'NO_GAP' | 'UNKNOWN' | 'NOT_APPLICABLE';
  verification_strength?: VerificationStrength;
  provenance: OpportunityEvidenceProvenance;
  audit_trail: string;
}
```

---

## 4. Implementation Mapping for Rules

### 4.1 Digital Booking Path Gap (`RULE-OPP-DBPG-001`)
- **File:** `supabase/functions/_shared/intelligence/opportunity/rules/DigitalBookingRule.ts`
- **Class / Function:** `evaluateDigitalBookingRule(atoms, journey, input, external?)`
- **Inputs:**
  - `atoms: AtomicEvidenceRecord`
  - `journey: CustomerJourneyEvidence`
  - `input: AtomicEvidenceInput`
  - `external?: ExternalBusinessState`
- **Suppressors Check:**
  1. `DIRECT_CHECKOUT === 'PRESENT'` → `SUPPRESSED`
  2. `SELF_SERVICE_PORTAL === 'PRESENT'` → `SUPPRESSED`
  3. `external.is_walk_in_only === true` → `SUPPRESSED`
  4. Known third-party booking URLs in anchor text → `SUPPRESSED`
- **Intent Check:** `CONSULTATION_CTA === 'PRESENT'` || `QUOTE_CTA === 'PRESENT'`
- **Gap Check:** `APPOINTMENT_CTA === 'ABSENT'`
- **Output:**
  - If external validation confirmed: `verification_strength: 'VERIFIED_EXTERNAL_STATE'`
  - Else: `verification_strength: 'UNVERIFIED_EXTERNAL_STATE'`

---

### 4.2 Quote / Consultation Intake Gap (`RULE-OPP-QIG-001`)
- **File:** `supabase/functions/_shared/intelligence/opportunity/rules/QuoteIntakeRule.ts`
- **Class / Function:** `evaluateQuoteIntakeRule(atoms, destination, input, external?)`
- **Inputs:**
  - `atoms: AtomicEvidenceRecord`
  - `destination: IntakeSurfaceEvidence`
  - `input: AtomicEvidenceInput`
  - `external?: ExternalQuoteState`
- **Suppressors Check:**
  1. `DIRECT_CHECKOUT === 'PRESENT'` → `SUPPRESSED`
  2. `destination.destination_has_structured_form === true` → `SUPPRESSED`
  3. `destination.resolved_channel === 'FORM'` → `SUPPRESSED`
  4. `APPLICATION_CTA === 'PRESENT'` → `SUPPRESSED`
- **Intent Check:** `QUOTE_CTA === 'PRESENT'` || `CONSULTATION_CTA === 'PRESENT'`
- **Gap Check:** `destination.resolved_channel IN ['EMAIL', 'PHONE', 'WHATSAPP']`
- **Output:**
  - If qualification verified: `verification_strength: 'VERIFIED_EXTERNAL_STATE'`
  - Else: `verification_strength: 'UNVERIFIED_EXTERNAL_STATE'`

---

## 5. Architectural Boundaries & Decoupling

```text
Evidence Layer (detectors / DOM scan)
        ↓
Level-1 Atoms + Level-2 Journey (Pure Website Facts)
        ↓
[Boundary: No Internal Assumptions Allowed Here]
        ↓
Opportunity Rule Evaluator (+ Optional ExternalBusinessState)
        ↓
Opportunity Evaluation Output (OPPORTUNITY_DETECTED / NO_GAP / etc.)
        ↓
[Boundary: No Offer Coupling Allowed Here]
        ↓
Offer Matcher (Downstream Service)
```

1. **Detectors NEVER call Opportunity Rules.**
2. **Opportunity Rules NEVER select or mention Offers.**
3. **External Business State is NEVER guessed by detectors.**

---

## 6. Comprehensive Test & Validation Plan

When code implementation begins, the test plan will execute against:

### 6.1 Unit Tests (`tests/unit/opportunity_rules.test.ts`)
1. **DBPG Test Matrix:**
   - Case 1 (Positive): Consultation present, appointment absent, sufficient obs → `OPPORTUNITY_DETECTED`.
   - Case 2 (Hard Negative): Direct checkout present → `SUPPRESSED`.
   - Case 3 (Hard Negative): External booking widget present → `NO_GAP`.
   - Case 4 (Hard Negative): Walk-in emergency center → `SUPPRESSED`.
   - Case 5 (Insuff. Obs.): Shallow crawl / unvisited surface → `UNKNOWN`.
2. **QIG Test Matrix:**
   - Case 1 (Positive): Quote CTA links to bare mailto → `OPPORTUNITY_DETECTED`.
   - Case 2 (Hard Negative): Quote page has multi-step form → `SUPPRESSED`.
   - Case 3 (Hard Negative): Fixed price checkout → `SUPPRESSED`.
   - Case 4 (Boundary): WhatsApp + structured form → `SUPPRESSED`.
   - Case 5 (Insuff. Obs.): Destination page HTTP 500 → `UNKNOWN`.

### 6.2 Golden Cases Test Harness
Re-execute all 15 cases from `GATE-005.2` to confirm 100% deterministic parity.

### 6.3 Frozen Production Cohort Backtest
Run against the 46 frozen targets from Gate 4 to verify:
- Zero regressions on Level-1 evidence.
- 100% specificity on Hard Negative controls.

---

## 7. Gate 5.6 Compliance & Acceptance Verification

| Acceptance Criterion | Verification Plan | Status |
|---|---|---|
| Existing architecture inspected | Confirmed in `supabase/functions/_shared/intelligence/opportunity/` | ✅ PASS |
| Exact files identified | `types.ts`, `DigitalBookingRule.ts`, `QuoteIntakeRule.ts`, `opportunity_rules.test.ts` | ✅ PASS |
| Exact interfaces identified | Typed with SemVer and explicit provenance | ✅ PASS |
| DBPG contract mapped | Pure function with suppressors & external state | ✅ PASS |
| QIG contract mapped | Pure function with suppressors & destination guard | ✅ PASS |
| ExternalBusinessState mapped | Separated from detectors; typed as `VerificationStrength` | ✅ PASS |
| UNKNOWN semantics preserved | Propagates from `observability_sufficient === false` | ✅ PASS |
| Suppressors mapped | Full list of e-commerce, portal, and third-party widgets | ✅ PASS |
| Provenance & Audit mapped | Returns full inspection trail | ✅ PASS |
| Test plan mapped | Unit tests + Golden cases + Cohort backtest | ✅ PASS |
| Code mutations = 0 | Strictly design-only document | ✅ PASS |
| DB mutations = 0 | Zero write operations | ✅ PASS |
| OPPORTUNITY_RULES = [] | Frozen array intact | ✅ PASS |

---

## 8. Gate 5.6 Verdict & Transition

### **Overall Gate Verdict:** `PASS — IMPLEMENTATION PLAN APPROVED 🔒`

- Full architecture mapped to existing repository layout.
- Decoupling between Evidence, Opportunities, and Offers preserved.
- Verification strength metadata formalized per GPT directive.
- Zero production mutations maintained.

### Next Step: Implementation Gate
Upon review and authorization of this implementation plan, the pipeline will execute:
```text
Gate 5.6 Implementation Plan (COMPLETE ✅)
    ↓
Implementation Step 1: Types & Interfaces (`types.ts`)
Implementation Step 2: DBPG Evaluator (`DigitalBookingRule.ts`)
Implementation Step 3: QIG Evaluator (`QuoteIntakeRule.ts`)
Implementation Step 4: Unit Test Suite (`opportunity_rules.test.ts`)
Implementation Step 5: Verification Backtest
    ↓
Activation Gate (ADR-005 unfreeze)
```
