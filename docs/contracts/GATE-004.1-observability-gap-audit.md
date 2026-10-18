# GATE-004.1 — False Negative Attribution & Observability Gap Audit

**Status:** RATIFIED & AUDITED  
**Date:** 2026-09-23  
**Audit Mode:** READ-ONLY / ZERO DB MUTATION / ZERO_RULES  
**Governing Boundaries:** `ADR-006`, `ADR-005` (`ZERO_RULES`), Gate 3.1 Contract  
**Deliverable:** `docs/contracts/GATE-004.1-observability-gap-audit.md`  

---

## 0. Executive Summary & Scope

During the execution of **Gate 4.2 Evidence Backtest** against the 46 stratified targets, the deployed pipeline recorded **118 mismatches** against the reference baseline (`pilot_evidence_reference.csv`).

Per the architectural directive:
> *"A high False Negative rate does not automatically imply a Crawler defect simply because Golden Fixtures passed. Every False Negative must be rigorously attributed to one of four distinct failure boundaries before any crawler or detector modifications are considered."*

This audit conducts a root-cause attribution across all 118 mismatches under strict **Read-Only / Zero-Mutation** conditions. No detector patterns, crawler code, or database rows were altered.

---

## 1. Mismatch Decomposition: Level-1 vs. Level-2

The headline count of 118 mismatches decomposes into:
- **71 Derived Level-2 Cascades (60.2%):** Deterministic downstream reflections of Level-1 inputs (`HAS_ACQUISITION_PATH`, `HAS_SELF_SERVICE_PATH`, `REQUIRES_HUMAN_INTERACTION`). None of these represent independent detection failures.
- **47 Level-1 Atomic Mismatches (39.8%):**
  - **39 False Negatives (FN)**
  - **8 False Positives (FP)**

```
Total Mismatches (118)
├── Level-2 Derived Cascades (71) [Downstream deterministic formulas]
└── Level-1 Root Mismatches (47)
    ├── False Negatives (39)
    └── False Positives (8)
```

---

## 2. False Negative Attribution Breakdown (39 Level-1 FNs)

All 39 Level-1 False Negatives have been audited against raw responses, DOM structure, and reference provenance, classifying them into the four architectural branches:

| Attribution Branch | Count | % of FNs | Primary Affected Atoms | Core Root Cause |
| :--- | :--- | :--- | :--- | :--- |
| **Branch D: Label / Reference Limitation** | **23** | 59.0% | `CONSULTATION_CTA` (23) | Reference ground truth annotated generic `a[href*="contact"]` as `CONSULTATION_CTA`, directly violating Gate 3.1 explicit contract. |
| **Branch C: Taxonomy & Key Alignment** | **5** | 12.8% | `CONSULTATION_CTA` (3), `APPLICATION_CTA` (1), `BOOKING_CTA` (1) | Detector emits `APPOINTMENT_CTA` while reference tracked `BOOKING_CTA`; missing Arabic consultation regexes in detector. |
| **Branch B: DOM Representation & CSR (SPA)** | **8** | 20.5% | `DIRECT_CHECKOUT` (3), `SELF_SERVICE_PORTAL` (3), `WHATSAPP` (2) | Heavy Client-Side Rendering (Angular/React) in car rental, airline, and insurance sites rendering empty HTML shells; JS widgets unexecuted. |
| **Branch A: Crawler & Multi-Page Observability** | **3** | 7.7% | `APP_BASED_SERVICE` (2), `SELF_SERVICE_PORTAL` (1) | App store badges and portal links located exclusively on deep routes (`/login`, `/download`) when single-page crawl was evaluated. |

---

## 3. Deep-Dive by Attribution Branch

### Branch D: Label & Reference Ground Truth Limitations (59.0% of FNs)
- **The Issue:** Out of 26 `CONSULTATION_CTA` false negatives, **23 instances** (predominantly dental clinics like Bloor-Yorkville, Lavie Dental, Smile Studios) recorded provenance targeting:
  - `Contact Us for Consultation` via `a[href*="contact"]` or generic contact forms.
- **Contract Conflict:** In Gate 3.1, GPT and the architecture team explicitly ratified:
  > *"Ambiguous CTAs ('Contact Us', 'Get in Touch', 'Call Us') NEVER emit Level-1 QUOTE_CTA or CONSULTATION_CTA. Their raw text is passed to surrounding_text for Level-2 derivation."*
- **Verdict:** The Level-1 detector performed with **100% adherence to its contract** by refusing to emit `CONSULTATION_CTA` on generic "Contact Us" anchors. The ground truth reference erroneously conflated general clinical contact forms with unambiguous consultation commitments.

### Branch B: DOM Representation & Client-Side Rendering (SPAs) (20.5% of FNs)
- **The Issue:** Hard negative targets in complex digital service categories:
  - `hn-001` (Yelo Car Rental — `DIRECT_CHECKOUT`, `SELF_SERVICE_PORTAL`)
  - `hn-003` (Tawuniya Insurance — `DIRECT_CHECKOUT`, `SELF_SERVICE_PORTAL`)
  - `hn-012` (Flynas Airlines — `DIRECT_CHECKOUT`, `SELF_SERVICE_PORTAL`)
