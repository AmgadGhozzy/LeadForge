# GATE-004.6 — Evidence Layer Terminal Gate

**Status:** PASS — RATIFIED  
**Date:** 2026-09-23  
**Phase:** Terminal Gate — Evidence Backtest Cycle Closure  
**Governing Documents:** ADR-004 (FROZEN), ADR-005 (ZERO_RULES), ADR-006 (RATIFIED), Gate 4.0–4.5 Reports  
**Mode:** DOCUMENT-ONLY / ZERO CODE / ZERO DB / ZERO GROUND TRUTH / ZERO CRAWLER / ZERO DETECTORS / ZERO_RULES

---

## 1. Terminal Gate Declaration

### Gate Chain Summary

| Gate | Verdict | What It Proved |
| :--- | :--- | :--- |
| **Gate 4.0** | PASS — contract ratified | Evidence Backtest contract and evaluation protocol defined; 46-target live population (31 Reference + 15 Hard Negatives) frozen. |
| **Gate 4.1** | PASS — forensic attribution | Established that 118 mismatches were **not** a general crawler failure: 71 (60.2%) Level-2 derived cascades vs 56 (39.8%) Level-1 root mismatches. |
| **Gate 4.2** | PASS — contract reconciliation | Audited all 56 root cases: REFERENCE_BUG 24, OBSERVABILITY_LIMITATION 21, SYSTEM_BUG 8, SEMANTIC_TAXONOMY_DISAGREEMENT 3; confirmed ZERO DB/crawler/rule mutation. |
| **Gate 4.3** | PASS — remediation design | Specified 8 SYSTEM_BUG detector defects into design contracts (newsletter-vs-membership, careers-vs-acquisition, Arabic consultation gaps), plus architectural ratification of retail add-to-cart retention. Design-only, zero code. |
| **Gate 4.4** | PASS — remediation implemented | Shipped the 4.3 remediation: 4 new golden fixtures added to 13/13, hermetic suite grew 74 → 102 tests, live backtest 46/46 with ZERO mutation, mismatches 118 → 114 (−4). No DB / Ground Truth / rules changes. |
| **Gate 4.5** | PASS — attribution & freeze | Attributed all 55 root Level-1 mismatches (114 − 59 Level-2 cascades): REFERENCE_BUG 25, OBSERVABILITY_LIMITATION 22, VALID_ATOMIC_EVIDENCE 4, DETECTOR_BUG 2 (investigate-only), TAXONOMY/POLICY_BOUNDARY 1, CRAWL_GAP 1, UNRESOLVED 0. Contract Freeze locking 53/55 as non-actionable. Unresolved: 0. |
| **Gate 4.6** | **PASS — TERMINAL** | Formally closes the Evidence Backtest cycle and ratifies **EVIDENCE_LAYER = BASELINED** (this document). |

### Final Status

**EVIDENCE_LAYER = BASELINED** — see §3 for the precise boundary semantics.

---

## 2. Consolidated Acceptance Criteria

Every criterion is independently verified across the Gate 4.4 run data (`scripts/pilot_data/gate4_evidence_backtest_results.json`) and the Gate 4.5 attribution ledger (`docs/contracts/GATE-004.5-residual-attribution.md`).

| # | Criterion | Result |
| :- | :--- | :--- |
| 1 | ADR-004 (Evidence Layer Freeze) | ✅ FROZEN |
| 2 | ADR-006 (Raw Observation First) | ✅ RATIFIED |
| 3 | Golden Fixtures | ✅ 13/13 |
| 4 | Hermetic unit tests | ✅ 102/102 |
| 5 | Live backtest | ✅ 46/46 targets processed |
| 6 | Provenance | ✅ 100% (27/27 observed PRESENT atoms verified with detector / method / anchor / destination) |
| 7 | Unsafe ABSENT | ✅ 0 — every observability gap correctly cast as UNKNOWN (ADR-006 §6.1 guard) |
| 8 | UNKNOWN semantics preserved | ✅ SPA/crawl/observability gaps stay UNKNOWN, never re-cast as ABSENT |
| 9 | Root mismatches attributed | ✅ 55/55 (Level-1 roots; 59 Level-2 cascades excluded by design) |
| 10 | Unresolved | ✅ 0 |
| 11 | DB mutations | ✅ 0 (all tables pre/post equal) |
| 12 | Ground Truth mutations | ✅ 0 |
| 13 | Crawler mutations | ✅ 0 |
| 14 | `OPPORTUNITY_RULES` | ✅ ZERO (`[]` frozen, ADR-005) |
| 15 | Open detector candidates | ✅ 2 — INVESTIGATE only, **DEFERRED** (§4) |

**Chain integrity:** no criterion is carried by assertion alone; each is backed by a Gate 4.x report and/or the machine-readable backtest result artifact.

---

