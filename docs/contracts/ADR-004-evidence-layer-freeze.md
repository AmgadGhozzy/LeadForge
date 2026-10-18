# ADR-004: Evidence Layer Contract — Phase 4 Freeze

**Status:** FROZEN 🔒  
**Date:** 2026-09-19  
**Scope:** `_shared/detection/types.ts`, `_shared/detection/detectors/*`, `_shared/intelligence/evidence/engine.ts`

---

## Context

Prior to Phase 4, the `EvidenceEngine` used `confidence.score > 0` (when `detected = false`) as a proxy for ambiguity. This caused a cross-detector semantic violation:

- **"Decision Confidence" Detectors** (Chatbot, TechStack, Social, Analytics, Pixel, Contact) returned high scores (80–90) to express confidence in absence. The engine misread these as ambiguity and **blocked them from ever producing `ABSENT`**.
- **"Presence Likelihood" Detectors** (WhatsApp, Booking) had to work around this via metadata hacks (`incidental_keyword_found`) or score manipulation (`score = 40`).

The root cause: `confidence.score` carried two contradictory meanings simultaneously.

---

## Decision

`DetectionResult` now separates three orthogonal dimensions:

```text
detected      → Did the Detector find sufficient evidence to assert PRESENT?
ambiguous     → Did the Detector observe subject-relevant evidence, but insufficient for PRESENT?
confidence    → How confident is the Detector in its own decision?
```

The `EvidenceEngine` adds a fourth dimension from outside the Detector:

```text
observability → Did the scan see enough of the website to safely assert ABSENT?
```

**`confidence.score` no longer has any role in determining `EvidencePolarity`.**

---

## The Frozen Contract

### `DetectionResult` Interface (`types.ts`)

```typescript
export interface DetectionResult {
  detected: boolean;
  ambiguous: boolean;       // REQUIRED. Must be explicitly false when no ambiguity exists.
  confidence: ConfidenceRating;
  evidence_level: EvidenceLevel;
  positive_signals: EvidenceSignal[];
  negative_signals: EvidenceSignal[];
  method: DetectionMethod;
  metadata: Record<string, unknown>;
}
```

**`ambiguous` is required (non-optional).** Any Detector not returning it will fail compilation — this is intentional. A partial migration that silently defaults to `undefined` is exactly the failure mode we are preventing.

### `ambiguous: true` Semantics

`ambiguous = true` means exactly:

> The Detector observed **subject-relevant evidence**, but that evidence is **insufficient** to establish PRESENT.

It does NOT mean "the Detector is generally unsure". General uncertainty is expressed via `confidence`.

### Detector Responsibilities

| Detector | `ambiguous = true` condition |
| :--- | :--- |
| WhatsApp | Incidental keyword `'whatsapp'` found in HTML, but no actionable `href` |
| Booking | Uncorroborated internal booking URLs or CTAs (weak signals without provider) |
| Chatbot | Never (strict script pattern matching, no partial states) |
| TechStack | Never (strict pattern matching) |
| Social | Never (strict href matching) |
| Analytics | Never (strict script pattern matching) |
| Pixel | Never (strict script pattern matching) |
| Contact | Never (structured sources only: JSON-LD, mailto, tel hrefs) |

---

## The Frozen Truth Table

This is the `EvidenceEngine` polarity decision — the canonical mapping enforced in `engine.ts`.

| `detected` | `ambiguous` | observability | `EvidencePolarity` |
| ---------: | ----------: | :------------ | :----------------- |
| `true`     | `false`     | any           | **PRESENT**        |
| `true`     | `true`      | any           | **PRESENT**        |
| `false`    | `true`      | good          | **UNKNOWN**        |
| `false`    | `true`      | bad           | **UNKNOWN**        |
| `false`    | `false`     | good          | **ABSENT**         |
| `false`    | `false`     | bad           | **UNKNOWN**        |

**Key invariants:**
1. `detected = true` always wins. No other dimension can override it.
2. `confidence.score` cannot shift polarity regardless of value.
3. `ambiguous = true` always produces `UNKNOWN` regardless of observability.
4. `ABSENT` is only reachable via `detected = false AND ambiguous = false AND good observability`.

---

## Gate Results (Phase 4 Validation — 2026-09-19)

### Truth Table Invariant Gate (7/7)

```
✅ [detected=true,  ambiguous=false, coverage=good, score=100] → PRESENT
✅ [detected=true,  ambiguous=true,  coverage=bad,  score=0  ] → PRESENT
✅ [detected=false, ambiguous=true,  coverage=good, score=0  ] → UNKNOWN
✅ [detected=false, ambiguous=true,  coverage=bad,  score=90 ] → UNKNOWN
✅ [detected=false, ambiguous=false, coverage=good, score=100] → ABSENT
✅ [detected=false, ambiguous=false, coverage=good, score=0  ] → ABSENT  ← confidence is orthogonal
✅ [detected=false, ambiguous=false, coverage=bad,  score=100] → UNKNOWN
```

### Cross-Detector ABSENT Gate (6/6)

All six previously broken detectors now produce `ABSENT` under sufficient coverage:

```
✅ WHATSAPP  → ABSENT
✅ BOOKING   → ABSENT
✅ CHATBOT   → ABSENT  ← was stuck at UNKNOWN before Phase 4
✅ TECHNOLOGY → ABSENT  ← was stuck at UNKNOWN before Phase 4
✅ SOCIAL    → ABSENT  ← was stuck at UNKNOWN before Phase 4
✅ PHONE     → ABSENT  ← was stuck at UNKNOWN before Phase 4
```

### WhatsApp Baseline Regression Gate (87/87)

```
PRESENT: 26  |  ABSENT: 45  |  UNKNOWN: 16
Violations: 0
```

No regressions. Oracle, projection, and PRESENT traceability unchanged.

---

## Architectural Boundary (Enforced Going Forward)

```text
Detector
  │
  │ returns DetectionResult { detected, ambiguous, confidence, ... }
  │
  ▼
EvidenceEngine
  │
  │ reads detected + ambiguous
  │ consults observability (ScanCoverage)
  │ NEVER reads confidence.score for polarity
  │
  ▼
EvidencePolarity { PRESENT | ABSENT | UNKNOWN }
```

### Rules for New Detectors

1. Return `ambiguous: boolean` always — never `ambiguous?`.
2. Set `ambiguous: false` explicitly when there are no partial/weak signals.
3. Set `ambiguous: true` only when **subject-relevant but insufficient** evidence exists.
4. Do NOT encode business logic into `confidence.score` expecting the Engine to interpret it.
5. The Engine will never contain `if (type === 'MY_DETECTOR') ...` branches.

---

## What Is NOT Changing

- `determineAbsencePolarity()` — observability policy unchanged.
- `ConfidenceCalculator` — scoring model unchanged.
- `Evidence` schema — no schema migration required.
- WhatsApp Oracle / projection / snapshot contract — frozen baseline.
- `EvidenceSignal` structure — unchanged.

Any future change to these requires a new ADR and a regression gate run.
