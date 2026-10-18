# GATE-004 — Evidence Layer Backtest Contract & Annotation Specification

**Status:** DRAFT / FROZEN FOR REVIEW (Gate 4.0 Contract Freeze)  
**Date:** 2026-09-22  
**Governing Documents:**  
- `ADR-004` (Evidence Layer Freeze)  
- `ADR-005` (Opportunity Engine Freeze / `ZERO_RULES`)  
- `ADR-006` (Opportunity Evidence Design & Architecture)  
- `GATE-002` (Golden Fixtures Report — PASS)  
- `GATE-003.1` (Detector Remediation Report — PASS)  
- `HARD_NEGATIVE_CONTROL_SPEC v1`  

---

## 1. Purpose & Core Scientific Objective

The objective of Gate 4 is **NOT** to evaluate whether businesses qualify as "Lead Nurturing Opportunities".  
Gate 4 evaluates **one single scientific question**:

> **Does the Production Evidence Pipeline extract observed facts from real-world websites with the exact same semantics, tri-state hygiene, and provenance integrity proven on the synthetic Golden and Hard-Negative Fixtures?**

```
46 Real-World Targets (31 Ref + 15 Hard Negatives)
                     ↓
          Deployed Scraper / Pipeline
                     ↓
         Production DetectionEngine
                     ↓
        Level-1 Atomic Evidence (9 Atoms)
                     ↓
   Level-2 Deterministic Derivation (4 Signals)
                     ↓
              Evidence Backtest
                     ↓
            ZERO Opportunity Policy
                     ↓
          OPPORTUNITY_RULES = [] (FROZEN 🔒)
```

---

## 2. Cardinal Architectural Invariants

1. **The A/C/E Failure Mode Prohibition:**  
   Under no circumstances shall prior labels (`FIT = 1` or `NOT_FIT = 0`) be treated as the ground truth for Evidence.  
   - `FIT = 1` does **NOT** imply `HAS_ACQUISITION_PATH = PRESENT`.
   - `NOT_FIT = 0` does **NOT** imply `HAS_ACQUISITION_PATH = ABSENT`.  
   The 31 Reference + 15 Hard Negative businesses are a **stratified test population**, not an evidence truth set.
2. **Raw Observation First. Classification Second. Policy Never:**  
   - Level-1 detectors observe raw HTML/DOM tokens and emit atomic polarities (`PRESENT | ABSENT | UNKNOWN`).
   - Level-2 deterministically derives commercial journey signals without guessing intent.
   - Level-3 (`OpportunityEngine`) remains strictly empty (`OPPORTUNITY_RULES = []`).
3. **Tri-State Semantics & The Evidence Sufficiency Guard (§6.1):**  
   - `ABSENT` is an affirmative evidence claim requiring adequate observable surface coverage.
   - If crawl coverage is partial, pages were blocked, single unrendered homepage was returned, or surface is inaccessible $\longrightarrow$ polarity MUST be `UNKNOWN`, **never** `ABSENT`.
4. **Hard Negative Realism:**  
   - A hard-negative site possessing an actual phone number or quote form SHOULD have `PHONE = PRESENT` or `QUOTE_CTA = PRESENT`.  
   - The detector tells the truth of what exists; the policy layer (Gate 5+) evaluates commercial significance. We penalize hallucinated atoms, not accurate observations.
5. **Zero Mutation Guarantee:**  
   - Database mutations: `0`.
   - Production Opportunity Rules: `0`.
   - Live website scraping: Isolated execution without modifying production business tables.

---

## 3. Test Population (46 Businesses)

The test corpus consists of 46 real-world commercial websites:

### 3.1 Stratum A: 31 Reference Businesses (from Pilot Batch)
- Previously evaluated under pilot benchmarks.
- Represent diverse service categories: B2B services, industrial consulting, local trades, agencies, and retail.
- Metadata source: `scripts/pilot_data/pilot_candidate_inputs_v2.csv`.

