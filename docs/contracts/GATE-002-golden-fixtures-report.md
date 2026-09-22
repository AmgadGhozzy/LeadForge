# Gate 2: Golden Fixtures Benchmark Report & Evidence Contract Mapping

**Milestone:** Phase 5 — Gate 2 (Golden Fixtures Contract Specification & Test Suite)  
**Parent ADR:** [`ADR-006: Opportunity Evidence Design`](file:///D:/MyProjects/LeadForge/docs/contracts/ADR-006-opportunity-evidence-design.md)  
**Status:** **PASSED (9/9 Fixtures, 21/21 Tests Passed) ✅**  
**Date:** 2026-09-22  

---

## 1. Executive Summary

In accordance with GPT's Gate 2 specification and `ADR-006`, we constructed and verified the **Golden Fixtures Benchmark Suite** (`GF-001` through `GF-009`). 

### Core Architectural Invariants:
- **Independent Evidence Validation:** Fixtures test the **Evidence layer exclusively** (`HTML ──> Atomic Evidence ──> Derived Signals`). No Opportunity Fit evaluation occurred.
- **Contract Before Code:** Expected values were strictly frozen in [`contract_expectations.ts`](file:///D:/MyProjects/LeadForge/tests/fixtures/evidence_golden/contract_expectations.ts) **prior** to evaluator execution.
- **Strictly Local & Deterministic:** 9 static HTML fixture files tested in isolation with zero network, CDN, or geo dependencies.
- **Zero Production Mutations:** `OPPORTUNITY_RULES = []` remains 100% frozen. Zero database tables modified ($\Delta = 0$).

---

## 2. Benchmark Suite Matrix & Contract Mapping (9/9)

| Fixture ID | Archetype Scenario | Primary Contract Verified | Phase 1: Atomic Evidence Assertions | Phase 2: Derived Signal Assertions | Test Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **GF-001** | **Direct E-Commerce Store** | Direct checkout capability without human consultation | `DIRECT_CHECKOUT = PRESENT`<br>`QUOTE_CTA = ABSENT`<br>`CONSULTATION_CTA = ABSENT` | `HAS_SELF_SERVICE_PATH = PRESENT`<br>`REQUIRES_HUMAN_INTERACTION = ABSENT`<br>`HAS_ACQUISITION_PATH = ABSENT` | **PASS ✅** |
| **GF-002** | **Quote-Driven Industrial Service** | Custom scoping required before commercial pricing | `QUOTE_CTA = PRESENT`<br>`ACQUISITION_CTA = PRESENT`<br>`DIRECT_CHECKOUT = ABSENT` | `HAS_ACQUISITION_PATH = PRESENT`<br>`REQUIRES_HUMAN_INTERACTION = PRESENT`<br>`HAS_SELF_SERVICE_PATH = ABSENT` | **PASS ✅** |
| **GF-003** | **Executive Advisory Practice** | Consultation meeting required for transaction intake | `CONSULTATION_CTA = PRESENT`<br>`ACQUISITION_CTA = PRESENT`<br>`DIRECT_CHECKOUT = ABSENT` | `HAS_ACQUISITION_PATH = PRESENT`<br>`REQUIRES_HUMAN_INTERACTION = PRESENT`<br>`HAS_SELF_SERVICE_PATH = ABSENT` | **PASS ✅** |
| **GF-004** | **Support-Only WhatsApp Channel** | Comparative Pair 1: WhatsApp in support context $\neq$ Acquisition | `WHATSAPP = PRESENT`<br>`SUPPORT_CTA = PRESENT`<br>`ACQUISITION_CTA = ABSENT`<br>`CTA_CONTEXT = SUPPORT` | `HAS_ACQUISITION_PATH = ABSENT`<br>`REQUIRES_HUMAN_INTERACTION = ABSENT` | **PASS ✅** |
| **GF-005** | **Acquisition WhatsApp Channel** | Comparative Pair 2: WhatsApp with sales text $=$ Acquisition | `WHATSAPP = PRESENT`<br>`ACQUISITION_CTA = PRESENT`<br>`QUOTE_CTA = PRESENT`<br>`CTA_CONTEXT = ACQUISITION` | `HAS_ACQUISITION_PATH = PRESENT`<br>`REQUIRES_HUMAN_INTERACTION = PRESENT` | **PASS ✅** |
| **GF-006** | **Self-Service Gym & Member Portal** | Digital recurring checkout & member portal suppressors | `ONLINE_MEMBERSHIP = PRESENT`<br>`SELF_SERVICE_PORTAL = PRESENT`<br>`QUOTE_CTA = ABSENT` | `HAS_SELF_SERVICE_PATH = PRESENT`<br>`REQUIRES_HUMAN_INTERACTION = ABSENT` | **PASS ✅** |
| **GF-007** | **Multi-Stage Customer Journey** | Explicitly declared 4-stage client engagement methodology | `CUSTOMER_JOURNEY_STAGES.stages = PRESENT`<br>`expected_stage_count = 4` | `HAS_MULTI_STAGE_JOURNEY = PRESENT`<br>`REQUIRES_HUMAN_INTERACTION = PRESENT` | **PASS ✅** |
| **GF-008** | **Ambiguous Contact CTA** | Bare contact icons without textual context yield UNKNOWN | `WHATSAPP = PRESENT`<br>`CTA_CONTEXT = UNKNOWN`<br>`ACQUISITION_CTA = UNKNOWN`<br>`SUPPORT_CTA = UNKNOWN` | `HAS_ACQUISITION_PATH = UNKNOWN`<br>`REQUIRES_HUMAN_INTERACTION = UNKNOWN` | **PASS ✅** |
| **GF-009** | **Insufficient Observability** | Evidence Sufficiency: Unobserved journey surfaces yield UNKNOWN | `DIRECT_CHECKOUT = UNKNOWN`<br>`ONLINE_MEMBERSHIP = UNKNOWN`<br>`QUOTE_CTA = UNKNOWN` | `HAS_SELF_SERVICE_PATH = UNKNOWN`<br>`REQUIRES_HUMAN_INTERACTION = UNKNOWN` | **PASS ✅** |

---

## 3. Vitest Automated Contract Suite Results

```text
 RUN  v5.0.1 D:/MyProjects/LeadForge

 ✓ tests/unit/evidence_golden_fixtures.test.ts (21 tests) 10ms
   ✓ ADR-006 Gate 2: Golden Fixtures Benchmark Suite (9/9) (21)
     ✓ Fixture [GF-001]: Direct E-Commerce Checkout (2)
       ✓ [Phase 1 Atomic] Extracts expected Level 1 evidence atoms
       ✓ [Phase 2 Derived] Deterministically derives Level 2 commercial signals
     ✓ Fixture [GF-002]: Quote-Driven Service Business (2)
       ✓ [Phase 1 Atomic] Extracts expected Level 1 evidence atoms
       ✓ [Phase 2 Derived] Deterministically derives Level 2 commercial signals
     ✓ Fixture [GF-003]: Consultation / Advisory Service (2)
       ✓ [Phase 1 Atomic] Extracts expected Level 1 evidence atoms
       ✓ [Phase 2 Derived] Deterministically derives Level 2 commercial signals
     ✓ Fixture [GF-004]: Support-Only WhatsApp Channel (2)
       ✓ [Phase 1 Atomic] Extracts expected Level 1 evidence atoms
       ✓ [Phase 2 Derived] Deterministically derives Level 2 commercial signals
     ✓ Fixture [GF-005]: Acquisition WhatsApp Channel (2)
       ✓ [Phase 1 Atomic] Extracts expected Level 1 evidence atoms
       ✓ [Phase 2 Derived] Deterministically derives Level 2 commercial signals
     ✓ Fixture [GF-006]: Self-Service Gym & Member Portal (2)
       ✓ [Phase 1 Atomic] Extracts expected Level 1 evidence atoms
       ✓ [Phase 2 Derived] Deterministically derives Level 2 commercial signals
     ✓ Fixture [GF-007]: Multi-Stage Customer Journey (2)
       ✓ [Phase 1 Atomic] Extracts expected Level 1 evidence atoms
       ✓ [Phase 2 Derived] Deterministically derives Level 2 commercial signals
     ✓ Fixture [GF-008]: Ambiguous Contact CTA (2)
       ✓ [Phase 1 Atomic] Extracts expected Level 1 evidence atoms
       ✓ [Phase 2 Derived] Deterministically derives Level 2 commercial signals
     ✓ Fixture [GF-009]: Insufficient Observability (Coverage Guard) (2)
       ✓ [Phase 1 Atomic] Extracts expected Level 1 evidence atoms
       ✓ [Phase 2 Derived] Deterministically derives Level 2 commercial signals
     ✓ Comparative Pair: WhatsApp Context Disambiguation (1)
       ✓ GF-004 (Support) and GF-005 (Acquisition) prove that WhatsApp channel presence alone does not imply Acquisition
     ✓ Coverage Guard: Evidence Sufficiency for Absence (1)
       ✓ GF-009 returns UNKNOWN for unobserved routes, never defaulting to ABSENT
     ✓ Architectural Integrity: ZERO_RULES Baseline (1)
       ✓ OPPORTUNITY_RULES remains strictly empty (frozen) during Gate 2

 Test Files  1 passed (1)
      Tests  21 passed (21)
   Duration  212ms
```

---

## 4. Gate 2 Criteria Audit Checklist

| Requirement | Target | Achieved Evidence | Status |
| :--- | :---: | :--- | :---: |
| **Golden Fixtures Coverage** | 9/9 | 9 orthogonal static HTML fixtures created and tested | **PASS ✅** |
| **Atomic Evidence Accuracy** | 100% | 100% of Level 1 atoms match pre-declared contract expectations | **PASS ✅** |
| **No Fabricated Evidence** | 0 False Signals | Negative assertions verify no unobserved atoms are reported as PRESENT | **PASS ✅** |
| **Tri-State Semantics** | Strictly Enforced | PRESENT, ABSENT, UNKNOWN polarities rigorously separated | **PASS ✅** |
| **CTA Context Disambiguation** | Verified | GF-004 (Support) vs GF-005 (Acquisition) strictly disambiguated | **PASS ✅** |
| **Insufficient Coverage Guard** | Verified | GF-009 safely yields UNKNOWN when journey surface is unobserved | **PASS ✅** |
| **Derived Signal Derivation** | Two-Phase | Level 2 signals derived deterministically from Level 1 atoms | **PASS ✅** |
| **Zero Opportunity Rules** | Frozen | `OPPORTUNITY_RULES = []` verified in test suite | **PASS ✅** |
| **Database Mutations** | 0 | $\Delta = 0$ across all production database tables | **PASS ✅** |

---

## 5. Next Phase Roadmap: Gate 3 (Evidence Detector Audit)

With Gate 2 successfully passed and certified:
1. **Gate 3:** Audit and upgrade existing production detectors (`BookingDetector`, `ContactDetector`, `WhatsAppDetector`, etc.) to produce Level 1 `CTA_CONTEXT` and atomic evidence structures matching the Golden Fixtures contract.
2. **Gate 4:** Evidence Backtest across the 31 Reference + 15 Hard Negative targets.
3. **Engine Status:** `OPPORTUNITY_RULES = []` remains 100% frozen until Gates 3 and 4 pass.