## 3. BASELINED — Definition of Record

### EVIDENCE_LAYER = BASELINED **DOES** mean:
1. **Semantics are known.** Every atom (`DIRECT_CHECKOUT`, `CONSULTATION_CTA`, `APPLICATION_CTA`, `ONLINE_MEMBERSHIP`, `WHATSAPP`, `QUOTE_CTA`, `APP_BASED_SERVICE`, `SELF_SERVICE_PORTAL`, Level-2 derivations) has a ratified, Gate 3.1-compliant contract.
2. **Boundaries are known.** Reference ↔ Observability ↔ Detector ↔ Taxonomy boundary lines are mapped and documented (Gate 4.2 classes + Gate 4.5 7-category taxonomy).
3. **Residual errors are classified.** All 114 live mismatches decompose to 55 attributed roots with **0 unresolved**.
4. **No blocking issue exists.** Nothing prevents moving to the next layer; nothing requires a detector change before proceeding.

### EVIDENCE_LAYER = BASELINED **does NOT** mean:
1. **NOT 100% accuracy.** Raw precision/recall are NOT converged to 1.0 (e.g. `CONSULTATION_CTA` recall 16.7% on live labels; TP 5 / (TP 5 + FN 25), Gate 4.4 run data: `scripts/pilot_data/gate4_evidence_backtest_results.json` §confusionMatrices).
2. **NOT zero FN.** Functional gaps exist where the surface is unobservable or the pattern is genuinely missed.
3. **NOT zero FP.** Two live false positives remain as DEFERRED candidates (C1/C2).
4. **NOT "feature complete".** The layer is a stable baseline for downstream research, not a finished optimization target.

### Re-opening Condition
The baseline may be re-opened **only** if new evidence breaks it. This requires one of:
- A **new detector bug with demonstrated production impact** (previously-unknown FALSE_NEGATIVE/FP affecting real business outcomes), or
- **C1 or C2 investigation yielding case-level DOM proof** of a genuine boundary bug (unlock conditions in §4).

An open consumer or observability gap **does not** constitute breaking evidence on its own.

---

## 4. Deferred Candidates Lock

Both candidates are formally locked as **DEFERRED**. They are **not** TODO, and they are **not** "investigate soon" — they are deferred with an explicit unlock condition and a hard prohibition on automatic remediation.

### C1 — Emirates Dental `APPLICATION_CTA` FALSE_POSITIVE

| Field | Value |
| :--- | :--- |
| business_id | `a142189a-0974-44b0-b650-0368c67351da` |
| business | Emirates Dental - Cosmetic Dentistry & Invisalign Clinic Dubai |
| atom | `APPLICATION_CTA` |
| expected | ABSENT (frozen reference) |
| observed | PRESENT (anchor: `apply now: Apply Now`) |
| root cause | `DETECTOR_BUG` candidate — `Apply Now` fired with no careers tokens in the ±400 snippet window |
| status | **DEFERRED** |
| **Unlock condition** | Case-level DOM evidence proving the boundary bug: walk `button/link → parent container → section/card/form → career context` and show it is the semantically correct boundary that a fixed window misses. |
| **Prohibition** | MUST NOT be treated as TODO or trigger automatic `DOM-container walk` implementation without the unlock evidence having been reviewed at a future gate. |

### C2 — First Dental `ONLINE_MEMBERSHIP` FALSE_POSITIVE

| Field | Value |
| :--- | :--- |
| business_id | `887f8c66-10af-424a-b751-a3e76e57add8` |
| business | First Dental Center - FDC |
| atom | `ONLINE_MEMBERSHIP` |
| expected | ABSENT (frozen reference) |
| observed | PRESENT (anchor: `recurring subscription: subscription/1.11.0/EditSubscriptionViewerWidget.bundle.min.js` — matched a script/config asset string, not a visible CTA) |
| root cause | `DETECTOR_BUG` candidate — regex matched a JS asset config string; semantics of the widget (SERVICE MEMBERSHIP vs PRODUCT SUBSCRIPTION vs LOYALTY vs NEWSLETTER vs RETAIL) unknown |
| status | **DEFERRED** |
| **Unlock condition** | Case-level evidence answering "what does the First Dental subscription widget actually sell?", reviewed at a future gate. |
| **Prohibition** | MUST NOT be treated as TODO or trigger automatic remediation that blunts the `ONLINE_MEMBERSHIP` / `DIRECT_CHECKOUT` semantic distinction before the widget's true nature is established. |

---

## 5. Knowledge Extracted — Evidence Layer Lessons