### 3.2 Stratum B: 15 Hard Negatives (Frozen Control Group)
- High-risk failure modes identified in ADR-006 §1.2:
  1. **Regulatory Disclosures:** Financial/legal entities with contact channels purely for regulatory compliance (e.g., Lendo `hn-006`).
  2. **Emergency Dispatch / App-Only:** Mobile app services with emergency contact lines (e.g., Morni `hn-007`).
  3. **Support-Only Channels:** Businesses with WhatsApp/phone solely dedicated to post-sale customer care (e.g., PureGym `hn-014`).
  4. **Self-Service / Membership Checkout:** Subscription/membership portals without sales nurturing (e.g., FitnessFirst `hn-015`, Hive `hn-016`).
  5. **Ambiguous / Uncontextualized Contact:** Contact buttons lacking sales or service context.
- Metadata source: `scripts/pilot_data/hard_negatives_frozen_15.json`.

---

## 4. Evidence Annotation Specification (Independent Ground Truth)

Before running the backtest, an independent reference file `scripts/pilot_data/pilot_evidence_reference.csv` must be established.  
Every target is annotated across the following schema based on **direct inspection of the live website/HTML**:

### 4.1 Schema Definition

| Field | Type | Description |
| :--- | :--- | :--- |
| `business_id` | `string` | Unique identifier (e.g., `ref-001`, `hn-001`) |
| `business_name` | `string` | Entity name |
| `website_url` | `string` | Normalized target URL |
| `stratum` | `REFERENCE \| HARD_NEGATIVE` | Population stratum |
| **Level 1 Atomic Ground Truth** | | |
| `exp_DIRECT_CHECKOUT` | `PRESENT \| ABSENT \| UNKNOWN` | E-commerce cart, checkout buttons, payment forms |
| `exp_QUOTE_CTA` | `PRESENT \| ABSENT \| UNKNOWN` | Explicit quote/pricing/RFQ buttons or forms |
| `exp_CONSULTATION_CTA` | `PRESENT \| ABSENT \| UNKNOWN` | Explicit consultation/advisory booking buttons |
| `exp_APPOINTMENT_CTA` | `PRESENT \| ABSENT \| UNKNOWN` | Explicit appointment/slot reservation buttons |
| `exp_APPLICATION_CTA` | `PRESENT \| ABSENT \| UNKNOWN` | Explicit application/intake onboarding forms |
| `exp_WHATSAPP` | `PRESENT \| ABSENT \| UNKNOWN` | Valid WhatsApp link/hostname (`wa.me`, `api.whatsapp.com`) |
| `exp_SELF_SERVICE_PORTAL` | `PRESENT \| ABSENT \| UNKNOWN` | Customer/client login portals |
| `exp_ONLINE_MEMBERSHIP` | `PRESENT \| ABSENT \| UNKNOWN` | Recurring subscription/membership join flow |
| `exp_APP_BASED_SERVICE` | `PRESENT \| ABSENT \| UNKNOWN` | App Store / Google Play links as primary workflow |
| **CTA Context Observables** | | |
| `exp_cta_channel` | `string` | `WHATSAPP \| PHONE \| EMAIL \| FORM \| NONE` |
| `exp_cta_label` | `string` | Exact visible button/link text |
| `exp_surrounding_text` | `string` | Immediate container/headline text |
| **Level 2 Derived Expectations** | | |
| `exp_HAS_ACQUISITION_PATH` | `PRESENT \| ABSENT \| UNKNOWN` | Derived: `QUOTE ∨ CONSULTATION ∨ APPLICATION` |
| `exp_HAS_SELF_SERVICE_PATH` | `PRESENT \| ABSENT \| UNKNOWN` | Derived: `CHECKOUT ∨ MEMBERSHIP ∨ APP` |
| `exp_REQUIRES_HUMAN_INTERACTION` | `PRESENT \| ABSENT \| UNKNOWN` | Derived: `(QUOTE ∨ CONSULTATION) ∧ ¬CHECKOUT` |
| `exp_CUSTOMER_JOURNEY_STAGES` | `PRESENT \| ABSENT \| UNKNOWN` | Explicit numbered/named workflow stages declared on site |

---

## 5. Execution Pipeline & Architecture

The backtest must run through the actual deployed pipeline code (`DetectionEngine.runAtomicEvidence`):

