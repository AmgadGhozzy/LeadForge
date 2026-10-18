# GATE-004.5 — Residual Mismatch Attribution & Contract Freeze Report

**Status:** RATIFIED  
**Date:** 2026-09-23  
**Phase:** Gate 4.5 — Residual Mismatch Attribution & Contract Freeze  
**Population:** 46 live targets (31 Reference + 15 Hard Negatives)  
**Source Data:** `scripts/pilot_data/gate4_evidence_backtest_results.json` (114 mismatches), `pilot_evidence_reference.csv`, Gate 4.2 Reconciliation Ledger  
**Mode:** READ-ONLY / ZERO PRODUCTION CODE / ZERO CRAWLER / ZERO DB MUTATION / ZERO GROUND TRUTH / ZERO_RULES / ZERO new detectors-regex-fixtures

---

## 0. Executive Summary

Gate 4.4 left **114 live-backtest mismatches** (55 Level-2 cascades excluded below do not de-count the total — see §1). Removing the **59 Level-2 derived cascades** leaves **55 Level-1 root mismatches**, which this report attributes into the 7-category taxonomy below.

- **25/55 (45.5%)** are `REFERENCE_BUG`: the frozen reference demanded `CONSULTATION_CTA = PRESENT` on generic contact / appointment-booking anchors the detector correctly refused per Gate 3.1.
- **22/55 (40%)** are `OBSERVABILITY_LIMITATION`: SPA shells, JS-hydrated funnels, and async widgets invisible to static HTML — semantically they were **UNKNOWN**, not `ABSENT`. Plus **1 CRAWL_GAP** (deep intake subpage).
- **4/55 (7.3%)** are `VALID_ATOMIC_EVIDENCE`: the detector fired correctly (wa.me links, Google Play badge, "get a quote") and the reference was wrong.
- **1/55** is `TAXONOMY/POLICY_BOUNDARY`: First Dental `DIRECT_CHECKOUT` FP — retail add-to-cart, **retained by design** (Gate 4.3 §4).
- **2/55 (3.6%)** remain `DETECTOR_BUG` candidates: Emirates Dental `APPLICATION_CTA` FP and First Dental `ONLINE_MEMBERSHIP` FP. Both are **INVESTIGATE-only** — no remediation is approved or implemented here.

The residual does **not** justify new detector complexity. The lead's architecture hypothesis holds: the residue is dominated by reference and observability boundaries; a decision whether to ever touch detectors again rests on the two investigation candidates below.

---

## 1. Attribution Table (One Row per Root Mismatch Group)

`business_ids` carry the exact IDs from the Gate 4.4 run. "Expected" = frozen reference; "Observed" = production `DetectionEngine`.

