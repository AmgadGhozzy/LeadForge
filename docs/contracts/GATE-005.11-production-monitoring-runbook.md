# GATE-005.11: Production Monitoring Runbook & Operational Adjudication Procedure

## 1. Executive Summary & Purpose

This runbook establishes the strict operational procedure for executing the 30-day production observation cycle for active opportunity rules (`DigitalBookingRule` / `DBPG` and `QuoteIntakeRule` / `QIG`), as formally contracted in [GATE-005.10](file:///d:/MyProjects/LeadForge/docs/contracts/GATE-005.10-production-observation-contract.md).

Following the completion of design gates (5.0 through 5.10), this runbook guarantees that:
1. **Sampling is statistically sound, deterministic, and free from positive-cohort bias.**
2. **Precision and Recall are independently calculated via Dual-Cohort Sampling.**
3. **Machine-generated telemetry and human audit outcomes remain strictly decoupled.**
4. **Health thresholds pre-declared in Gate 5.10 are evaluated with complete provenance.**
5. **No code, database schema, or rule heuristics are modified during monitoring.**

---

## 2. Population Definition & Frame

### 2.1 Production Population

The **Production Population** encompasses all production lead evaluations processed by the Opportunity Engine where `ACTIVE_OPPORTUNITY_RULES = [DigitalBookingRule, QuoteIntakeRule]`.

### 2.2 Unit of Observation & Deduplication

- **Unit of Observation:** The unique canonical domain (`domain` / root hostname) per evaluation window.
- **Deduplication Policy:** 
  - A business domain may be rescanned or re-evaluated multiple times within a 30-day window.
  - For statistical health adjudication, only the **latest settled evaluation event** in the window represents the domain in the population frame.
  - Previous evaluation events within the same window remain archived for provenance and latency audit, but are excluded from health metric denominators.

### 2.3 Population Frame Freeze

At the conclusion of each 30-day window (`T_end`), the population frame is exported and frozen:
- Every evaluated domain is assigned an immutable `evaluation_id`.
- The population counts for `OPPORTUNITY_DETECTED`, `NO_OPPORTUNITY`, and `UNKNOWN` are locked.
- Hash of the population frame is generated and stored: `sha256(population_frame.json)`.

---

## 3. Dual-Cohort Sampling Architecture

To eliminate positive-sampling bias and ensure that Recall can be genuinely calculated, evaluation is split into two distinct, independently sampled cohorts:

```text
Frozen Population Frame (30-Day Window)
                 │
        ┌────────┴────────────────────────┐
        ▼                                 ▼
   Cohort A                          Cohort B
(Detected Cohort)              (Non-Detected Cohort)
        │                                 │
Rule emitted:                     Rule emitted:
OPPORTUNITY_DETECTED              NO_OPPORTUNITY / UNKNOWN
        │                                 │
Target: n ≥ 50                    Target: n ≥ 100
(100% census if n < 50)           (Independent PRNG Random Sample)
        │                                 │
Independent Audit                 Independent Audit
        │                                 │
    TP / FP                           FN / TN
        │                                 │
        ▼                                 ▼
Precision = TP / (TP + FP)         Recall = TP / (TP + FN)
```

### 3.1 Cohort A: Detected Cohort (Precision Denominator)

- **Eligibility:** Any domain where the rule emitted `OPPORTUNITY_DETECTED`.
- **Target Size:** `n ≥ 50` detected domains per active rule.
- **Sampling Method:**
  - If `total_detected ≤ 50`: 100% census (all detected instances are audited). Note: if `total_detected < 50` at the end of 30 days, the health verdict is deferred (`INSUFFICIENT_SAMPLE`).
  - If `total_detected > 50`: Stratified random sampling across business categories, preserving exact category distribution.
- **Metric Role:** Used exclusively to calculate **Precision** and **False Positive Rate**.

### 3.2 Cohort B: Non-Detected Cohort (Recall Denominator)

- **Eligibility:** Any domain where the rule evaluated the domain but did NOT detect an opportunity (`NO_OPPORTUNITY`, `EVALUATION_SKIPPED`, or `UNKNOWN`).
- **Target Size:** `n ≥ 100` domains per rule.
- **Sampling Method:**
  - Pure pseudo-random selection drawn from the non-detected population frame.
  - **Prohibited Practice:** Selecting cases based on human suspicion, keyword presence, or perceived missed opportunities is STRICTLY PROHIBITED.
- **Metric Role:** Audited to discover **False Negatives (FN)** and **True Negatives (TN)**, making Recall calculation mathematically valid.

---

## 4. Outcome Adjudication Procedure

For every sampled case in Cohort A and Cohort B, the adjudicator must execute the following five-step audit protocol:

```text
[Step 1: Inspect Frozen Evidence Snapshot]
                   ↓
[Step 2: Inspect Machine Rule Output & Reasoning]
                   ↓
[Step 3: Conduct Independent Business-State Verification]
                   ↓
[Step 4: Assign Canonical Classification (TP / FP / FN / TN / UNABLE_TO_VERIFY)]
                   ↓
[Step 5: Record Immutable Adjudication Record]
```

### 4.1 Adjudication Classifications

| Classification | Meaning for Cohort A (Detected) | Meaning for Cohort B (Non-Detected) |
|---|---|---|
| **TP (True Positive)** | Rule detected gap; independent audit proves business genuinely lacks digital path and needs it. | N/A |
| **FP (False Positive)** | Rule detected gap; independent audit proves business already has functional booking/quote path or does not fit domain model. | N/A |
| **FN (False Negative)** | N/A | Rule emitted no opportunity; independent audit proves business genuinely offered services requiring booking/quotes but lacked digital intake. |
| **TN (True Negative)** | N/A | Rule emitted no opportunity; independent audit confirms either digital path is present or business does not require one. |
| **UNABLE_TO_VERIFY** | Site offline, domain parked, geo-blocked, or authentication required. | Site offline, domain parked, geo-blocked, or authentication required. |

### 4.2 Handling `UNABLE_TO_VERIFY`

- `UNABLE_TO_VERIFY` must **NEVER** be converted silently into TN, FN, or FP.
- If `UNABLE_TO_VERIFY` cases exceed 25% of the sample, an **Observability Defect Warning** is issued.
- Metrics are calculated over verified cases:
  $$\text{Effective Sample} = n_{\text{total}} - n_{\text{UNABLE\_TO\_VERIFY}}$$
  If $\text{Effective Sample} < 50$, statistical confidence cannot be declared.

---

## 5. Sampling Integrity & Provenance Guarantee

### 5.1 Two-Layer Separation Architecture

To protect audit provenance and ensure machine telemetry cannot be retroactively tainted:

```text
┌────────────────────────────────────────────────────────┐
│ Layer 1: Machine-Generated Observation (READ-ONLY)      │
├────────────────────────────────────────────────────────┤
│ • observation_id (UUID)                                │
│ • window_id (e.g. 2026-W01)                            │
│ • rule_slug ("digital-booking" | "quote-intake")       │
│ • domain (canonical host)                              │
│ • timestamp (ISO 8601 UTC)                             │
│ • rule_output (OPPORTUNITY_DETECTED | NO_OPPORTUNITY)  │
│ • evidence_snapshot_hash (sha256)                      │
│ • cohort ("DETECTED" | "NON_DETECTED")                 │
│ • sampling_seed (hex string)                           │
└────────────────────────────────────────────────────────┘
                           │ (Read-only reference)
                           ▼
┌────────────────────────────────────────────────────────┐
│ Layer 2: Independent Audit Outcome (ADJUDICATION)       │
├────────────────────────────────────────────────────────┤
│ • audit_id (UUID)                                      │
│ • observation_id (Foreign Key to Layer 1)              │
│ • outcome_status (TP | FP | FN | TN | UNABLE_TO_VERIFY) │
│ • business_state_evidence (URL / Screenshot Ref)       │
│ • verification_source ("MANUAL_AUDIT" | "LIVE_INSPECT")│
│ • auditor_id (string)                                  │
│ • adjudication_timestamp (ISO 8601 UTC)                │
│ • justification_notes (text)                           │
└────────────────────────────────────────────────────────┘
```

**Inviolable Invariant:** Layer 2 cannot modify, delete, or overwrite any field in Layer 1.

### 5.2 Deterministic Random Sampling PRNG

To ensure that the sample can be reproduced by an independent party:
- The PRNG seed is deterministically generated at window freeze:
  $$\text{seed} = \text{sha256}(\text{window\_id} + \text{population\_hash} + \text{"leadforge-audit"})$$
- The PRNG algorithm is linear congruential or Mulberry32 with full audit log.

### 5.3 Substitution Policy

- Manual replacement of sampled domains is strictly **PROHIBITED**.
- If a domain is inaccessible or defunct, it must be marked `UNABLE_TO_VERIFY` with evidence recorded, not replaced with another domain.

---

## 6. 30-Day Rolling Window Timeline & Cadence

```text
Day 1                       Day 30             Day 37
  │                            │                  │
  ├────────────────────────────┼──────────────────┤
  │   Live Production Traffic  │   Audit Window   │
  │   Continuous Logging       │   Sampling &     │
  │   Layer 1 Telemetry        │   Adjudication   │
  │                            │   Health Report  │
  ▼                            ▼                  ▼
Window Start             Window Freeze      Verdict Released
```

1. **Days 1–30:** Continuous observation collection. No manual interventions.
2. **Day 30 (Freeze):** Population frame exported and locked with cryptographic hash.
3. **Days 31–36:** Cohort A and Cohort B samples drawn; independent outcome adjudication executed.
4. **Day 37 (Verdict):** Health Report compiled. If thresholds are breached, rollback procedure triggers.

---

## 7. Mathematical Formulations & Threshold Enforcement

### 7.1 Formula Definitions

$$\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}}$$

