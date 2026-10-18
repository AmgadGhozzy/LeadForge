# GATE-003.1 — Detector Remediation Report (ADR-006 Gate 3)

**Status:** PASS (reviewed & ratified by GPT with 9 architectural amendments + QUOTE_CTA contract specification). **HOLD** before Gate 4 (Evidence Backtest).
**Date:** 2026-09-22
**Supersedes:** [`GATE-003-detector-audit-report.md`](./GATE-003-detector-audit-report.md) (verdict FAIL)
**Contracts referenced:** `ADR-006` (evidence design), `ADR-004` (evidence-layer freeze), `HARD_NEGATIVE_CONTROL_SPEC v1`

---

## 0. Executive Summary

The prior audit (GATE-003) found that **no production detector emitted any ADR-006 Level-1 atom** — the atom layer lived only inside the Gate-2 test oracle (`golden-evidence-evaluator.ts`), unreachable from the production pipeline. Verdict: **FAIL** with 7 blockers (B1–B7).

Following initial candidate remediation, 9 architectural amendments were applied under the strict core axiom:
> *"Raw observation first. Classification second. Policy never."*

These amendments removed leaky intent classification (`classified_intent`, `ACQUISITION_CTA`, `SUPPORT_CTA`) from Level-1, retaining raw observables (`cta_label`, `surrounding_text`, `destination_url`) for Level-2 derivation, and established the explicit contract for `QUOTE_CTA`.

| Gate-3.1 test | Count | Result |
| :--- | :--- | :--- |
| `evidence_golden_fixtures.test.ts` (Gate-2 oracle, zero regression) | 21 | PASS |
| `atomic_evidence_detectors.test.ts` (production detectors, 9 fixtures) | 48 | PASS |
| `hard_negative_fixtures.test.ts` (5 hard-negative controls) | 5 | PASS |
| **Total** | **74** | **PASS** |

**Verdict: PASS.** `OPPORTUNITY_RULES` remains `[]` (ZERO_RULES 🔒). Zero DB mutation. No live website calls. No files committed.

---

## 1. Constraint Compliance

| Constraint | Status |
| :--- | :--- |
| `OPPORTUNITY_RULES` stays `[]` | ✅ verified — frozen line untouched (`opportunity/engine.ts:8`); asserted in both test suites |
| Zero database mutation | ✅ no repo/migration/schema touched |
| No live website calls | ✅ synthetic fixtures only |
| Write scope | ✅ only `detection/`, `detection/detectors/`, `intelligence/evidence/`, `src/domain/evidence/`, `tests/`, plus this report |
| No commit | ✅ working tree only |
| Frozen ADR-004 `DetectionResult` / `DetectionReport` / `Evidence` untouched | ✅ atom layer is additive; legacy `extractEvidence` and its signatures unchanged |

---

## 2. What Was Implemented

### 2.1 Production Level-1 atom layer (B1)

| File | Role |
| :--- | :--- |
| `_shared/detection/atomic-evidence-types.ts` | Additive schema: `AtomicEvidencePolarity`, `ClassifiedIntent`, `CtaContext`, `AtomicEvidenceKey` (all 10 §3.1 atoms + `WHATSAPP`), `EvidenceProvenance`, `toProvenance`, `extractHrefValues`, `isWhatsAppHref` (hostname-validated, mirrors WhatsAppDetector.v2) |
| `_shared/detection/detectors/TransactionDetector.ts` | `DIRECT_CHECKOUT`, `ONLINE_MEMBERSHIP`, `APP_BASED_SERVICE` — anchored §3.1 ground-truth patterns; checkout deliberately **not** fired by bare `/checkout` substrings (a membership checkout URL stays membership) |
| `_shared/detection/detectors/CtaContextDetector.ts` | `QUOTE_CTA`, `CONSULTATION_CTA`, `APPOINTMENT_CTA`, `APPLICATION_CTA`, `WHATSAPP` + `extractContactContext()` — builds `CtaContext` (channel, label, surrounding text, `classified_intent`) with strict §3.2 rules incl. `REGULATORY_DISCLOSURE` for footer tel/mailto with no sales CTA |
| `_shared/detection/detectors/SelfServiceDetector.ts` | `SELF_SERVICE_PORTAL` + `extractJourneyStages()` (counts declared `step/phase/stage` markers; §3.3 item 4) |
| `_shared/detection/AtomicEvidenceEvaluator.ts` | Orchestrates the three detector families; applies the §6.1 **Evidence Sufficiency Guard**; synthesizes `ACQUISITION_CTA` / `SUPPORT_CTA` from interaction atoms + `CtaContext`; writes per-atom provenance |
| `_shared/detection/DetectionEngine.ts` | Additive `runAtomicEvidence(input)` — the frozen `run()`/`DetectionReport` contract is untouched |