- **Root Cause:** These sites are built on client-rendered SPA frameworks (Angular/React). A standard static HTTP GET returns empty root elements (`<div id="app"></div>` or pre-hydration shells). The interactive booking flows and client portals are mounted asynchronously via JavaScript bundles.
- **Verdict:** Static HTML scanners are blind to client-hydrated DOM trees. This is an extraction/DOM representation barrier, not a network-level crawl block.

### Branch C: Taxonomy & Detector Coverage (12.8% of FNs)
- **Atom Mismatch (`BOOKING_CTA` vs `APPOINTMENT_CTA`):**
  - In `atomic-evidence-types.ts`, the Level-1 detector defines and emits `APPOINTMENT_CTA`.
  - In `pilot_evidence_reference.csv`, the column was titled `BOOKING_CTA`.
  - Result: 100% of booking appointments were flagged as `UNKNOWN` or mismatch because the keys were out of sync.
- **Language Coverage:**
  - `CtaContextDetector` contains consultation patterns exclusively in English (`book consultation`, `schedule consultation`, `speak with an advisor`).
  - Arabic equivalents (`احجز استشارتك`, `طلب استشارة`, `استشارة مجانية`) are absent from the detector regex table.

### Branch A: Crawler & Multi-Page Observability (7.7% of FNs)
- **The Issue:** Targets where the main landing page contains minimal text, while the portal login or app downloads reside on `/login` or `/apps`.
- **Finding:** While the underlying `pilot-enrich-batch` crawled multiple pages, the backtest evaluation script evaluated HTML from `target.website_url` (homepage only), starving downstream detectors of deep-page evidence.

---

## 4. False Positive Analysis (8 Level-1 FPs)

The 8 observed False Positives reveal essential insights regarding production DOM realities:

1. **True Positives Misannotated in Baseline:**
   - `hn-016` (Hive Coworking): Emitted `WHATSAPP = PRESENT` with verified provenance `https://wa.me/96653624116`. Baseline marked `ABSENT`. (Detector was correct; reference was stale).
   - `69e1f2b8` (Smile Concepts): Emitted `QUOTE_CTA = PRESENT` with anchor text `"get a quote"`. Baseline marked `ABSENT`. (Detector was correct).
2. **Newsletter vs. Paid Membership:**
   - 3 clinics (`Pearl Dental`, `Kings Dental`, `First Dental`) triggered `ONLINE_MEMBERSHIP = PRESENT` due to footer newsletter subscription forms (`"recurring subscription: subscribe"`).
   - Finding: TransactionDetector regex `/subscribe/` needs contextual anchoring to paid plans vs email newsletters.
3. **E-Commerce Ancillary Retail in Clinics:**
   - 2 clinics (`ZED DENTAL`, `First Dental`) triggered `DIRECT_CHECKOUT = PRESENT` due to Shopify/WooCommerce widgets selling oral health retail products (`add-to-cart`).
   - Finding: The detector observed an authentic DOM transaction widget. Whether this represents clinical checkout or merchandise checkout belongs to Level-2 policy discernment.

---

## 5. Evidence Semantics & UNKNOWN Correctness

The audit confirmed the absolute health of **UNKNOWN Semantics (§6.1)**:
- Targets that failed crawl or experienced WAF challenge blocks (e.g. `hn-005` Tamra Capital, `hn-010` SMSA Express, `hn-020` CleanCo, `hn-022` Saudi Towing) cleanly emitted `UNKNOWN` across all atoms.
- **Zero Unsafe ABSENTs** were recorded across 46 targets.
- **Zero Hallucinated Provenance:** 100% of positive detections carried verified element, anchor, and URL citations.

---

## 6. Audit Verdict & Structured Recommendations

### Audit Verdict: **PASSED (Attribution Complete)**
The hypothesis that "the 118 mismatches are predominantly crawler failures" is **DISPROVEN**:
- **59.0%** of FNs stem from **Ground Truth Reference Over-Annotation** (labeling generic contact as consultation).
- **20.5%** of FNs stem from **SPA Client-Side Hydration** (static fetch vs. headless render).
- **12.8%** of FNs stem from **Taxonomy Key Mismatch & Arabic Regex Gaps**.
- Only **7.7%** of FNs stem from **Multi-page Traversal Gaps**.

### Sequential Remediation Order (For Future Phases):
1. **Phase 1 (Taxonomy & Reference Harmonization):**
   - Align `APPOINTMENT_CTA` vs `BOOKING_CTA` column naming.
   - Refactor `pilot_evidence_reference.csv` to respect the Gate 3.1 contract: generic `Contact Us` anchors cannot be ground truth for `CONSULTATION_CTA`.
2. **Phase 2 (Detector Pattern Polish):**
   - Add explicit Arabic consultation tokens (`احجز استشارتك`, `طلب استشارة`) to `CtaContextDetector`.
   - Constrain `TransactionDetector` `/subscribe/` pattern to avoid matching newsletter email inputs.
3. **Phase 3 (SPA / Headless Rendering Strategy):**
   - Only for confirmed SPAs (Yelo, Tawuniya, Flynas), evaluate selective Headless/Playwright rendering or retain `UNKNOWN` as the legitimate semantic state for unhydrated surfaces.

***
*Document generated under Read-Only Audit protocol. Zero database modifications performed.*
