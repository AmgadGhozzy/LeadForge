# HARD_NEGATIVE_CONTROL_SPEC v1: Governance & Operational Contract

**Status:** FROZEN 🔒  
**Date:** 2026-09-22  
**Context:** Stress-Testing Candidate Patterns (A, C, E) against Service Businesses to Prevent False Opportunity Detection  
**Parent Contract:** [ADR-005: Opportunity Engine Contract (Frozen)](./ADR-005-opportunity-engine-freeze.md)

---

## 1. Purpose & Architectural Mandate

Candidate Patterns (A, C, E) are website-pattern detectors that observe contact indicators (Phone, WhatsApp, Email) in the absence of visible scheduling/booking or chatbots. 

The purpose of this specification is to **stress-test and attempt to falsify** these Candidate Patterns against **Service Businesses** whose commercial operational reality contradicts the necessity of an Automated Lead Nurturing system, despite presenting identical surface website signals.

```
Evidence verified → Observable Website Pattern → Business-Policy Gates → Opportunity → Offer
```

**Core Invariant:**  
`Contact Signal ≠ Commercial Opportunity`

---

## 2. Population & Selection Constraints

- **Scope:** Service businesses only (B2B or B2C services). No pure e-commerce or media sites.
- **Sample Funnel:**
  ```
  24 Candidate Service Businesses
         │ (Independent Commercial Evidence Review)
         ▼
  15 Frozen Targets (Locked in hard_negatives_frozen_15.json)
  ```
- **Required Diversity Dimensions:**
  1. **Direct / Self-service services:** Instant checkout, automated calculation, or standardized self-serve transactions where consultation is obsolete.
  2. **Already-automated services:** Businesses operating closed-loop automation platforms or existing customer portal apps.
  3. **Emergency / Instant-dispatch services:** Real-time dispatch (e.g. towing, urgent locksmith) requiring instantaneous human call handling, not multi-day CRM lead sequences.
  4. **Membership / Subscription services:** Fixed-rate club or facility access where conversion occurs via direct registration.
  5. **Enterprise / Contact-rich services:** Formal institutional advisory with procurement/RFP portals where automated lead nurture outreach is commercially inappropriate.

---

## 3. Strict Independence & Labeling Rules

1. **Independent Verification:** Every target must have its `NOT_FIT` label established **before** detection execution.
2. **Observable Basis Required:** Each `NOT_FIT` label must be accompanied by explicit:
   - `commercial_reason`: Plain-language explanation of why lead nurturing CRM is an invalid offer.
   - `observable_basis`: Verifiable on-page element (URL, button, pricing table, policy text).
3. **Forbidden Assumptions:** It is strictly prohibited to infer or assume:
   - Lead volume
   - Internal staffing or team capacity
   - Response speed or manual communication delays
   - Existing CRM or software usage
   - Lost leads or customer churn
   - Conversion rates or revenue performance
4. **No Circular Validation:** Under no circumstances may Candidate Pattern logic (presence/absence of phone/booking/chatbot) be used to decide or justify the ground truth label.
5. **No Label Retrofitting:** If a site triggers a False Positive during detection, modifying its label post-hoc to avoid a failure is strictly forbidden.

---

## 4. Execution Protocol (Zero-Mutation Gate)

- **Execution Vehicle:** The deployed Supabase Edge Function `pilot-enrich-batch` is the sole execution mechanism.
- **Database Mutation:** **ZERO (`Δ = 0`)**. No rows may be inserted, updated, or deleted in live database tables (`businesses`, `analysis_results`, `evidence_items`, `enrichment_runs`).
- **Failure Semantics:**
  - HTTP 546 / Worker Resource Limits → `UNKNOWN`.
  - Scrape/timeout errors → `UNKNOWN`.
  - No failure may be coerced or defaulted to `SUCCESS` or `ABSENT`.
  - Only clean, fully scraped sites with observable evidence enter the evaluable set ($N_{\text{eval}} \le 15$).

---

## 5. Evaluation & Forensic Reporting Requirements

Evaluation must run strictly against the frozen Candidate Pattern definitions:

| Pattern | Expression |
| :--- | :--- |
| **Pattern A** | `PHONE === 'PRESENT' ∧ BOOKING === 'ABSENT' ∧ CHATBOT === 'ABSENT'` |
| **Pattern C** | `WHATSAPP === 'PRESENT' ∧ BOOKING === 'ABSENT'` |
| **Pattern E** | `PHONE === 'PRESENT' ∧ EMAIL === 'PRESENT' ∧ BOOKING === 'ABSENT' ∧ CHATBOT === 'ABSENT'` |

### Required Output Deliverables:
1. **Confusion Matrix:** $TP, FP, FN, TN, \text{UNKNOWN}$ per pattern.
2. **FP Forensic Analysis Table:**
   - Business ID & Name
   - Website URL
   - Matched Rule(s)
   - Observable Signals
   - Commercial Ground Truth (Why NOT_FIT)
3. **Counterexample Matrix:** Cross-rule mapping (`A | C | E | ANY(A,C,E)`) to identify cross-contamination.
4. **Failure-Mode Classification:** Root-cause categorization of all False Positives.

---

## 6. Architectural Decision Boundaries

| Outcome | Trigger | Architectural Action |
| :--- | :--- | :--- |
| **Case 1** | All patterns produce unacceptable FPs ($A ❌, C ❌, E ❌$) | Retain `ZERO_RULES` baseline. Close Candidate Patterns. Shift to rich Evidence engineering. |
| **Case 2** | One pattern remains clean ($0\text{ FP}$) but has low recall | Do NOT promote to Opportunity Rule. Demote to `Supporting Evidence` within a broader composite policy. |
| **Case 3** | Novel multi-signal evidence combination emerges | Author formal `Opportunity Policy v1` from independent evidence; test from scratch. |

**Production Guard:** Regardless of metrics, **no Candidate Pattern will be automatically promoted to production**.