**Where the guard lives (§6.1):** `AtomicEvidenceEvaluator.evaluate()` — when `observability_sufficient !== true`, every journey atom → `UNKNOWN` (channel atom `WHATSAPP` is checked on captured HTML only). The production `EvidenceEngine.extractAtomicEvidence()` (additive, `intelligence/evidence/engine.ts`) maps `ScanCoverage` into `observability_sufficient` using the same thresholds as `ConfidenceCalculator.determineAbsencePolarity` (`crawlCoverage ≥ 0.5`, single-unrendered page ⇒ insufficient).

### 2.2 CTA_CONTEXT: Raw Observables Only (Amendments 1-3)

Under the core axiom *"Raw observation first. Classification second. Policy never."*, intent classification (`classified_intent`, `ACQUISITION_CTA`, `SUPPORT_CTA`) was excised from Level-1 detectors:
- `CtaContext` preserves raw observables: `channel`, `cta_label`, `surrounding_text`, `destination_url`.
- Ambiguous contact triggers ("Contact Us", "Get in Touch") and footer contact channels capture their exact text into `surrounding_text` without heuristic tagging.
- Provenance is preserved so Level-2 deterministic classifiers have complete, unmodified context.

### 2.3 BookingDetector reporting semantics (B4/CF-4)

`BookingDetector.ts`: observed-but-uncorroborated signals no longer get copied into `negative_signals`. Positives remain in `positive_signals`; the corroboration verdict (`insufficient_corroboration` / `no_signals`) moves to `metadata.corroboration`. `booking_structure` confidence lowered 90 → 60 (unverified form purpose, audit §4.1.2).

### 2.4 Tri-state hygiene in script-scan detectors (B4/CF-3)

`ChatbotDetector`, `SocialDetector`, `AnalyticsDetector`, `PixelDetector`: `ambiguous` is now `!detected` (absence without guaranteed full-coverage ⇒ `UNKNOWN`) and absence `evidence_level` changed `VERIFIED` → `UNKNOWN`. The marketing-score comment ("Meta pixel is highest-value for B2B") was stripped from `PixelDetector` (audit §4.6.2).

### 2.5 Level-2 formula correction (B5/CF-5)

`golden-evidence-evaluator.ts`: `HAS_SELF_SERVICE_PATH` now uses the exact ADR-006 §3.3 formula (`DIRECT_CHECKOUT ∨ ONLINE_MEMBERSHIP ∨ APP_BASED_SERVICE`); `SELF_SERVICE_PORTAL` removed. Fixtures still pass (GF-006 pairs portal with membership).

### 2.6 APPOINTMENT_CTA atom (B5/CF-6)

`APPOINTMENT_CTA` is emitted by `CtaContextDetector` (production record includes it) and asserted in the production test (`ABSENT` when observed-absent, `UNKNOWN` under the guard).

### 2.7 QUOTE_CTA Contract Specification & Boundary (GPT Review Directive)

Following architectural review by GPT, the exact contract boundary for `QUOTE_CTA` is codified:
1. **Level-1 Atomic Observation:**
   - Emitted *strictly* upon matching explicit, literal quote-request tokens in the DOM (`Request a Quote`, `Get Pricing`, `Submit RFQ`, `Request Proposal`).
   - Zero NLP or semantic intent guessing in the detector.
   - Ambiguous CTAs ("Contact Us", "Get in Touch") NEVER emit `QUOTE_CTA`.
2. **Level-2 Deterministic Derivation:**
   - Level-2 can deterministically derive `QUOTE_CTA` and `HAS_ACQUISITION_PATH` using `CtaContext` (`cta_label` + `surrounding_text` + `destination_url` + `element_type`).
