# ADR-005: Opportunity Engine Contract (Frozen)

**Status:** FROZEN 🔒
**Date:** 2026-09-20
**Context:** Opportunity Engine Audit & Taxonomy Verification v2 → Policy v1 Final

---

## 1. Architectural Philosophy & Engine Role

The Opportunity Engine does **not** infer, guess, or intuit a client's business needs.
It strictly evaluates deterministic Business Policy Rules against verified Evidence.

```
Evidence verified → Business Policy Rule → Opportunity
```

There is absolutely no:
```
Evidence → AI intuition → Opportunity
```

---

## 2. Zero-Rule Taxonomy Baseline

As of this contract's freeze date, the **Current Taxonomy = 0 Rules**.

Although the active `offer_templates` catalog contains offers, there are currently **no deterministic, evidence-backed Business Policy Rules** defined to trigger them automatically.

The Opportunity Engine deploys with an empty rule set (`OPPORTUNITY_RULES = []`).
This is **intentional** — not an oversight. Future rules must be explicitly authored and tested as Business Policies before being added.

---

## 3. Opportunity Policy v1 (Final)

Verified during Policy Discovery against the frozen Evidence Layer and active Offer Catalog.

| Offer | Rule | Status | Reason |
| :--- | :--- | :--- | :--- |
| `ai-website-audit` | — | 🔴 UNSUPPORTED | No `WEBSITE=PRESENT` Evidence type exists in the frozen layer. `TECHNOLOGY=PRESENT` is not a valid proxy. No UX or CRO Evidence exists. |
| `automated-lead-nurturing` | — | 🔴 UNSUPPORTED (Candidate) | `PHONE=PRESENT` + `BOOKING=ABSENT` + `CHATBOT=ABSENT` is verifiable, but the leap to "business needs lead nurturing CRM" is a semantic jump not supported by the Evidence alone. Requires real-data backtesting before approval. |

**Candidate Business Policy (not yet approved):**
```
PHONE = PRESENT
AND BOOKING = ABSENT
AND CHATBOT = ABSENT
→ automated-lead-nurturing
```
This must be validated against a real business sample before it becomes a Rule.

### Structural Mismatch Note
The current Evidence Layer detects **technology presence/absence**.
The current Offers require knowing **business problems**.
This mismatch cannot be resolved with heuristics. The resolution path is:
- **A. Evidence-driven:** Build Business Evidence types that directly prove business conditions.
- **B. Policy-driven:** Explicitly label certain rules as Business Heuristics (not Facts).

These two models must not be mixed. A strategic decision is required before the first Rule is written.

---

## 4. The 'WEBSITE' Ghost Type Invariant

`WEBSITE` exists in the `EvidenceType` enum but has no corresponding Detector.
**Invariant:** The Opportunity Engine MUST NOT use `Evidence(WEBSITE)` until the Evidence Layer officially emits it. The Evidence Layer will not be altered to rescue a weak Opportunity Rule.

---

## 5. LLM Exclusion Boundary

**The LLM MAY:**
- Receive a generated `Opportunity`, `Target Offer`, and `Supporting Evidence`.
- Act strictly as a Sales Copywriter.

**The LLM MUST NOT:**
- Create or infer an Opportunity.
- Select an Offer.
- Reinterpret `UNKNOWN` as `ABSENT`.
- Infer pain points not present in Evidence.
- Invent Evidence.
- Mutate or override a rule result.

---

## 6. Offer Catalog Invariant

`target_offer ∈ active offer_templates` — enforced via `ActiveOfferSlug` closed type.

Legacy identifiers (`whatsapp_automation`, `ai_chatbot`, `seo_website`, `ai_receptionist`) are forbidden unless added to the active DB catalog.

---

## 7. No Generic Offer Fallback

When `evaluateOpportunities()` returns `[]`:
- No sales pitch is generated.
- No Next Best Action recommendation is shown.
- No downstream component may substitute or infer an offer.

---

## 8. Target Architecture (Implemented)

```typescript
export const ACTIVE_OFFER_SLUGS = [
  'ai-website-audit',
  'automated-lead-nurturing',
] as const;

export type ActiveOfferSlug = typeof ACTIVE_OFFER_SLUGS[number];

export interface OpportunityRule {
  readonly type: string;
  readonly targetOffer: ActiveOfferSlug;
  readonly ruleVersion: string;
  readonly evaluate: (evidence: readonly Evidence[]) => boolean;
}

export interface GeneratedOpportunity {
  readonly type: string;
  readonly targetOffer: ActiveOfferSlug;
  readonly supportingEvidenceIds: readonly string[];
  readonly ruleVersion: string;
}

// Frozen — Zero Rules Baseline
const OPPORTUNITY_RULES: readonly OpportunityRule[] = [];

export function evaluateOpportunities(
  evidence: readonly Evidence[],
): readonly GeneratedOpportunity[] {
  return OPPORTUNITY_RULES.flatMap(rule =>
    rule.evaluate(evidence)
      ? [{ type: rule.type, targetOffer: rule.targetOffer, supportingEvidenceIds: [], ruleVersion: rule.ruleVersion }]
      : []
  );
}
```

---

## 9. Next Steps (Offer ↔ Business Condition Workshop)