| root_case_id | business_ids | expected | observed | root_cause | contract_status | actionability | recommended_action | evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R3 | 25 targets: `hn-017`, `hn-019`, `5a771ba5…`, `c5661bec…`, `5eb74fd1…`, `c34fb0f1…`, `ff5c69ae…`, `db4e766f…`, `6c220f5f…`, `0f93661b…`, `c1120887…`, `4b9beb1c…`, `1fb1748b…`, `17875054…`, `46b05b47…`, `26201379…`, `fb7d6d95…`, `936da09e…`, `8851319f…`, `122cf960…`, `93fb9a9a…`, `419d0b44…`, `2043ce32…`, `842eac9b…`, `887f8c66…` | `CONSULTATION_CTA` PRESENT | ABSENT | `REFERENCE_BUG` | DOCUMENTED_GAP | NONE | `REFERENCE_CORRECTION` | Reference over-labeled generic contact ("Contact Us", "Connect with an Advisor / RFP Inquiries") and appointment anchors ("Book Appointment" → emitted `APPOINTMENT_CTA`, correct) as consultation. Gate 3.1 strictly forbids these from emitting `CONSULTATION_CTA`. Detector behavior is correct; reference owe correction (future harmonization, not here). |
| R4 | `887f8c66…` (First Dental Center - FDC) | `DIRECT_CHECKOUT` ABSENT | PRESENT | `TAXONOMY/POLICY_BOUNDARY` | ACCEPTED | NONE | `FUTURE_POLICY_DESIGN` | Anchor `cart-to-checkout widget: add-to-cart` = WooCommerce retail shop (toothbrushes). Ratified by Gate 4.3 §4: Level-1 raw observation is authentic; the core-clinical-vs-retail separation belongs to Level-2/3. **No detector change, by design.** |
| R1 | `a142189a…` (Emirates Dental) | `APPLICATION_CTA` ABSENT | PRESENT | `DETECTOR_BUG` | CANDIDATE_REMEDIATION | MEDIUM | `INVESTIGATE` | Anchor `apply now: Apply Now` fired **after** the Gate 4.3 group-wide Careers Exclusion; no careers tokens (`careers/jobs/hiring/resume/cv`) within the ±400 snippet window. Suggests the static snippet window is not the right semantic boundary → DOM-container walk is a candidate, **but** must first prove `button → parent container → section/card/form → career context` beats a fixed window. Not implemented here (see §5). |
| R2 | `887f8c66…` (First Dental Center - FDC) | `ONLINE_MEMBERSHIP` ABSENT | PRESENT | `DETECTOR_BUG` | CANDIDATE_REMEDIATION | MEDIUM | `INVESTIGATE` | Anchor `recurring subscription: subscription/1.11.0/EditSubscriptionViewerWidget.bundle.min.js` — the regex matched an **asset/config string** embedded in a script, not a visible membership CTA. Newsletter exclusion did not apply (no newsletter token). Must determine whether FDC sells a genuine paid membership, a product subscription, or the widget is a booking/cart artifact before any change. No change here (see §5). |
| R5 | `hn-001` (Yelo), `hn-003` (Tawuniya), `hn-012` (Flynas) | `DIRECT_CHECKOUT` PRESENT | ABSENT | `OBSERVABILITY_LIMITATION` | DOCUMENTED_GAP | NONE | `FUTURE_OBSERVABILITY_DESIGN` | SPA shells (Angular/React unhydrated `<div id="root">`); transaction widgets are JS-injected. Correct semantic state per ADR-006 §6.1 is **UNKNOWN**, not ABSENT. Detector is not at fault. |
| R6a | `hn-014` (PureGym Arabia), `hn-016` (Hive Coworking) | `ONLINE_MEMBERSHIP` PRESENT | ABSENT | `OBSERVABILITY_LIMITATION` | DOCUMENTED_GAP | NONE | `FUTURE_OBSERVABILITY_DESIGN` | Membership sign-up funnel (Join Now / Monthly Plans) rendered client-side or hosted on deep booking subdomain; invisible to static homepage HTML. Semantically **UNKNOWN**. |
| R6b | `hn-001`, `hn-003`, `hn-006`, `hn-012`, `hn-014`, `hn-015`, `hn-016` | `SELF_SERVICE_PORTAL` PRESENT | ABSENT | `OBSERVABILITY_LIMITATION` | DOCUMENTED_GAP | NONE | `FUTURE_OBSERVABILITY_DESIGN` | Portal rendered via dynamic JS / client bundle, unobserved in static DOM. Semantically **UNKNOWN**. |
| R6c | `hn-001`, `hn-003`, `hn-007`, `hn-008`, `hn-012`, `hn-015` | `APP_BASED_SERVICE` PRESENT | ABSENT | `OBSERVABILITY_LIMITATION` | DOCUMENTED_GAP | NONE | `FUTURE_OBSERVABILITY_DESIGN` | App-claim surface (iOS/Android, booking portals) is JS-hydrated or on deep routes. Semantically **UNKNOWN**. |
| R6d | `4b9beb1c…` (Kings Dental), `1fb1748b…` (7 Dental), `d96d63ca…` (Simplybraces), `842eac9b…` (Loran Dental) | `WHATSAPP` PRESENT | ABSENT | `OBSERVABILITY_LIMITATION` | DOCUMENTED_GAP | NONE | `FUTURE_OBSERVABILITY_DESIGN` | Floating WhatsApp widget injected async via third-party script; not in static DOM. Semantically **UNKNOWN**. |
| R7 | `hn-006` (Lendo) | `APPLICATION_CTA` PRESENT | ABSENT | `CRAWL_GAP` | DOCUMENTED_GAP | NONE | `FUTURE_OBSERVABILITY_DESIGN` | Application form hosted on dedicated intake subpage unobserved in crawl (Gate 4.2 ledger row 7). Not a detector pattern gap. Semantically **UNKNOWN**. |
| R8 | `hn-007` (Morni Roadside Assistance), `hn-016` (Hive Coworking) | `WHATSAPP` ABSENT | PRESENT | `VALID_ATOMIC_EVIDENCE` | ACCEPTED | NONE | `NO_ACTION` | wa.me links physically present in DOM (`https://wa.me/+966920003922`, `https://wa.me/96653624116`). Reference wrongly annotated ABSENT; detector is 100% correct (matches Gate 4.2 case 18). |
| R9 | `69e1f2b8…` (Smile Concepts) | `QUOTE_CTA` ABSENT | PRESENT | `VALID_ATOMIC_EVIDENCE` | ACCEPTED | NONE | `NO_ACTION` | Anchor `get quote / pricing: get a quote` physically present. Reference wrongly annotated ABSENT; detector correct (Gate 4.2 case 50). |
| R10 | `5a771ba5…` (IMAGE Dental Clinic | مركز إمج لطب الأسنان) | `APP_BASED_SERVICE` ABSENT | PRESENT | `VALID_ATOMIC_EVIDENCE` | ACCEPTED | NONE | `NO_ACTION` | Google Play badge for patient-records app present in footer. Detector correctly observed raw evidence; reference assumed "pure physical clinic". Valid raw observation; layer separation is Level-2 policy. |