3. **GF-004 vs GF-005 Separation:**
   - **GF-004 (Support WhatsApp):** `WHATSAPP = PRESENT`, `QUOTE_CTA = ABSENT` (no quote tokens).
   - **GF-005 (Acquisition WhatsApp):** `WHATSAPP = PRESENT`, `QUOTE_CTA = PRESENT` (explicit "Get a Quote" token present).
   - Neither fixture relies on a Level-1 `classified_intent` tag; separation is fully deterministic based on observable tokens.

---

## 3. Hard-Negative Controls (B7 evidence)

New suite `tests/fixtures/hard_negatives/` + `tests/unit/hard_negative_fixtures.test.ts` encodes the four §1.2 forensic failure modes:

| ID | Archetype | Assertions |
| :--- | :--- | :--- |
| HF-001 | Regulatory disclosure (Lendo hn-006) | intent `REGULATORY_DISCLOSURE`, `ACQUISITION_CTA ≠ PRESENT` |
| HF-002 | Emergency dispatch (Morni hn-007) | intent ≠ `ACQUISITION`, `APP_BASED_SERVICE PRESENT`, acquisition not PRESENT |
| HF-003 | Support-only WhatsApp (PureGym hn-014) | intent `SUPPORT`, `SUPPORT_CTA PRESENT`, `ACQUISITION_CTA ABSENT` |
| HF-004 | Self-service subscription (FitnessFirst hn-015 / Hive hn-016) | `ONLINE_MEMBERSHIP PRESENT`, `DIRECT_CHECKOUT ABSENT`, acquisition ABSENT |
| HF-005 | Bare WhatsApp icon | intent `UNKNOWN`, acquisition/support `UNKNOWN` |

---

## 4. Test Evidence

Run: `npx vitest run tests/unit/evidence_golden_fixtures.test.ts tests/unit/atomic_evidence_detectors.test.ts tests/unit/hard_negative_fixtures.test.ts`

```
 Test Files  3 passed (3)
      Tests  74 passed (74)
```

`tsc --noEmit`: touched files type-clean. (`src/domain/whatsapp/whatsapp-llm-extractor.ts` has 2 pre-existing out-of-scope errors, unchanged.)

### Fixture-by-fixture (production atoms vs frozen contract): all 9 PASS
- **GF-001** Direct E-Commerce → `DIRECT_CHECKOUT PRESENT`; quote/consultation/app/WA absent.
- **GF-002** Quote-driven → `QUOTE_CTA PRESENT`, `ACQUISITION_CTA PRESENT`; checkout absent.
- **GF-003** Consultation → `CONSULTATION_CTA PRESENT`, `ACQUISITION_CTA PRESENT`.
- **GF-004** Support WhatsApp → `SUPPORT_CTA PRESENT`, intent `SUPPORT`, acquisition ABSENT.
- **GF-005** Acquisition WhatsApp → intent `ACQUISITION`, `ACQUISITION_CTA PRESENT`.
- **GF-006** Gym membership → `ONLINE_MEMBERSHIP PRESENT`, `SELF_SERVICE_PORTAL PRESENT`, checkout ABSENT.
- **GF-007** Multi-stage journey → quote/consultation/acquisition PRESENT, `stages_declared PRESENT` count 4.
- **GF-008** Ambiguous WhatsApp → intent `UNKNOWN`, acquisition/support `UNKNOWN`.
- **GF-009** Coverage guard → journey atoms `UNKNOWN`, `WHATSAPP ABSENT`.

---

## 5. Blocker Resolution Table (GATE-003 §9)