Before any new Detector or Rule is authored:
1. Define the specific business condition being solved per Offer.
2. Identify the minimum observable signals that correlate with it.
3. Determine if those signals can be collected at scrape time.
4. Decide if a new Detector justifies the added complexity.
5. Only then: write one explicit Rule, one explicit test, and one explicit gate.

---

## 10. Candidate Patterns Evaluation & Production Decision (Post-Pilot Backtest)

**Date:** 2026-09-21  
**Audit Context:** Combined Backtest on Reference Set (31 FIT) and Negative Control (8 Scraped NOT_FIT + 7 Limit Failed).

### 10.1 Evaluated Candidate Patterns
| Candidate Pattern | Definition | Precision | Recall | F1 | Evaluation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pattern A** | `PHONE=PRESENT ∧ BOOKING=ABSENT ∧ CHATBOT=ABSENT` | 95.24% | 64.52% | 76.92% | Evaluated (FP: Shahid VIP) |
| **Pattern C** | `WHATSAPP=PRESENT ∧ BOOKING=ABSENT` | 100.0% | 48.39% | 65.22% | Evaluated (Clean signal, low recall) |
| **Pattern E** | `PHONE=PRESENT ∧ EMAIL=PRESENT ∧ BOOKING=ABSENT ∧ CHATBOT=ABSENT` | 93.33% | 45.16% | 60.87% | Evaluated (FP: Shahid VIP) |

### 10.2 Architectural Verdict: ZERO_RULES Baseline Preserved
```
Candidate Patterns
├── A — evaluated
├── C — evaluated
└── E — evaluated

Production Opportunity Rules
└── NONE (ZERO_RULES)
```

**Key Rationale:**
- **Contact Signal ≠ Lead Nurturing Opportunity:** Observable website contact patterns (e.g. phone presence without visible booking) are website pattern detectors, not commercial opportunity proof.
- **False Positive Gate:** Pattern A & E fire on non-fit models (e.g. streaming/subscription media like Shahid VIP).
- **Rule Winner vs Metric Winner:** Optimizing for academic F1 metrics does not justify commercial activation in production outreach.
- **Next Validation Gate:** Any graduation to production requires testing against **Hard Negative Controls** (service businesses with contact info where lead nurturing is NOT an opportunity).

### 10.3 Hard Negative Controls Audit Results (HARD_NEGATIVE_CONTROL_SPEC v1)

**Audit Date:** 2026-09-22  
**Dataset:** 15 Frozen Service Businesses across 5 archetypes (`scripts/pilot_data/hard_negatives_frozen_15.json`)  
**Zero-Mutation Gate:** Strictly Verified ($\Delta = 0$ across `contacts`, `business_capabilities`, `website_pages`, `business_technologies`).  
**Evaluable Targets:** 11 scraped successfully, 4 unknown due to site blocking/crawl failure.

#### Confusion Matrix & Specificity
| Rule | Evaluable | UNKNOWN | TN | FP | Specificity | False Positive Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Pattern A** | 11 | 4 | 7 | 4 | **63.64%** | **36.36%** |
| **Pattern C** | 11 | 4 | 8 | 3 | **72.73%** | **27.27%** |
| **Pattern E** | 11 | 4 | 8 | 3 | **72.73%** | **27.27%** |
| **Combined (ANY)** | 11 | 4 | 6 | 5 | **54.55%** | **45.45%** |

#### Forensic Counterexamples Identified (False Positives on Real Service Businesses)
1. **Lendo (`hn-006`)** — *Crowdlending FinTech platform*. Matched Rules A, E (`phone: PRESENT`, `email: PRESENT`, `booking: ABSENT`, `chatbot: ABSENT`). Fails: operates 100% digital self-service borrower/investor portals under SAMA sandbox.
2. **Morni (`hn-007`)** — *Roadside assistance & towing*. Matched Rules A, C (`phone: PRESENT`, `whatsapp: PRESENT`). Fails: on-demand instant dispatch via consumer mobile app; emergency services cannot use delayed nurture workflows.
3. **PureGym Arabia (`hn-014`)** — *24/7 fitness club*. Matched Rule C (`whatsapp: PRESENT`). Fails: direct online self-service membership checkout with automated QR entry; WhatsApp is pure customer service.
4. **Fitness First Middle East (`hn-015`)** — *Health club network*. Matched Rules A, E (`phone: PRESENT`, `email: PRESENT`). Fails: standardized online subscription package checkout.
5. **Hive Coworking (`hn-016`)** — *Coworking & hot-desks*. Matched Rules A, C, E (`phone: PRESENT`, `email: PRESENT`, `whatsapp: PRESENT`). Fails: instant day pass and monthly hot-desk subscriptions via digital checkout.

#### Definitive Conclusion:
- **Verdict:** `ALL_PATTERNS_FAIL_HARD_NEGATIVES`.
- **Permanent Rejection:** Patterns A, C, and E are permanently rejected for rule graduation. They have unacceptable false positive rates (27%–45%) on real service businesses.
- **Production Baseline:** **`ZERO_RULES` is retained indefinitely.**
- **Strategic Direction:** Surface-level contact presence (`has_phone`, `has_email`, `has_whatsapp`) without commercial flow signals (e.g. self-service checkout, mobile app dispatch, pricing model) cannot be used to infer lead qualification or nurturing opportunities. Richer Evidence types must be designed before any rule is considered.


