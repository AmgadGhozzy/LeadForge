# GATE-005.12: READ-ONLY Observation Sampling & Audit Tooling Design Contract

## 1. Architectural Scope & Boundary

This specification defines the architectural design for the **Observation Sampling & Audit Tooling** under Gate 5.12. 

In strict adherence to the guidance of [GATE-005.10](file:///d:/MyProjects/LeadForge/docs/contracts/GATE-005.10-production-observation-contract.md) and [GATE-005.11](file:///d:/MyProjects/LeadForge/docs/contracts/GATE-005.11-production-monitoring-runbook.md), this tooling is designed with a non-negotiable boundary:

```text
┌────────────────────────────────────────────────────────┐
│              ACTIVE OPPORTUNITY EVALUATION             │
│   (Production Engine: DigitalBookingRule & QuoteIntake)│
└───────────────────────────┬────────────────────────────┘
                            │  READ-ONLY TELEMETRY
                            ▼
┌────────────────────────────────────────────────────────┐
│                   GATE 5.12 TOOLING                    │
│                                                        │
│  ┌───────────┐    ┌───────────┐    ┌─────────────────┐ │
│  │  Sampler  │ ──►│ Evidence  │ ──►│  Audit Recorder │ │
│  │ (PRNG A/B)│    │  Viewer   │    │  (Layer 2 Store)│ │
│  └───────────┘    └───────────┘    └────────┬────────┘ │
│                                             │          │
│                                             ▼          │
│                                    ┌─────────────────┐ │
│                                    │   Calculator    │ │
│                                    │ (Health Report) │ │
│                                    └─────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 1.1 Inviolable Constraints
1. **READ-ONLY Access:** The tooling does not write, update, or alter live production tables or active engine runtime files.
2. **No Detector Execution:** The tool never invokes raw crawler scripts, DOM scrapers, or level-1 evidence detectors.
3. **No Opportunity Re-Evaluation:** The tool never calls `evaluateOpportunities()` or runs rule heuristics. It audits historical outputs as emitted.
4. **No LLM Judgment:** No LLM is used to judge fit, score opportunities, or interpret gaps. Adjudication is driven by deterministic evidence verification.
5. **No WAPG Involvement:** `WebsiteAcquisitionPathGap` remains permanently deferred; no tooling logic references or evaluates it.
6. **No Offer Matching:** No lead-offer assignment or sales pitch logic exists in this tooling.
7. **Two-Layer Immutability:** Machine-generated observation data (Layer 1) cannot be modified by human audit outcomes (Layer 2).

---

## 2. Component Specifications

### 2.1 Component 1: Deterministic Sampler (`sampler.ts`)

- **Purpose:** Extracts candidate domains from the frozen population frame and partitions them into Cohort A and Cohort B using deterministic mathematics.
- **Population Input:** A frozen array of Layer 1 `ObservationRecord` items representing all settled evaluations during a 30-day window $[T_{\text{start}}, T_{\text{end}}]$.
- **Deduplication:** Groups observations by `domain`. Selects the latest settled observation event per domain as canonical.
- **Cohort A (Detected Cohort):**
  - Predicate: `rule_output === "OPPORTUNITY_DETECTED"`.
  - Ordering: Deterministic sort by `(timestamp ASC, domain ASC)`.
  - Slice: First $N$ (target $N \ge 50$). If total available $< 50$, takes 100% census.
  - Purpose: Precision evaluation denominator.
- **Cohort B (Non-Detected Cohort):**
  - Predicate: `rule_output !== "OPPORTUNITY_DETECTED"`.
  - Ordering: PRNG shuffle using deterministic **Mulberry32** algorithm.
  - Seed Derivation:
    $$\text{seed} = \text{parseInt}(\text{sha256}(\text{window\_id} + \text{population\_hash} + \text{salt}).\text{slice}(0, 8), 16)$$
  - Slice: First $N$ (target $N \ge 100$).
  - Purpose: Recall / False Negative discovery denominator.
- **Sampling Manifest Output:**
  ```typescript
  interface SamplingManifest {
    window_id: string;
    population_size: number;
    population_hash: string;
    sampling_seed: number;
    algorithm: "mulberry32-v1";
    cohort_a_detected_ids: string[];     // Target: n >= 50
    cohort_b_non_detected_ids: string[]; // Target: n >= 100
    generated_at: string;
    manifest_hash: string;
  }
  ```

### 2.2 Component 2: Raw Evidence Viewer (`viewer.ts`)

- **Purpose:** Renders the exact frozen machine observation for human auditors without subjective framing.
- **Display Fields:**
  - `observation_id`, `domain`, `evaluated_at`, `rule_slug`.
  - `rule_output` (`OPPORTUNITY_DETECTED` vs `NO_OPPORTUNITY`).
  - `machine_reason`: The exact reason string emitted at runtime.
  - `level1_atoms`: Status of atoms (`has_booking_path`, `has_contact_form`, etc.).
  - `derived_atoms`: Level-2 signals and confidence indicators.
  - `evidence_snapshot_hash`: Cryptographic proof of the DOM snapshot inspected.
- **Display Invariant:** The viewer displays strictly what was captured at runtime; it does not add comments like "promising lead" or "likely gap".

### 2.3 Component 3: Independent Audit Recorder (`recorder.ts`)

- **Purpose:** Stores independent auditor evaluations in an isolated Layer 2 record store.
- **Audit Record Schema:**
  ```typescript
  interface AuditRecord {
    audit_id: string;
    observation_id: string;            // Foreign key to Layer 1
    domain: string;
    rule_slug: "digital-booking" | "quote-intake";
    cohort: "DETECTED" | "NON_DETECTED";
    independent_status: "CONFIRMED" | "NOT_CONFIRMED" | "UNABLE_TO_VERIFY";
    business_state_evidence: string;   // Verified URL, snapshot reference, or note
    verification_source: "MANUAL_INSPECTION" | "GROUND_TRUTH_ARCHIVE" | "THIRD_PARTY_VERIFIER";
    auditor_id: string;
    adjudicated_at: string;
    notes: string;
  }
  ```
- **Provenance Rule:** The recorder validates that the referenced `observation_id` exists in the frozen population frame and writes only to the audit log. It never touches Layer 1 files or database records.

### 2.4 Component 4: Metric Calculator & Report Generator (`calculator.ts`)

- **Purpose:** Deterministically evaluates the confusion matrix, calculates performance metrics, checks frozen thresholds, and produces the 30-Day Health Assessment.
- **Adjudication Mapping:**
  ```text
  ┌─────────────────────────┬───────────────────────┬──────────────┐
  │ Machine Rule Output     │ Audit Status          │ Adjudication │
  ├─────────────────────────┼───────────────────────┼──────────────┤
  │ OPPORTUNITY_DETECTED    │ CONFIRMED             │ TP           │
  │ OPPORTUNITY_DETECTED    │ NOT_CONFIRMED         │ FP           │
  │ NO_OPPORTUNITY          │ CONFIRMED             │ FN           │
  │ NO_OPPORTUNITY          │ NOT_CONFIRMED         │ TN           │
  │ ANY                     │ UNABLE_TO_VERIFY      │ INCONCLUSIVE │
  └─────────────────────────┴───────────────────────┴──────────────┘
  ```
- **Mathematical Formulations:**
  $$\text{Effective Sample} = n_{\text{total}} - n_{\text{INCONCLUSIVE}}$$
  $$\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}}$$
  $$\text{Recall} = \frac{\text{TP}}{\text{TP} + \text{FN}}$$
  $$\text{FP Rate} = \frac{\text{FP}}{\text{TP} + \text{FP}} = 1 - \text{Precision}$$
  $$\text{UNKNOWN Rate} = \frac{n_{\text{UNKNOWN}}}{n_{\text{population}}}$$

- **Threshold Comparison (Frozen from Gate 5.10):**
  - Minimum Precision: $\ge 0.70$
  - Minimum Recall: $\ge 0.60$
  - FP Rollback Trigger: $\text{FP Rate} > 0.30$
  - UNKNOWN Ceiling: $\le 0.25$
  - Minimum Sample Size: $n_{\text{detected}} \ge 50$

- **Health State Machine:**
  ```text
  Is n_detected < 50?
     ├── YES ──► State: INSUFFICIENT_SAMPLE (Never HEALTHY)
     └── NO  ──► All thresholds met?
                    ├── YES ──► State: HEALTHY
                    └── NO  ──► State: UNHEALTHY
                                  └── Did FP > 0.30 breach in 2 consecutive windows?
                                        ├── YES ──► Action: TRIGGER_ROLLBACK
                                        └── NO  ──► Action: LOG_WARNING
  ```

---

## 3. Directory & File Structure

```text
scripts/audit/
├── types.ts                    # Canonical data contracts
├── prng.ts                     # Deterministic Mulberry32 algorithm
├── sampler.ts                  # Cohort A & Cohort B sampler
├── calculator.ts               # Confusion matrix & metric evaluator
└── auditor.ts                  # CLI runner (sample, view, record, evaluate)

tests/unit/
└── observation_tooling.test.ts # Vitest suite covering all 17 criteria
```

---

## 4. Gate 5.12 Acceptance Ledger

| # | Criterion | Verification Mechanism |
|---|---|---|
| 1 | READ-ONLY production access | Script has zero INSERT/UPDATE queries to prod tables |
| 2 | No DB writes | Layer 1 and database tables remain untouched |
| 3 | No detector execution | Zero imports of `@detectors` or crawler modules |
| 4 | No opportunity evaluation | Zero calls to `evaluateOpportunities()` or rules |
| 5 | No LLM judgment | No AI/LLM SDK or API calls in audit pipeline |
| 6 | Cohort A deterministic | Identical population yields identical slice |
| 7 | Cohort B independent PRNG | Mulberry32 draws repeatable random sample |
| 8 | Frozen seed + population hash | Manifest logs SHA-256 and integer seed |
| 9 | Evidence provenance preserved | Level-1/2 atoms rendered verbatim |
| 10 | Audit layer cannot mutate telemetry | Schema enforces two separate interfaces |
| 11 | `UNABLE_TO_VERIFY` isolated | Excluded from TP/FP/FN/TN denominators |
| 12 | TP/FP/FN/TN reproducible | Deterministic mapping table implemented |
| 13 | Metrics use pre-declared thresholds | Gate 5.10 constants hardcoded |
| 14 | Insufficient sample ≠ HEALTHY | $n < 50$ yields `INSUFFICIENT_SAMPLE` |
| 15 | No WAPG involvement | Only DBPG and QIG active |
| 16 | No offer matching | Pure technical gap observation |
| 17 | 120 existing tests remain green | Vitest suite passes 100% |

---

*LeadForge Opportunity Engine — Tooling Design v1.0.0 (Gate 5.12)*
