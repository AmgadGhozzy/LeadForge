# LeadForge — Gate 5.10 Production Observation / Outcome Monitoring Contract

**Gate:** 5.10
**Title:** Production Observation / Outcome Monitoring Contract
**Mode:** DOCUMENTATION — MONITORING CONTRACT (no code, no schema changes, no DB mutations)
**Status:** PENDING — awaiting production data collection 🔒
**Date:** 2026-09-23
**Parent Gates:** `GATE-005.8` (Activation Authorization), `GATE-005.9` (Activation Implementation & Verification)
**Parent Contracts:** `ADR-005`, `ADR-006`, `GATE-005.4` (Independent Outcome Validation design)

---

## 1. Gate Definition

**Gate 5.10 — Production Observation / Outcome Monitoring.**

This is a **documentation / monitoring-cycle contract**, not an architecture gate. It defines exactly how the now-active rules (`DBPG`, `QIG`) are observed in production, how their outputs are checked against independent business-state observation, and how rule health is assessed.

Per the GPT review that closed Gate 5.9, this gate must NOT:

- Reopen any design cycle (no detector / crawler / schema / UNKNOWN-semantics work).
- Re-introduce or relax `WAPG` (remains `DEFERRED`).
- Add offer matching or any commercial downstream coupling.
- Treat production observations as Ground Truth.

**Scope boundary (DOCUMENTATION ONLY):** Zero new production code, zero schema changes, zero DB mutations, zero detector mutations, zero Ground Truth mutations.

---

## 2. Monitoring Pipeline

One monitoring cycle is defined as the following ordered pipeline. Each stage consumes the previous stage's output as input.

```text
ACTIVE RULES                          (DBPG + QIG, wired in engine.ts)
        ↓
Production Observations              (per-domain crawl + evaluation)
        ↓
Opportunity Outputs                  (OpportunityEvaluationOutput records, with provenance)
        ↓
Independent Outcome Verification     (separate business-state observation per output)
        ↓
FP / FN Attribution                  (classify each output against observed truth)
        ↓
Rule Health Assessment               (aggregated precision / recall / suppressions / UNKNOWN)
```

The cycle is **not** monotonic: every stage is logged, and the final health assessment feeds a rollback decision (Section 9). No stage may mutate production state.

---

## 3. Golden Rule

**Verbatim from the GPT review closing Gate 5.9:**

> Production observations are NOT Ground Truth automatically. `Rule Output ≠ Business Outcome`.

Consequences locked into this contract:

1. A rule firing for a domain does **not** mean the domain is a real opportunity.
2. A rule not firing for a domain does **not** mean the rule failed.
3. Every classification of an output (TP / FP / TN / FN) requires **independent outcome observation**, never inference from the rule output alone.

The same decoupling principle already enforced in Gate 5.4 applies here: `Opportunity` (evidence-based signal) is strictly separated from `Outcome` (commercially confirmed state).

---

## 4. Observation Schema

For every production evaluation of the active rules, a standardized observation record is captured. One record per rule evaluation per domain.

### 4.1 Common Fields

| Field | Type | Description |
|---|---|---|
| `rule_slug` | `'digital_booking_path_gap' \| 'quote_consultation_intake_gap'` | Which rule fired (or suppressed / not applicable) |
| `website_domain` | `string` | Fully-qualified crawled domain |
| `detected_at` | `ISO-8601 timestamp` | When the evaluation ran (UTC) |
| `opportunity_status` | `'OPPORTUNITY_DETECTED' \| 'SUPPRESSED' \| 'NOT_APPLICABLE' \| 'UNKNOWN'` | Rule verdict (mirrors `OpportunityStatus`) |
| `evidence_atoms_snapshot` | `AtomicEvidenceRecord` (immutable) | Level-1 atoms that were present at evaluation time |
| `confidence_signals` | `list of strings` | Provenance trail: intent_atoms, absent_atoms, suppressors_evaluated, audit_trail |

### 4.2 Per-Rule Required Extra Fields

| Rule | Extra observation fields |
|---|---|
| `DBPG` | Whether `ExternalBusinessState` was provided; `is_walk_in_only` flag; detected booking-capability gap reason |
| `QIG` | Destination surface state: `destination_crawled`, `destination_has_structured_form`, `resolved_channel`; external quote state (if any) |