1. **Raw observation first, classification second.** A Level-1 detector that hides authentic evidence to satisfy a commercial interpretation violates ADR-006. Retail add-to-cart on a clinic site (`DIRECT_CHECKOUT` FP, Gate 4.3 §4) stays present at Level-1 — the clinical-vs-retail distinction belongs strictly to Level-2/3 policy.
2. **Context beats keyword blacklists.** Rejecting non-commercial matches (newsletter subscribe, careers "Apply Now") must rely on structural/syntactic context (linked containers, snippet windows, career/marketing tokens), not fragile single-keyword denylists.
3. **Why A/C/E rules failed on hard negatives.** Simple pattern rules that treat "presence of contact channel" as an opportunity signal produced false opportunities on the hard-negative control set. Contact channels (WhatsApp/Phone/Email PRESENT) alone do **not** imply commercial opportunity (lead-nurturing, RFP intake, loyalty, retail all share the same surface).
4. **The UNKNOWN semantic contract.** When the interactive surface of an SPA or async widget cannot be observed via static HTML, the correct emission is `UNKNOWN`, never `ABSENT`. This was enforced by the ADR-006 §6.1 observability-sufficient guard and produced **0 unsafe ABSENT** across the cycle. (Yelo/Tawuniya/Flynas SPA shells, PureGym/Hive membership funnels, floating WhatsApp widgets.)
5. **Reference vs Observability is the core attribution split.** Of 55 roots, 47 (85%) are reference defects (25) + observability limitations (22). Nearly all live mismatches are *data/boundary* problems, not detector bugs — which is why the cycle committed only 8 detector changes across 4.1 → 4.5.
6. **The snippet-window mechanism and its limits.** The ±400 context window around a regex match correctly resolved newsletter/careers exclusions (Gate 4.4, −4 mismatches) but is NOT a universal semantic boundary: C1 exists precisely because careers context can sit outside a fixed character window. Snippet windows trade determinism for reach; a DOM-container walk is the hypothesized (and deferred) successor.
7. **Zero-mutation discipline is enforceable and cheap.** Pre/post row-count snapshots on all four production tables, frozen reference CSV, frozen `OPPORTUNITY_RULES`, and read-only gates made every verdict auditable. The cycle proves Evidence work can proceed without leaving any write footprint.

---

## 6. Handoff to Commercial Semantics Research

The next phase is **NOT** writing Opportunity Rules. ADR-005 (`OPPORTUNITY_RULES = []`) remains frozen until the research below produces a ratified Opportunity Contract.

### Mandatory Research Questions (must be answered before any Opportunity Rule can exist)

1. **What observable Evidence combination proves commercial intent?** Which Level-1/2 atoms, in which co-occurrence patterns, distinguish a genuine buying journey from a marketing/contact surface? (Hiatus: WhatsApp+Phone+Email+no-booking was proven insufficient in hard negatives.)
2. **Which Business Journey stages can be inferred from Level-1+2 atoms alone?** Can `CUSTOMER_JOURNEY_STAGES` be reconstructed from atom combinations (e.g. consultation present + checkout absent ⇒ discovery/consideration), or do some stages require outside data?
3. **What is the minimum Evidence threshold for a high-confidence Opportunity signal?** Given the 27 provenance-verified PRESENT atoms observed live, what precision/recall target must a candidate Opportunity rule hit before it is eligible to score?
4. **How do we validate an Opportunity hypothesis against real business outcomes?** Without ground truth on actual conversions, what is the validation protocol (golden business-journey cases? longitudinal enrichment? human review decoupling?) that can check the hypothesis before it ships as a rule?

### Mandated Path (ratified)

```
Evidence Layer
   │  BASELINED (this gate)
   ▼
Commercial Semantics Research
   ▼
Candidate Opportunity Contract
   ▼
Golden Business-Journey Cases
   ▼
Backtest
   ├── FAIL → redesign
   └── PASS
        ▼
   Opportunity Rule (then ADR-005 may move off ZERO_RULES)
```

**Hard constraint:** `ADR-005 OPPORTUNITY_RULES = []` stays frozen and unmodified until a Commercial Semantics Research output is ratified as an Opportunity Contract.

---

## 7. Gate 4.6 Verdict

### **PASS — Evidence Backtest Cycle: CLOSED**

**Rationale:**
- All 15 consolidated acceptance criteria met (Sections 2 + Gate 4.4/4.5 evidence).
- Baseline semantics, boundaries, residual classification, and 0-unresolved state verified.
- C1/C2 formally deferred with unlock conditions; no open remediation requirement blocks the transition.
- Handoff contract (§6) defines the mandatory research questions and the frozen `ZERO_RULES` path to the next phase.

---

**Signed:** Gate 4.6 Terminal Gate — 2026-09-23  
**State:** EVIDENCE_LAYER = BASELINED 🔒 | ADR-005 = ZERO_RULES 🔒 | C1/C2 = DEFERRED  
**Evidence Backtest Cycle: CLOSED**

***
*Document produced under Gate 4.6 Document-Only Protocol. No code, reference, database, or rules mutation occurred.*