| Blocker | Status | Where |
| :--- | :--- | :--- |
| B1 — Production Level-1 detectors wired through engine | ✅ | `TransactionDetector`, `CtaContextDetector`, `SelfServiceDetector`, `DetectionEngine.runAtomicEvidence` |
| B2 — CTA_CONTEXT for PHONE/EMAIL/WHATSAPP/FORM + REGULATORY_DISCLOSURE | ✅ | `CtaContextDetector.extractContactContext` |
| B3 — Evidence-sufficiency guard in production path | ✅ | `AtomicEvidenceEvaluator` + `EvidenceEngine.extractAtomicEvidence` (coverage→sufficiency) |
| B4 — BookingDetector corruption + VERIFIED-absence hygiene | ✅ | BookingDetector metadata.corroboration; 4 script-scan detectors `ambiguous: !detected` |
| B5 — Level-2 formula + APPOINTMENT_CTA | ✅ | evaluator formula fixed; atom emitted + asserted |
| B6 — De-overfit oracle detectors | ⏸ Deliberate | production supersedes the oracle; oracle left untouched to avoid Gate-2 regression |
| B7 — Legacy channel decision | ✅ Decisioned | legacy `extractEvidence` unchanged; atoms produced additively via `extractAtomicEvidence`; migration/deprecation deferred to Gate 4 |

**Non-blockers from audit:** `Analytics`/`Pixel`/`Social` output is not consumed by the atom layer — verified they cannot contaminate Level-1 atoms (out-of-taxonomy channels are now `UNKNOWN` on absence). Fixture ID shuffle vs ADR-006 §7 remains purely cosmetic (documented in GATE-003).

---

## 6. Verification Notes

- The production atom path was verified against the **same frozen `GOLDEN_FIXTURES_CONTRACT`** the oracle uses, so acceptance is against the immutable contract, not new expectations.
- `OPPORTUNITY_RULES` frozen-line assertion duplicated in the production test (`atomic_evidence_detectors.test.ts`, "Architectural Integrity").
- No mutation of `detection/types.ts` (ADR-004 freeze): atom types live in the new `atomic-evidence-types.ts`.

---

## 7. Open Items Before Gate 4 (backtest)

1. **Gate 4 (Evidence Backtest):** re-run evidence collection against the 31 Reference + 15 Hard Negative targets and verify zero classification contamination, now that production emits atoms.
2. **B6 decision review:** confirm whether the Gate-2 oracle should be retired/de-overfit now that production detectors exist, or kept frozen as the historical benchmark.
3. **APPOINTMENT_CTA in the immutable contract** (add atom + fixture) if the contract is ever amended.
4. **`EvidenceType` enum amendment** for atom persistence (requires an ADR per the freeze) — currently atoms are derived at call-time via `extractAtomicEvidence`.

---

## 8. Reference Index

- `supabase/functions/_shared/detection/detectors/TransactionDetector.ts` — DIRECT_CHECKOUT / ONLINE_MEMBERSHIP / APP_BASED_SERVICE
- `supabase/functions/_shared/detection/detectors/CtaContextDetector.ts` — CTA atoms + CtaContext + intent classification
- `supabase/functions/_shared/detection/detectors/SelfServiceDetector.ts` — portal + journey stages
- `supabase/functions/_shared/detection/AtomicEvidenceEvaluator.ts:43-58` — §6.1 guard; `:114-135` — sufficiency path
- `supabase/functions/_shared/detection/atomic-evidence-types.ts` — additive schema + provenance
- `supabase/functions/_shared/detection/DetectionEngine.ts:55-67` — `runAtomicEvidence`
- `supabase/functions/_shared/intelligence/evidence/engine.ts:128-160` — `extractAtomicEvidence` (coverage→sufficiency)
- `supabase/functions/_shared/detection/detectors/BookingDetector.ts` — corroboration metadata fix
- `supabase/functions/_shared/detection/detectors/{Chatbot,Social,Analytics,Pixel}Detector.ts` — `ambiguous: !detected`
- `src/domain/evidence/golden-evidence-evaluator.ts:148-153` — Level-2 formula fix
- `tests/unit/atomic_evidence_detectors.test.ts`, `tests/unit/hard_negative_fixtures.test.ts` — Gate-3.1 acceptance
- `tests/fixtures/hard_negatives/HF-001..HF-005*.html` — hard-negative controls

---

## 9. Verdict

### **PASS (candidate) — HOLD before Gate 4**

ADR-006 Gate 3 deliverable ("candidate Level 1 Detectors … tested strictly against Golden Fixtures") is met with production code and 74/74 green tests. Per the Gate discipline, do not begin Gate 4 (backtest) or Gate 5 (policy) until this report is confirmed.

***

*End of report. No commits made. `OPPORTUNITY_RULES` frozen at `[]`.*