**Frozen from Gate 5.4 / 5.5 semantics:** `VERIFIED_EXTERNAL_STATE` must never originate from a detector; `UNVERIFIED_EXTERNAL_STATE` must never be treated as confirmed business state. `UNKNOWN` must never convert to an opportunity.

Records are append-only logs; nothing in this schema may be derived, mutated, or back-filled after capture.

---

## 5. Independent Outcome Verification Contract

No output is classified without a **separate, independent observation of the business's actual state** — conducted by a mechanism other than the rule engine (human review, manual / external channel probing, direct contact surface inspection). Outcome **cannot** be inferred from the rule output alone.

### 5.1 DBPG — Digital Booking Path Gap

| Class | Condition (rule output → independent observation) |
|---|---|
| **TP** | Rule fired (`OPPORTUNITY_DETECTED`) **and** independent observation confirms the business genuinely has **no** digital booking / online appointment path (gap is real) |
| **FP** | Rule fired **and** independent observation confirms the business **already has** a working booking / appointment path (gap is false) |
| **TN** | Rule did not fire **and** independent observation confirms the business has a booking path (no gap, correct absence of signal) |
| **FN** | Rule did not fire **but** independent observation confirms the booking path is genuinely absent (gap missed) |

### 5.2 QIG — Quote / Consultation Intake Gap

| Class | Condition (rule output → independent observation) |
|---|---|
| **TP** | Rule fired **and** independent observation confirms the business has **no** structured quote / consultation intake (mailto/phone only routing is real) |
| **FP** | Rule fired **and** independent observation confirms the business **already has** a structured intake form / working quote path |
| **TN** | Rule did not fire **and** independent observation confirms structured intake exists |
| **FN** | Rule did not fire **but** independent observation confirms no structured intake (gap missed) |

Independent observations may only classify outputs; they may never alter the stored observation record retroactively.

---

## 6. FP / FN Attribution Rules

Attribution is performed **per rule**, on the independent-outcome-verification results from Section 5.

Definitive attribution definitions:

- **FP (False Positive):** Rule fired (`OPPORTUNITY_DETECTED`) but independent business-state observation shows the business already has the booking path (DBPG) or quote/intake path (QIG).
- **FN (False Negative):** Rule did not fire (returned `SUPPRESSED` / `NOT_APPLICABLE` / `UNKNOWN`) but the gap was confirmed present by independent observation.

Attribution invariants:

1. **No self-attribution:** a rule may never attribute its own output to TP/FP without an independent observation.
2. **`UNKNOWN` is never an opportunity** and never counts as TP, FP, or FN by itself; it is tracked separately (Section 7) as an observability-health signal.
3. **Suppressed positives** are only classified after independent observation; a suppressor that masks a real gap is an FN.
4. **Per-rule independence:** DBPG and QIG margins never merge; overlap is reported, never pooled.

---

## 7. Rule Health Assessment Criteria

Once attribution is complete, each rule is scored independently. Benchmarks are **minimum acceptance thresholds** for continued activation.

| Metric | Definition | Minimum threshold |
|---|---|---|
| **Precision** | `TP / (TP + FP)` | ≥ **0.90** (≤ 10% false positives) |
| **Recall** | `TP / (TP + FN)` | ≥ **0.80** |
| **Suppressor effectiveness** | Share of `SUPPRESSED` outputs later verified as genuinely suppressed (TN) | ≥ **0.95** (suppressors must not mask real gaps) |
| **UNKNOWN rate** | Share of evaluations returning `UNKNOWN` (observability gaps) | ≤ **0.15** (above this, crawl observability is the problem, not the rule) |

Any metric below threshold triggers the rollback path (Section 9) for that rule. Metrics are computed per rule over a minimum reporting window to avoid single-outlier decisions.

---

## 8. Prohibited Inferences

The following direct couplings are **forbidden** under this contract:

1. `Rule Output → Business Outcome` — inferring that a fired opportunity is commercially real without independent observation.
2. `Rule Silence → Business Has No Gap` — treating non-firing as proof of closure.
3. `Production Observations → Ground Truth` — promoting observation logs to golden ground truth (frozen per Gate 5.4).
4. `Rule → Offer` — any inference from an opportunity output into an offer catalog match (decoupling boundary from Gate 5.8 / 5.9).
5. **Any inference that re-opens the design cycle** for detectors, semantics, crawler, or `WAPG` based on activation.