**Derived Level-2 cascades (59, excluded from the 55 roots):**
- `HAS_ACQUISITION_PATH` FN ×26 ← driven by the 25 `CONSULTATION_CTA` FNs + 1 `APPLICATION_CTA` FN (Lendo).
- `REQUIRES_HUMAN_INTERACTION` FN ×25 ← same 25 `CONSULTATION_CTA` roots.
- `HAS_SELF_SERVICE_PATH` FN ×6 + FP ×2 ← driven by `SELF_SERVICE_PORTAL` / `APP_BASED_SERVICE` FNs; FPs cascade from IMAGE `APP_BASED_SERVICE` FP + First Dental `DIRECT_CHECKOUT` FP.

---

## 2. Category Summary Table

| Root category | Count | Action |
| :--- | :--- | :--- |
| `REFERENCE_BUG` | 25 | Reference correction later (future harmonization phase) |
| `OBSERVABILITY_LIMITATION` | 22 | Future observability design |
| `VALID_ATOMIC_EVIDENCE` | 4 | No action |
| `DETECTOR_BUG` | 2 | Candidate remediation — investigation first (§5) |
| `TAXONOMY/POLICY_BOUNDARY` | 1 | Future policy research (Level-2/3 design) |
| `CRAWL_GAP` | 1 | Future observability design |
| `UNRESOLVED` | 0 | — |
| **Total root Level-1** | **55** | (of 114 total mismatches; 59 are Level-2 cascades) |

---

## 3. Contract Freeze Declaration

The following residuals are **officially closed as non-actionable** — no detector, reference, crawler, or ground-truth change is warranted now or in any near-term gate unless the Open Candidates (§5) yield new case-level evidence:

1. **`CONSULTATION_CTA` FN × 25 — FROZEN.** Detector behavior is contract-correct (Gate 3.1). The reference over-labeled generic contact & appointment anchors. Correction, if ever, is a **reference harmonization** exercise, never a detector relaxation.
2. **`DIRECT_CHECKOUT` FP — First Dental (retail add-to-cart) — FROZEN.** Ratified by Gate 4.3 §4 and Gate 4.2 case 54/43. Level-1 raw observation preserved; distinction belongs to Level-2/3 commercial policy.
3. **All `OBSERVABILITY_LIMITATION` + `CRAWL_GAP` FNs (23 roots) — FROZEN.** Correct semantic state is `UNKNOWN` per ADR-006 §6.1. Any change belongs to a future observability/rendering design gate, not detector remediation.
4. **All `VALID_ATOMIC_EVIDENCE` FPs (4 roots) — FROZEN.** Detector evidence is authentic; reference rows are wrong and should sync to the observed value during future harmonization.
5. **`BOOKING_CTA` schema UNKNOWN ×46 — FROZEN taxonomy gap.** Detector emits `APPOINTMENT_CTA` per Gate 3.1; the CSV evaluates `BOOKING_CTA`. Alignment is a taxonomy/policy task, not a detector change (Gate 4.2 Triad B).

---

## 4. Contract Freeze vs. Non-Actionable Distinction