$$\text{Recall} = \frac{\text{TP}}{\text{TP} + \text{FN}}$$

$$\text{FP Rate} = \frac{\text{FP}}{\text{TP} + \text{FP}} = 1 - \text{Precision}$$

$$\text{UNKNOWN Rate} = \frac{\text{UNKNOWN Evaluations}}{\text{Total Evaluations}}$$

### 7.2 Pre-Declared Threshold Table (Frozen in Gate 5.10)

| Metric | DBPG Threshold | QIG Threshold | Action on Violation |
|---|---|---|---|
| **Minimum Precision** | $\ge 0.70$ | $\ge 0.70$ | Log warning; track for 2nd window |
| **Minimum Recall** | $\ge 0.60$ | $\ge 0.60$ | Observability review; hold rule |
| **FP Rollback Trigger** | $> 0.30$ | $> 0.30$ | Rollback if violated in 2 consecutive windows |
| **UNKNOWN Ceiling** | $\le 0.25$ | $\le 0.25$ | Freeze evaluation; audit input detectors |
| **Minimum Sample Size** | $n \ge 50$ detected | $n \ge 50$ detected | If $n < 50$: Verdict is `INSUFFICIENT_SAMPLE` |

### 7.3 Rule Health vs Statistical Confidence

- If $n_{\text{detected}} < 50$: Verdict is strictly `INSUFFICIENT_SAMPLE`. A score of 100% precision on $n=15$ does **NOT** grant `HEALTHY` status.
- A rule is marked `HEALTHY` if and only if:
  1. $n_{\text{detected}} \ge 50$.
  2. $\text{Precision} \ge 0.70$.
  3. $\text{Recall} \ge 0.60$.
  4. $\text{FP Rate} \le 0.30$.
  5. $\text{UNKNOWN Rate} \le 0.25$.