---

## 9. Rollback Trigger

Automatic rollback protocol if the Rule Health Assessment (Section 7) finds acceptance-threshold failure:

| Trigger | Action |
|---|---|
| FP rate > 10% (precision < 0.90) for a rule | Revert `ACTIVE_OPPORTUNITY_RULES` to `[]` immediately |
| Recall < 0.80 | Revert to `[]`, investigate observability, then reassess |
| Suppressor effectiveness < 0.95 | Revert to `[]`, audit suppressors per contract before re-activation |
| UNKNOWN rate > 0.15 | Hold — fix observability before activation reassessment |

**Rollback primitive (verified in Gate 5.9):**

```typescript
ACTIVE_OPPORTUNITY_RULES = []   // ZERO_RULES baseline restored, instant, zero-mutation
```

Rollback requires no migration, no detector change, no Ground Truth change. After rollback, production returns to the frozen `ZERO_RULES` state, and observation data is retained for root-cause analysis.

---

## 11. Pre-Declared Thresholds (Frozen Before Data Collection)

These thresholds are locked before any production observations are collected. Adjusting them after seeing data is PROHIBITED.

### DBPG Rule Health Thresholds

- Precision threshold = **0.70 (70%)** — minimum acceptable precision before rule is considered healthy.
- Recall threshold = **0.60 (60%)** — minimum recall required.
- FP rollback trigger = **FP rate > 0.30 (30%)** for 2 consecutive evaluation windows.
- UNKNOWN rate ceiling = **0.25 (25%)** — if UNKNOWN exceeds this, rule inputs are insufficient.
- Minimum sample size = **50 `OPPORTUNITY_DETECTED` outputs** before any health verdict.

### QIG Rule Health Thresholds

- Precision threshold = **0.70 (70%)**.
- Recall threshold = **0.60 (60%)**.
- FP rollback trigger = **FP rate > 0.30 (30%)** for 2 consecutive evaluation windows.
- UNKNOWN rate ceiling = **0.25 (25%)**.
- Minimum sample size = **50 `OPPORTUNITY_DETECTED` outputs** before any health verdict.

### Rule Health vs Statistical Confidence

- **Rule Health** (`HEALTHY` / `UNHEALTHY`) is a binary gate — declared only after the minimum sample size is reached **AND** all thresholds pass.
- **Statistical Confidence** is separate — a rule can be statistically confident but still `UNHEALTHY` (e.g., confidently detecting a non-existent gap).
- A small-set 100% precision result is **NOT** proof of health — the minimum sample size must be met.

### Dual-Cohort Sampling Methodology

To ensure metrics are executable and statistically sound:
- **Detected Cohort (n ≥ 50 `OPPORTUNITY_DETECTED`):** Used strictly as the denominator for evaluating Precision (`TP / (TP + FP)`).
- **Non-Detected Cohort (Independent Sampling):** A representative, independent sample of domains where NO opportunity was detected is evaluated independently to determine False Negatives (`FN`) and True Negatives (`TN`).
- **Executable Recall:** `Recall = TP / (TP + FN)`. Recall is never calculated from the detected cohort alone, preventing positive-sampling bias.

### Evaluation Window

- **30-day rolling window.** Health is reassessed every 30 days.
- Rollback is triggered automatically if the FP rate exceeds the threshold in **2 consecutive windows**.

---

## 12. Gate Status

**Status: PENDING — awaiting production data collection 🔒**

This contract is now baselined as the standing monitoring procedure for the active rules. It goes LIVE once production evaluation produces observation records:

- → Start collecting per-domain observation records (Section 4).
- → Begin independent outcome verification on observed outputs (Section 5).
- → Produce the first Rule Health Assessment (Section 7).
- → Gate 5.10 closes as **PASS** only when the first full monitoring cycle completes with thresholds held.
- → Any threshold breach triggers the rollback path (Section 9) regardless of cycle completion.

Until then: **no code changes, no schema changes, no DB mutations — documentation only.**

---

*LeadForge Opportunity Engine — Monitoring Contract v1.0.0 (Gate 5.10)*