Frozen = closed as **non-actionable** against the current contract. The two `DETECTOR_BUG` candidates are **not** frozen — they are held as *investigation* (not remediation), pending case-level evidence per the Gate 4.5 acceptance rule *"No new remediation approved without case-level evidence."*

---

## 5. Open Candidates (DETECTOR_REMEDIATION / INVESTIGATE Only — NOT implemented)

### C1 — Emirates Dental `APPLICATION_CTA` FP (`a142189a-0974-44b0-b650-0368c67351da`)
- **Observed:** `APPLICATION_CTA = PRESENT` via anchor `apply now: Apply Now`; reference `ABSENT`.
- **Why it survives remediation:** Gate 4.3's group-wide Careers Exclusion uses the **±400 snippet window**; on Emirates Dental the careers/recruitment context sits outside that window, so `isCareersContext()` returns false.
- **Hypothesis to test (INVESTIGATE):** `button/link → parent container → section/card/form → career context` is a better semantic boundary than a fixed character window.
- **Gate to approve:** a closed investigation delivering the DOM structure of the matched "Apply Now" (is it patient financing/onboarding or talent acquisition?). Only then is a DOM-container walk a `DETECTOR_REMEDIATION` candidate.

### C2 — First Dental `ONLINE_MEMBERSHIP` FP (`887f8c66-10af-424a-b751-a3e76e57add8`)
- **Observed:** `ONLINE_MEMBERSHIP = PRESENT` via anchor `recurring subscription: subscription/1.11.0/EditSubscriptionViewerWidget.bundle.min.js`; reference `ABSENT`.
- **Why it survives remediation:** the context-anchored subscribe regex matched a **script/config asset string**, not a visible membership CTA; the newsletter exclusion correctly did not apply (no newsletter token).
- **Hypothesis to test (INVESTIGATE):** what does FDC's subscription widget actually sell — SERVICE MEMBERSHIP, PRODUCT SUBSCRIPTION, LOYALTY PROGRAM, NEWSLETTER, or RETAIL? Answering this determines whether this is a detector precision fix or a reference/label correction.
- **Risk guard:** must **not** blunt `ONLINE_MEMBERSHIP` (or `DIRECT_CHECKOUT`) semantics such that the distinction between real Evidence and its commercial interpretation is erased.

---

## 6. Gate 4.5 Acceptance Criteria — Verification

| Criterion | Result |
| :--- | :--- |
| No production code changes | ✅ ZERO |
| No crawler changes | ✅ ZERO |
| No DB mutation | ✅ ZERO |
| No Ground Truth mutation | ✅ ZERO |
| `ZERO_RULES` (`OPPORTUNITY_RULES` frozen) | ✅ ZERO |
| Every residual root mismatch attributed | ✅ 55/55 |
| Existing valid Atomic Evidence preserved | ✅ all 27 provenance-verified PRESENT atoms untouched |
| `UNKNOWN` semantics preserved | ✅ SPA/crawl/observability gaps stay `UNKNOWN`, never re-cast as ABSENT |
| No new remediation approved without case-level evidence | ✅ C1/C2 held as INVESTIGATE, zero changes |

---

## 7. BOOKING_CTA Schema Gap (Informational)

`BOOKING_CTA` appears as `UNKNOWN` on all 46 targets (schema emitted `APPOINTMENT_CTA`; CSV evaluates `BOOKING_CTA`). It contributes **0** to the 114 mismatch count (UNKNOWN excluded from the confusion matrices) and is a documented taxonomy gap (Gate 4.2 Triad B), NOT a mismatch.

---

## 8. Gate 4.5 Verdict

### **PASS — RATIFIED**

1. All **55 root Level-1 mismatches** attributed across 6 active categories (0 unresolved).
2. **2 DETECTOR_BUG candidates** documented with case-level provenance, held as `INVESTIGATE` — **not implemented**.
3. **Contract Freeze** produced: 53/55 roots frozen as non-actionable; 2 open for investigation only.
4. Zero code, design, or data changes. Constraints fully honored.

**Recommendation to the lead:** the evidence supports the *"most residue = REFERENCE / OBSERVABILITY / VALID"* hypothesis. Gate 4.5 is the appropriate terminal gate for the Evidence Backtest cycle unless C1/C2 investigations surface production-impacting defects.

***
*Report produced under Gate 4.5 Read-Only Attribution Protocol. No code, reference, or database mutation occurred.*