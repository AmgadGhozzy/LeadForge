# GATE-005.10-A1 — Amendment to the Production Observation Contract (v3)

**Status:** DRAFT v3 — not frozen. Freeze requires the two owner confirmations in section 11 (O1, O2).
**Date:** 2026-10-18
**Supersedes:** A1 v2 (never frozen; was never under version control)
**Amends:** GATE-005.10, GATE-005.11, scope of Gate 5.13
**Basis:** P0, P0-R, P0-R2, P0-R3, P0-R4, P0-R5, P0-R6, P1-A-0 verification (all read-only)

---

## 1. Findings that drive this amendment

| Finding | Consequence |
|---|---|
| No production code writes `ObservationRecord`; no table exists | Telemetry (P1-A) must exist before any observation |
| `IntakeSurfaceEvidence` is never produced; crawler fetches 5 fixed paths | QIG always returns `UNKNOWN`; removed from 5.13 |
| `website_analyses` has 2 rows, none with `opportunity_output` | No production traffic; a 30-day window would observe nothing |
| 280 registered businesses; 31 overlap the datasets that informed DBPG; 208 clean with a crawlable site; 202 of them dental/medical | Census validation on existing businesses is feasible |
| 3 of 3 DBPG-supported pilot cases are among the 31 reference cases (3/31 = 9.7%; Wilson 95% about 3%–25%) | Expected detections on 202 in-scope businesses ≈ 20, very uncertain |
| `docs/` was fully gitignored; contracts were never version-controlled | "Freeze" had no verifiable meaning; see A1.9 |

This amendment is made before any DBPG performance data exists on the validation population. Every change responds to volume, capability, or governance findings, not to results.

## 2. A1.1 — Scope

- **DBPG only.** QIG leaves 5.13 and moves to its own ADR and gate (destination-crawl capability). WAPG stays `DEFERRED`.
- The 30-day production monitoring window is deferred to a later gate (suggested 5.13-M), to start when production traffic exists.

## 3. A1.2 — Mode: Census Validation (Gate 5.13-C)

One frozen population, analyzed once under frozen code, then adjudicated. It is not production monitoring and must not be described as such.

`T0` and the 30-day clock are replaced by a freeze event **`C0`**, which records: population list SHA-256, code commit SHA, sampling seed, rubric version, thresholds.

## 4. A1.3 — Population

**Scope (target population):** appointment-based service businesses: dental and medical clinics, and salons/spas. Results apply to this scope only.

**Excluded from scope:** law offices and consultancies (the word "consultation" triggers intent atoms easily; a separate stratum may be studied in a later gate), non-appointment sectors (restaurants, associations).

**Eligibility:** a crawlable website; one business per domain.

**Strata reported separately:** sector, and country/region (Middle East and Egypt vs English-speaking countries). Verdicts use the pooled population. Strata are descriptive only.

**Development-set exclusion criterion:** any business ID or domain appearing in a dataset that informed DBPG or its components (`CtaContextDetector`, `TransactionDetector`, `SelfServiceDetector`, `AtomicEvidenceEvaluator`) is excluded: the 46-case pilot (31 reference + 15 hard negatives), Gate 4 backtest data, golden fixtures, Gate 5.2 and 5.4 cases. Matching is by ID or domain.

**Datasets under `scripts/validate/datasets/` (phase-8b):** not git-tracked, so their purpose cannot be proven from history (status UNKNOWN). They are treated as not having informed DBPG **on the owner's attestation (O1)**. If O1 is "yes" or "partially", the attested groups are excluded and the clean population drops to about 14, and this amendment must be revised before freeze.

**Timing note:** the narrower exclusion criterion was adopted after seeing overlap counts and before any DBPG result on the affected businesses. A **sensitivity analysis** is mandatory: the same verdict computation on the strictly clean subset (businesses outside every dataset, including phase-8b), reported descriptively.

**Counts at drafting time:** 280 registered, 31 development-set matches, 249 clean, 208 with a crawlable website, 202 in scope.

## 5. A1.4 — Batches, stopping rule, sampling

- **C0 population:** the in-scope clean businesses already registered, listed in a population file frozen before the run.
- **Extension batches:** if detected cases `n < 50` after C0, additional batches of about 150 crawlable in-scope businesses may be sourced. Each batch is frozen (list SHA recorded) before analysis, excludes anything seen in any dataset, and runs under the same code SHA.
- **Stop** at the first of: `n ≥ 50`, or 600 newly sourced businesses. The decision uses detected counts only, never adjudication results. Adjudication starts after the last batch.
- **Cohort A:** all `OPPORTUNITY_DETECTED`. **Cohort B:** 100 sampled from non-detected using the seeded sampler (Mulberry32, seed from window ID + population hash + rule slug); all of them if fewer than 100.
- **Blinded adjudication, single reviewer:** (1) rubric frozen first: DBPG ground truth = the business serves clients by appointment AND no digital booking path is discoverable on its website after manual review (absence on the site is not absence at the company, per ADR-006). (2) Cohorts A and B are merged into one shuffled list without a cohort label, exported as CSV with business name, domain, URL only; never status, atoms, or audit trail. (3) The reviewer records `is_appointment_based` and `digital_booking_path_present` (TRUE/FALSE/UNKNOWN). (4) CSV is imported by a script that checks `rubric_version` and sets `locked_at`; Layer 2 is joined to Layer 1 only after the lock. Known limitation: the single reviewer is also the developer.

## 6. A1.5 — Verdict tiers

Thresholds unchanged: Precision ≥ 0.70, Recall ≥ 0.60, UNKNOWN ratio ≤ 0.25.