---

## 8. Rollback Protocol

If a rule violates the FP rate threshold ($> 0.30$) in two consecutive 30-day windows:

```text
Window W:   FP Rate > 0.30  ───►  STATUS: PROBATION (Window Violation #1)
                                      │
Window W+1: FP Rate > 0.30  ───►  STATUS: UNHEALTHY (Window Violation #2)
                                      │
                                      ▼
                             IMMEDIATE ROLLBACK
```

### 8.1 Rollback Action

In `supabase/functions/_shared/intelligence/opportunity/engine.ts`:

```typescript
// Rollback to ZERO_RULES baseline immediately
export const ACTIVE_OPPORTUNITY_RULES: OpportunityRule[] = [];
```

Rollback is:
- **Instantaneous:** Zero deployment dependencies.
- **Zero-mutation:** No database migration or cleanup script needed.
- **Audit-preserving:** Historical observations and audit logs remain intact.

---

## 9. Gate 5.12 Tooling Specification Preview (READ-ONLY)

Following the freeze of this runbook (Gate 5.11), Gate 5.12 will deliver a dedicated audit utility (`scripts/audit/observation-auditor.ts`):

- **Capabilities:**
  1. **Sampler:** Connects read-only to observation store, extracts population, draws Cohort A & Cohort B deterministically.
  2. **Evidence Viewer:** Renders frozen snapshot and rule justification for human auditor.
  3. **Audit Recorder:** Writes Layer 2 adjudication records without touching Layer 1.
  4. **Calculator:** Computes Precision, Recall, confidence intervals, and generates the 30-Day Health Report.
- **Boundary Restriction:** The tool contains **ZERO** opportunity heuristics or rule evaluation logic. It is strictly an auditing and verification instrument.

---

## 10. Gate Status

**Status: READY FOR BASELINE & GATE FREEZE 🔒**

- Gate 5.10: Monitoring Contract & Pre-Declared Thresholds (FINALIZED 🔒)
- Gate 5.11: Production Monitoring Runbook (FROZEN 🔒)
- Next Step: Gate 5.12 Tooling Design & Implementation (READ-ONLY Auditor)

---

*LeadForge Opportunity Engine — Monitoring Runbook v1.0.0 (Gate 5.11)*