```
Target URL 
   ↓
Live Scraper / Fetcher (Record crawl_status, pages_scraped, coverage)
   ↓
ScanCoverage Object (pages_scraped, journey_pages_observed, crawl_coverage)
   ↓
AtomicEvidenceEvaluator.evaluate(html, pages, coverage)
   ├── TransactionDetector.detect()
   ├── CtaContextDetector.detect()
   ├── SelfServiceDetector.detect()
   └── Evidence Sufficiency Guard (§6.1)
   ↓
Output Record:
   ├── AtomicEvidenceMap (9 atoms with polarity + provenance)
   ├── CtaContext (channel, label, surrounding_text, destination_url)
   ├── JourneyStages (declared stages count)
   └── DerivedSignals (Level-2 deterministic signals)
```

---

## 6. Evaluation Metrics & Pass Criteria

Gate 4 results are evaluated across **four distinct metric groups**:

### Group A: Detection Correctness
For each of the 9 Level-1 atoms:
- **Confusion Matrix:** $TP, FP, FN, TN, UNKNOWN$ (computed only on evaluable, sufficiently observed sites).
- **Precision, Recall, Specificity:** Assessed per detector.
- **Zero-Tolerance Rule:** Hallucinating atoms not present in the DOM ($FP$) is a blocker.

### Group B: UNKNOWN Correctness & Observability Hygiene
- **UNKNOWN Rate:** Monitored per detector and grouped by `crawl_status`.
- **Sufficiency Invariant:** Sites with single-page crawl or blocked sub-pages MUST report `UNKNOWN` on journey atoms (e.g., `DIRECT_CHECKOUT`, `QUOTE_CTA`), never false `ABSENT`.
- High UNKNOWN on poorly crawled sites is treated as **correct conservatism**, not a defect.

### Group C: Provenance Integrity
Every `PRESENT` atom emitted by the pipeline MUST carry:
1. `detector`: Emitting detector name.
2. `method`: Detection method (e.g., `HTML_SCAN`).
3. `anchor_text`: Snippet of matched DOM text.
4. `destination_url`: Target URL or link destination (when applicable).
*Any `PRESENT` atom lacking verified provenance constitutes an immediate FAIL.*

### Group D: Cross-Layer Separation & Policy Isolation
- Level-1 atoms feed Level-2 deterministic rules strictly per ADR-006 formulas.
- `PHONE = PRESENT` or `WHATSAPP = PRESENT` alone MUST NEVER generate `HAS_ACQUISITION_PATH = PRESENT`.
- Zero interaction with Opportunity rules (`OPPORTUNITY_RULES = []`).

---

## 7. Execution Order (G4 Roadmap)

1. **G4.0 — Contract Freeze (This Document):**  
   Commit contract and annotation specification; establish invariants before any live runs.
2. **G4.1 — Independent Annotation:**  
   Inspect the 46 businesses and produce `scripts/pilot_data/pilot_evidence_reference.csv` (human verified evidence, no LLM label leakage).
3. **G4.2 — Deployed Pipeline Run:**  
   Execute evidence extraction against the 46 targets using the production `DetectionEngine` without database writes.
4. **G4.3 — Evidence Diff & Coverage Matrix:**  
   Produce automated comparison report between observed atoms and annotated expectations.
5. **G4.4 — Forensic Provenance Audit:**  
   Inspect samples of `PRESENT`, `ABSENT`, and `UNKNOWN` detections against raw scraped DOM.
6. **G4.5 — Formal Gate 4 Report (`GATE-004-evidence-backtest-report.md`):**  
   Compile full confusion matrices, UNKNOWN rates, and forensic findings for ratification.

---

## 8. Gate 4 Mandatory Exit Criteria

Before Gate 4 can be declared **PASS**:
- [ ] Database mutations = `0`.
- [ ] Production Opportunity Rules = `0` (`OPPORTUNITY_RULES = []`).
- [ ] Golden Fixtures regression suite = `100% PASS` (74/74).
- [ ] Zero unsafe `ABSENT` emissions under insufficient crawl coverage.
- [ ] Provenance present and valid on 100% of `PRESENT` atoms.
- [ ] Hard Negative controls confirm zero false acquisition path derivations.
- [ ] Per-detector confusion matrices documented and audited.

---

*Contract ratified for Gate 4 execution. No production code modified. `OPPORTUNITY_RULES` remains `[]`.*