| Detected cases (n) | Verdicts |
|---|---|
| n ≥ 50 | `PASS` / `FAIL` per thresholds |
| 15 ≤ n < 50 | `PROVISIONAL_PASS` / `PROVISIONAL_FAIL` / `PROVISIONAL_INCONCLUSIVE` |
| n < 15 | `INSUFFICIENT_SAMPLE` |

- `PROVISIONAL_PASS`: point estimates meet the thresholds and the Wilson lower bound for Precision ≥ 0.50.
- `PROVISIONAL_FAIL`: the Wilson upper bound for Precision < 0.70.
- Otherwise `PROVISIONAL_INCONCLUSIVE`.

A provisional verdict is never validation. DBPG stays `ACTIVE`; its label becomes `PROVISIONALLY_VALIDATED` at best. A `PROVISIONAL_FAIL` triggers a documented deactivation review. The "two consecutive windows" rollback rule does not apply to a single census.

Wilson 95% interval for p̂ = x/n, z = 1.96: center = (p̂ + z²/2n) / (1 + z²/n); half-width = z·√(p̂(1−p̂)/n + z²/4n²) / (1 + z²/n). Recall is estimated from Cohort B scaled to the non-detected population, with an interval, using the method in `calculator.ts` after verifying it against GATE-005.11.

## 7. A1.6 — Vocabulary, statuses, population states

| Production slug | Tooling slug |
|---|---|
| `digital_booking_path_gap` | `digital-booking` |
| `quote_consultation_intake_gap` | `quote-intake` (kept for QIG's future gate) |

| Production status | Tooling treatment |
|---|---|
| `OPPORTUNITY_DETECTED` | Cohort A |
| `NO_GAP` | `NO_OPPORTUNITY`, Cohort B eligible |
| `SUPPRESSED` | new tool status, non-detected, Cohort B eligible |
| `UNKNOWN` | counted in UNKNOWN ratio |
| `NOT_APPLICABLE` | new tool status, excluded from denominators |

Extending the tool vocabulary is a change to frozen Gate 5.12 artifacts and requires all existing audit-tool tests plus new mapping tests to pass.

**Population states:** every business in a frozen population ends in exactly one state: `OBSERVED`, `CRAWL_FAILED`, or `EXCLUDED(reason)`. Reconciliation: population size = sum of the three counts.

## 8. A1.7 — `confidence_signals`

Per GATE-005.10 §4.1 it is a list of strings: `intent_atoms`, `absent_atoms`, `suppressors_evaluated`, `audit_trail`. Stored as `TEXT[]`, each entry prefixed `intent:`, `absent:`, `suppressor:`, `audit:`. No score and no new computation.

## 9. A1.8 — Evidence snapshot hash

One shared function for the live path and the batch runner: SHA-256 of the canonical JSON of the atomic evidence record, the customer-journey evidence, and the observability inputs (`observability_sufficient`, `pages_observed`), all taken before the rule runs. It excludes `derived_atoms`, rule outputs, and `profile.aggregateHash` (which hashes identity, raw text, and scores, not evidence).

## 10. A1.9 — Version control and freeze procedure

1. Track `docs/contracts/` in Git (`docs/*` ignored, `!docs/contracts/` allowed).
2. Import existing contracts in one **baseline commit** labelled as-found state of 2026-10-18. Earlier "frozen" claims for gates before this commit cannot be verified retroactively; this is recorded here as a known limitation.
3. A freeze is a commit plus an annotated tag (for this amendment: `gate-5.13-A1-v3`). Frozen documents are never edited in place; changes come as a new amendment version.
4. An evidence manifest (SHA-256 per file) covers `scripts/pilot_data/*` and `tests/fixtures/*` only. Contracts are versioned by Git, not hashed in the manifest (a hash of a living document goes stale).
5. The frozen population list (JSON, no personal data) is committed; its SHA-256 is recorded at `C0`. Run outcomes live in the database, never in the frozen list.

## 11. Preconditions to `C0` and open owner confirmations

- **O1 — owner attestation (pending):** the owner states whether phase-8b businesses were reviewed by hand or used to shape the patterns of DBPG or its three detectors. Required before freeze.
- **O2 — token revocation (pending):** the owner confirms the Supabase access token was revoked in the Dashboard (a local `supabase logout` alone does not revoke it).
- P1-A implemented and verified (observation tables, shared writer, adapter), with the design contract frozen first.
- All detector changes in `supabase/functions/` committed or reverted; behavioral changes (`ambiguous`/`evidence_level` in four detectors; `BookingDetector` corroboration) in separate commits from type-only changes; code SHA recorded.
- Backfill of older analyses is not performed.
- Cost and runtime of the batch runner approved (no LLM; same modules and code SHA).
- Reviewer interface: CSV export/import (not Supabase Studio, which would expose Layer 1 columns).

## 12. Unchanged

Precision/Recall/UNKNOWN thresholds, fail-closed rules, LLM exclusion from opportunity logic, WAPG deferral, immutability of Layer 1.

## 13. Deviation log

| Date | Deviation | Handling |
|---|---|---|
| 2026-10-18 | During read-only rounds the agent unpaused the production Supabase project, used the service-role key, and a personal access token was exposed in a transcript | Token to be revoked (O2); read-only DB role recommended for later rounds |

## 14. Change log

| Version | Date | Change |
|---|---|---|
| A1 v2 | 2026-10-18 | Census mode, tiers, mapping (never frozen) |
| A1 v3 | 2026-10-18 | Population, criterion-based exclusion, batches, blinded protocol, hash definition, version-control procedure |
