# GATE-003 — Detector Audit Report (read-only)

**Status of audit:** READ-ONLY. No source modified. `OPPORTUNITY_RULES` untouched (reverted to `.git` state; frozen `[]`).
**Date:** 2026-09-22
**Contracts referenced:** `ADR-006` (evidence design), `ADR-004` (evidence-layer freeze), `HARD_NEGATIVE_CONTROL_SPEC v1`

---

## 0. Executive Summary

The audit covered **8 production detectors** (`supabase/functions/_shared/detection/detectors/`), the **Detection Engine** and its **core types**, the **Golden Evidence Evaluator** (`src/domain/evidence/golden-evidence-evaluator.ts`), the **Golden Fixture contract**, and the **production Evidence Engine** (`_shared/intelligence/evidence/engine.ts`).

**Headline finding — there are two entirely separate evidence codebases that never touch:**

| Path | Role | Produces ADR-006 atoms? |
| :--- | :--- | :--- |
| `_shared/detection/detectors/*` (8 files) | Production pipeline (profile-builder, enrichment-service, pilot) | **NO — none of them emit any ADR-006 atom** |
| `src/domain/evidence/golden-evidence-evaluator.ts` | Gate-2 test oracle only | Yes — but via fixture-overfit private regex, not wired to production |

The production pipeline still emits **legacy channel evidence** (`BOOKING`, `WHATSAPP`, `CHATBOT`, `SOCIAL`, `TECHNOLOGY`, `PHONE`). None of the 10 ADR-006 Level-1 atoms (`DIRECT_CHECKOUT`, `QUOTE_CTA`, `CONSULTATION_CTA`, `APPOINTMENT_CTA`, `APPLICATION_CTA`, `ACQUISITION_CTA`, `SUPPORT_CTA`, `SELF_SERVICE_PORTAL`, `ONLINE_MEMBERSHIP`, `APP_BASED_SERVICE`) are produced by any production detector. ADR-006 Gate 3 requires "code candidate Level 1 Detectors (TransactionDetector, CtaContextDetector, SelfServiceDetector) tested strictly against Golden Fixtures" — **this implementation does not exist in production.**

**Verdict: FAIL** (see §4e for the blocker list, including which blockers are cheap to lift).

---

## 1. Scope & Files Audited

### 1.1 Detector files (audit target)
- `supabase/functions/_shared/detection/detectors/AnalyticsDetector.ts`
- `supabase/functions/_shared/detection/detectors/BookingDetector.ts`
- `supabase/functions/_shared/detection/detectors/ChatbotDetector.ts`
- `supabase/functions/_shared/detection/detectors/ContactDetector.ts`
- `supabase/functions/_shared/detection/detectors/PixelDetector.ts`
- `supabase/functions/_shared/detection/detectors/SocialDetector.ts`
- `supabase/functions/_shared/detection/detectors/TechStackDetector.ts`
- `supabase/functions/_shared/detection/detectors/WhatsAppDetector.ts`

### 1.2 Orchestration & types
- `supabase/functions/_shared/detection/DetectionEngine.ts`
- `supabase/functions/_shared/detection/types.ts` (frozen per ADR-004)

### 1.3 ADR-006 evidence layer
- `supabase/functions/_shared/intelligence/evidence/engine.ts` (production mapper)
- `supabase/functions/_shared/intelligence/evidence/types.ts`
- `supabase/functions/_shared/intelligence/evidence/confidence.ts`

### 1.4 Golden Fixtures layer
- `src/domain/evidence/golden-evidence-evaluator.ts`
- `tests/fixtures/evidence_golden/contract_expectations.ts`
- `tests/unit/evidence_golden_fixtures.test.ts`
- 9 fixture HTML files under `tests/fixtures/evidence_golden/`

### 1.5 Audit scope confirmation
- `OPPORTUNITY_RULES` remains `[]` (verified by `tests/unit/evidence_golden_fixtures.test.ts:132-137` and `_shared/intelligence/opportunity/engine.ts`).

---

## 2. Method

Each detector was read in full and evaluated against:
1. ADR-006 §3.1 atom taxonomy (which atoms it *should* produce),
2. ADR-006 §3.2 CTA_CONTEXT / strict intent-classification rules,
3. ADR-006 §5 Golden Rule (observable vs. inferred),
4. ADR-006 §6.1 tri-state sufficiency semantics (`Relevant Journey Unobserved ⟹ UNKNOWN`),
5. The actual polarity path: detectors do **not** emit `PRESENT/ABSENT/UNKNOWN` themselves — they emit `detected` + `ambiguous` + `negative_signals`, and the **production Evidence Engine** (`mapDetectionToEvidence`, `confidence.determineAbsencePolarity`) converts to polarity via a Truth Table (ADR-004 contract). Both layers were assessed.

---

## 3. Detector Inventory Table

| # | Detector File | Evidence Keys Produced | PRESENT? | ABSENT? | UNKNOWN? | Inference Risk | ADR-006 Compliant? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `BookingDetector.ts` | `booking_provider`, `booking_structure`, `internal_booking_url`, `booking_cta_strong/medium/weak` | Yes (corroborated) | Partial (only via engine coverage gate) | Partial (`ambiguous` on uncorroborated) | **High** | **NO** |
| 2 | `ChatbotDetector.ts` | `intercom`, `tawk_to`, `drift`, `tidio`, `crisp`, `hubspot_chat`, `zendesk`, `livechat`, `freshchat` | Yes | **Unsafe** (`VERIFIED` absence, no coverage input) | **Never emitted** | Medium | **NO** |
| 3 | `WhatsAppDetector.ts` | `wa_me_link`, `whatsapp_api_link` (href-validated) | Yes | Yes (checked-and-not-found) | Yes (incidental keyword → `ambiguous=true` → engine `UNKNOWN`) | **Low** | **PARTIAL** (channel-only; no intent context) |
| 4 | `SocialDetector.ts` | `facebook`, `instagram`, `linkedin`, `tiktok`, `youtube`, `twitter_x`, `snapchat` | Yes | **Unsafe** (`VERIFIED` absence, no coverage input) | **Never emitted** | Low | **NO** (out of taxonomy) |
| 5 | `AnalyticsDetector.ts` | `google_analytics_ua/ga4`, `google_tag_manager`, `hotjar`, `microsoft_clarity`, `mixpanel`, `segment` | Yes | **Unsafe** (`VERIFIED` absence, no coverage input) | **Never emitted** | Low | **NO** (out of taxonomy) |
| 6 | `PixelDetector.ts` | `meta_pixel`, `tiktok_pixel`, `snapchat_pixel`, `pinterest_tag`, `linkedin_insight`, `google_ads_conversion` | Yes | **Unsafe** (`VERIFIED` absence, no coverage input) | **Never emitted** | Medium | **NO** (out of taxonomy) |
| 7 | `TechStackDetector.ts` | `wordpress`, `wix`, `squarespace`, `webflow`, `joomla`, `drupal`, `shopify`, `woocommerce`, `magento`, `nextjs`, `nuxtjs`, `react`, `vue`, `angular` | Yes | Unsafe (`confidence 85` absence) | **Never emitted** | Medium | **NO** (out of taxonomy) |
| 8 | `ContactDetector.ts` | `email_json_ld`, `email_mailto_href`, `phone_tel_href`, `phone_json_ld`, `whatsapp_wa_me`, `email_body_text` | Yes | Partial (engine coverage gate) | Partial (only via engine coverage gate) | **High** | **NO** |

---

## 4. Per-Detector Deep Dive

### 4.1 `BookingDetector.ts`

**Evidence produced:** `booking_provider` (confidence 100), `booking_structure` (90), `internal_booking_url` (70), `booking_cta_strong` (80), `booking_cta_medium` (70), `booking_cta_weak` (40). No ADR-006 atom.

**Semantic analysis:**
- The detector treats **any booking/consultation/appointment CTA as evidence of a "booking mechanism"**. ADR-006 §3.1 separates intent atoms: a "Book Consultation" button is `CONSULTATION_CTA` (Interaction Requirement), NOT proof of a booking capability. The detector conflates mechanism with interaction intent.
- The corroboration design is the strongest part of this file: a lone weak CTA cannot trigger `detected`. `ambiguous=true` is honestly reported for uncorroborated signals (line 157).

**Issues found:**
1. **Semantic contract violation in `negative_signals` (lines 150-152):** when the corroboration verdict is "not detected", all positive signals are *copied into `negative_signals`* as `value: 'Uncorroborated: …'`. ADR-004 / `types.ts:77` defines `negative_signals` as *"what was checked and NOT found"*. An incidentally-observed signal is not a checked-and-absent signal. Downstream reasons/counts (e.g. `signalsChecked` in `evidence/engine.ts:237`) will silently report these as verified checks.
2. **`hasBookingStructure` (line 67):** `<input type="date">` / `<input type="time">` — a birthdate or appointment-time field in an unrelated form is scored `confidence: 90` as `booking_structure`. No surrounding-form purpose verification.
3. **No UNKNOWN path of its own for coverage:** `detect(html, links?)` has no observability/coverage input. The production engine's `determineAbsencePolarity` supplies it, but only at the *category* level (`BOOKING`, requiring Home+Contact+Booking pages, `evidence/engine.ts:141-144`).
4. **`WEAK_CTA` (lines 37-38):** bare keyword `appointment` / Arabic `حجز` with no context — mitigated only by the corroboration gate, never by context verification.
5. **`MEDIUM_CTA_EN` includes "book a consultation"** (`booking_cta_medium`) — this overlaps the ADR-006 `CONSULTATION_CTA` atom and is upgraded to "strong" (line 101-103), pushing the detector toward calling a consultation CTA a *booking system*.

**Verdict: FAIL** — mechanism/intent conflation, negative-signal semantic corruption, no self-owned coverage guard. Note the corroboration gate is good and should survive any rewrite.

---

### 4.2 `ChatbotDetector.ts`

**Evidence produced:** `intercom`, `tawk_to`, `drift`, `tidio`, `crisp`, `hubspot_chat`, `zendesk`, `livechat`, `freshchat` (script-hostname/API-keyword matches). No ADR-006 atom.

**Semantic analysis:** Pure channel-presence via known vendor scripts. `CHATBOT` is not in the ADR-006 taxonomy; the atom layer has no chatbot atom, and §1.3 explicitly warns `CHATBOT=ABSENT` is *ambiguous evidence of nothing*.

**Issues found:**
1. **Claims `evidence_level: 'VERIFIED'` for absence (line 114)** with `score = 90`, from a single HTML string, with *no coverage/observability input* and `ambiguous` **hardcoded `false`** (line 112). This directly contradicts ADR-006 §6.1: unobserved pages ⇒ `UNKNOWN`. (Mitigated downstream only by the engine's coverage gate — but the detector itself asserts certainty it does not have.)
2. **`ambiguous: false` always** (line 112) — no UNKNOWN path at the detector, so any engine-level UNKNOWN depends entirely on `determineAbsencePolarity`.
3. `negative_signals` carry no confidence (`value: null`, no `confidence`), yet the *reason* string asserts "None detected" with 90 confidence.

**Verdict: FAIL (minor).** Out-of-taxonomy; would become PASS-for-its-purpose if absence claims were gated on coverage and `ambiguous` reflected it. Largely a reporting-hygiene issue rather than a commercial-inference one.

---

### 4.3 `WhatsAppDetector.ts` (v2.1)

**Evidence produced:** `wa_me_link` (hostname `wa.me`), `whatsapp_api_link` (`api.whatsapp.com`/`web.whatsapp.com` pathname `/send`). This is the **model detector** in the codebase.

**Semantic analysis:**
- Positive-evidence driven, **no deny-list** (lines 8-10). Hrefs are validated by `URL` hostname/pathname (`classifyHref`, lines 49-64), not substring matching. A `?redirect=wa.me/123` on another hostname is correctly rejected.
- `negative_signals` are only ever *"checked for this contact-link type and not found"* (lines 108-123) — semantically clean.
- `ambiguous = !detected && incidentalKeywordFound` (line 145): if the word "whatsapp" appears anywhere but no actionable link exists, the engine maps `detected=false, ambiguous=true → UNKNOWN`. This is exactly the ADR-006 §6.1 behavior ("insufficient data ⇒ UNKNOWN"), and matches fixture intent for context-ambiguous presence.
- Does **not** conflate channel with acquisition: it declares only channel presence, never intent (the correct instinct per ADR-006 "Channel Detection ⟹/ Operational Opportunity").

**Issues found:**
1. **No CTA_CONTEXT / intent classification.** ADR-006 §3.2 requires capturing `cta_label`, `surrounding_text`, `destination_url`, `classified_intent` (`ACQUISITION | SUPPORT | REGULATORY_DISCLOSURE | UNKNOWN`). `WhatsAppDetector` emits *only* the validated href. In production, the `WHATSAPP` atom therefore feeds **no** intent signal, and `GF-004`/`GF-005`/`GF-008` (`classified_intent`) are unpachievable production behavior — the context extraction exists **only** inside the test-only evaluator's private `extractWhatsAppContext`.
2. `detect()` signature has no `links` array / page team input; relies solely on inline `href=` attributes (consistent with html-string contract, but means hrefs injected at runtime won't be seen — acknowledged via `pages` combination in engine).
3. `evidence_level: 'UNKNOWN'` for the not-detected path is a **level**, not a polarity; the engine reads `ambiguous` for polarity, so this is cosmetic.

**Verdict: CONDITIONAL PASS** — channel-presence tri-state is ADR-006-correct. Conditions: emit `CtaContext` (per §3.2) when a link IS found, defaulting unmatched labels to `UNKNOWN`, never `ACQUISITION`.

---

### 4.4 `SocialDetector.ts`

**Evidence produced:** `facebook`, `instagram`, `linkedin`, `tiktok`, `youtube`, `twitter_x`, `snapchat` (href substring match). No ADR-006 atom (`SOCIAL` is not in the taxonomy).

**Semantic analysis:** Irrelevant to the ADR-006 atom layer. `SCORE` weights "major platforms" (line 71) — a marketing heuristic, not evidence. The `twitter_x` special-case scans `hrefs` for `x.com/` which will match **any** `example.com/x/…` pattern, plus enormous false-positive surface (`facebook.com/` matches `notfacebook.com/`).

**Issues found:**
1. `ambiguous` hardcoded `false`; absence reported `VERIFIED` (score 88) with no coverage input (ADRR-006 §6.1 violation, same as Chatbot).
2. Substring patterns, no hostname validation → PERSENT false positives on substrings.
3. Output is never consumed by the ADR-006 layer anyway (`SOCIAL` evidence type is legacy-only).

**Verdict: FAIL for ADR-006 relevance** (out of taxonomy, unsafe absence). Harmless commercially, but should not be counted as evidence in the new architecture.

---

### 4.5 `AnalyticsDetector.ts`

**Evidence produced:** `google_analytics_ua`, `google_analytics_ga4`, `google_tag_manager`, `hotjar`, `microsoft_clarity`, `mixpanel`, `segment`. No ADR-006 atom.

**Issues found:** Same tri-state hygiene problems as ChatbotDetector: `ambiguous: false` always (line 93), absence `VERIFIED` (line 95) from unscoped HTML, `negative_signals` with `value: null` and no confidence (lines 74-81). `score = 90` negative is asserted with no coverage input. Inference Risk: Low (analytics presence has near-zero bearing on the ADR-006 commercial atoms).

**Verdict: FAIL (minor, out of taxonomy).**

---

### 4.6 `PixelDetector.ts`

**Evidence produced:** `meta_pixel`, `tiktok_pixel`, `snapchat_pixel`, `pinterest_tag`, `linkedin_insight`, `google_ads_conversion`. No ADR-006 atom.

**Issues found:**
1. Same missing-UNKNOWN / VERIFIED-absence problem (`ambiguous:false` line 93, absence `VERIFIED` line 92, hardcoded `confidence: 80-90` scheduling from a single string).
2. **`google_ads_conversion` pattern `'AW-'` (line 45) is a broad substring** — `AW-` matches arbitrary text (invoices, part numbers, "AW-qw" strings). Not validated against `gtag` context.
3. **`score = 92` for `meta_pixel`** with the comment *"Meta pixel is the highest-value finding for B2B sales"* (line 80) is a marketing-business inference embedded in a Level-1 atomic detector — violates ADR-006 §5 "zero business interpretation" at Level 1.
4. Pixel output **is not consumed** by the evidence engine at all (`extractEvidence` only reads booking/whatsapp/chatbot/social/techStack/contacts).

**Verdict: FAIL (out of taxonomy; small business-inference seepage in scoring).**

---

### 4.7 `TechStackDetector.ts`

**Evidence produced:** 14 CMS/framework/eCommerce markers (`wordpress`, `wix`, `shopify`, `woocommerce`, `magento`, `react`, …). No ADR-006 atom.

**Semantic analysis:** This is the closest production detector to ADR-006's *observable ground truth* — ADR-006 §3.1 lists "Shopify/WooCommerce checkout buttons" as ground truth for `DIRECT_CHECKOUT`. Yet the detector emits only `TECHNOLOGY` (legacy tech-stack evidence). **The `DIRECT_CHECKOUT` atom is never derived from these highly relevant signals.**

**Issues found:**
1. **Missed wiring:** `shopify`/`woocommerce`/`magento` positive signals are strong candidates for `DIRECT_CHECKOUT = PRESENT` — this leap is never made (correct behavior is: emit atom at Level 1, let Level 2 correlate).
2. Pattern list is substring-based and noisy: plain word `wordpress` (line 24), `react`/`__react` (line 92) can match in prose/other contexts; `magento` (line 73) matches the bare word; `'/cart/'` (line 67) is a very generic path.
3. `ambiguous: false` always; negative `confidence: 85` absence without coverage input.

**Verdict: FAIL for ADR-006 (missed `DIRECT_CHECKOUT` opportunity; noisy patterns).** Should be restricted to validated markers and, when `shopify`/`woocommerce`/`magento` evidence is positive, surfaced as candidate `DIRECT_CHECKOUT` evidence for the atom layer.

---

### 4.8 `ContactDetector.ts`

**Evidence produced:** `email_json_ld` (100), `phone_json_ld` (100), `email_mailto_href` (95), `phone_tel_href` (95), `whatsapp_wa_me` (100), `email_body_text` (70). Exposed `extractedContacts` for backward-compat.

**Semantic analysis:** This is the detector at the **heart of the HARD_NEGATIVE_CONTROL failures** ADR-006 was written to fix. It emits `PHONE` / `EMAIL` / `WHATSAPP` presence with **zero intent or context classification**:
- A legal-footer phone (ADR-006 §3.2 → `classified_intent: REGULATORY_DISCLOSURE`, e.g. Lendo `hn-006`) is emitted at confidence 95.
- A support WhatsApp (`hn-014`) and an emergency-dispatch channel (`hn-007`) are emitted identically to a sales intake channel.
- The ADR-006 golden rule (§5): *"If an Evidence signal requires knowing what happens inside the company, it is NOT Website Evidence"* — the detector records the *observable* part correctly (a phone exists) but the **value that reaches the brain is a bare number with no surrounding text**, which is exactly the `Channel Detection ⟹ Operational Opportunity` leap §1.1 condemns.

**Issues found:**
1. **No CTA context capture at all** — no `cta_label`, no `surrounding_text`, no `classified_intent`. ADR-006 §3.2 is entirely unimplemented for PHONE/EMAIL/FORM (the evaluator only handles WHATSAPP, and only in test code).
2. **`test-confident absence`:** `score = 80`, `evidence_level: 'STRONG'` for *not found* (lines 164-174), `ambiguous: false` hardcoded (line 172). Absence certainty is claimed per-element with `negative_signals` confidence of **100** (line 158) even though HTML coverage is unbounded. Downstream engine's coverage gate mitigates polarity, but only if the category coverage calculation is correct.
3. **Body-text email regex (line 133) as Level-1 atomic** — a bare email address in prose (e.g. in a Privacy Policy) surfaces at 70 with no context. The `NOISE_EMAILS` whitelist (lines 30-43) filters only obvious junk, not legal/academic contexts.
4. Backward-compat surface (`extractedContacts`) means any intent changes must be additive; the class carries state between `detect()` calls (reset at line 52 is correct, but field is public mutable state).

**Verdict: FAIL** — the highest-commercial-risk detector in the audit, and the one ADR-006 most directly targets. Needs to become a `CtaContextDetector` (channel + anchor text + surrounding text + intent).

---

## 5. Golden Evidence Evaluator & Fixture Layer (`src/domain/evidence/`)

**Not a production detector** — it is the Gate-2 oracle (`evidence_golden_fixtures.test.ts`) with *its own private regex detectors*. It is audited here because it is the **only** code producing ADR-006 atoms, so its weaknesses define the ceiling for the "atom detector" idea.

### 5.1 Strengths (genuinely ADR-006-aligned)
- Tri-state everywhere; `observability_sufficient=false ⇒ all journey atoms UNKNOWN` (lines 45-57). **This is the evidence-sufficiency guard, and it is done right at Level 1 and Level 2.**
- WhatsApp intent disambiguation (support vs acquisition vs UNKNOWN) matches §3.2 and passes GF-004/GF-005/GF-008.
- Level-2 `HAS_ACQUISITION_PATH` formula matches ADR-006 §3.3 exactly (lines 136-146).

### 5.2 Fixture-overfit internal detectors (Gate-3 risk)
| Private detector | Fixture-coupled pattern | Generality problem |
| :--- | :--- | :--- |
| `detectOnlineMembership` (line 275) | `join now & select membership`, `instant access memberships` | **Literal fixture copy**, not a general recurring-plan detector (ADR-006 ground truth: "Recurring plan checkout: Join Now, Select Membership Plan, Subscribe"). |
| `extractJourneyStages` (line 283) | `our 4-step`, `step 1 … step 2 … step 3 … step 4` | Requires the word "step" repeated; a real "1. Discovery 2. Proposal 3. Kickoff" list (ADR-006 §3.3 example) is missed. |
| `detectConsultationCta` (line 241) | `book a strategy consultation`, `schedule an executive consultation` | Exact fixture phrases. General §3.1 vocabulary ("Free Assessment", "Speak with an Advisor") absent. |
| `detectApplicationCta` (line 245) | `credit application`, `submit application`, `apply now` | `apply now` is multi-purpose (jobs, med visas, funding); contextless. |

### 5.3 Taxonomy deviations from ADR-006
1. **`APPOINTMENT_CTA` atom is missing** from `Level1AtomicExpectations` (ADR-006 §3.1 lists it) — no detector, no fixture, no assertion.
2. **`REGULATORY_DISCLOSURE` intent is never produced** — `ClassifiedIntent` type allows it (`contract_expectations.ts:11`), but `extractWhatsAppContext` only sets SUPPORT/ACQUISITION/UNKNOWN (lines 204-218). ADR-006 §3.2 hard-requires it.
3. **`HAS_SELF_SERVICE_PATH` formula deviation** (evaluator lines 149-157): includes `SELF_SERVICE_PORTAL` in the OR; ADR-006 §3.3 defines it as `DIRECT_CHECKOUT ∨ ONLINE_MEMBERSHIP ∨ APP_BASED_SERVICE` only. A support/dashboard *portal* is not an acquisition path. (The fixtures don't catch this because GF-006 pairs portal with membership.)
4. **GF-009 keeps `WHATSAPP` binary** (line 53) — `detectWhatsApp ? PRESENT : ABSENT` even when observability is insufficient, while everything else is forced UNKNOWN. Fixture `GF-009` encodes this exception `expected_atomic.WHATSAPP: 'ABSENT'`. Internally consistent, but a strict reading of §6.1 ("Relevant Journey Unobserved ⟹ UNKNOWN") would force `UNKNOWN`.
5. **`detectWhatsApp` (line 192)** uses substring `wa\.me|api\.whatsapp\.com|whatsapp:\/\/` — less rigorous than production `WhatsAppDetector.v2`'s hostname validation. An external URL `?redirect=wa.me/123` marks `WHATSAPP=PRESENT`.
6. **`detectDirectCheckout` excludes any page containing `membership`** (line 231) — but ADR-006 §3.4 explicitly lets a memberships site have both; `ONLINE_MEMBERSHIP` and `DIRECT_CHECKOUT` are not mutually exclusive by design.

### 5.4 Evidence Sufficiency (the one thing done right)
`deriveCommercialSignals` correctly propagates UNKNOWN (lines 126-133), and `REQUIRES_HUMAN_INTERACTION` handles `DIRECT_CHECKOUT=UNKNOWN` / `QUOTE=UNKNOWN` (lines 166-172). The production pipeline **does not** benefit from any of this — this is test-only code.

---

## 6. Production Wiring Audit (`_shared/intelligence/evidence/`)

- `EvidenceEngine.extractEvidence` (engine.ts:44-124) maps only 6 detection categories → legacy `EvidenceType`: `BOOKING`, `WHATSAPP`, `CHATBOT`, `SOCIAL`, `TECHNOLOGY`, `PHONE`. **No atom from the ADR-006 taxonomy exists in `EvidenceType`** (`evidence/types.ts:5-16`).
- `EMAIL` evidence type exists in the enum but is **never produced** (extractEvidence maps contacts→`PHONE` only, line 118-121) — WhatsApp/email/phone all collapsed into the `contacts` result.
- `Analytics` and `Pixel` detector outputs are **not consumed at all** by the evidence engine.
- The only genuine tri-state logic in production is `mapDetectionToEvidence` (engine.ts:171-241) + `determineAbsencePolarity` (confidence.ts:53-78): `detected → ABSENT? UNKNOWN` gate on `blockedPages/timedOutPages > 2`, SPA-without-JS, and `crawlCoverage/targetCoverage ≥ 0.5`. This is the ADR-004 model — serviceable, but it operates on **legacy channels**, so even a perfect absence (e.g. `BOOKING=PRESENT`) has nothing to do with ADR-006 atoms.
- Branching: production entry points (`profile-builder.ts:79`, `enrichment-service.ts:73`, `pilot-enrich-batch/index.ts:122`) all route through `DetectionEngine.run()` — none touch `GoldenEvidenceEvaluator`. **The ADR-006 atom layer is disconnected from every production path.**

---

## 7. Gap Analysis (ADR-006 atoms → coverage)

| ADR-006 Atom (§3.1) | Produced WHERE | Status | Gap |
| :--- | :--- | :--- | :--- |
| `DIRECT_CHECKOUT` | evaluator only (private regex) | Test-only | No production detector. Shopify/WOO signals already exist but die as `TECHNOLOGY`. |
| `QUOTE_CTA` | evaluator only | Test-only | None in production. |
| `CONSULTATION_CTA` | evaluator only | Test-only | Production `BookingDetector` treats it as a *booking mechanism*. |
| `APPOINTMENT_CTA` | **NOWHERE** | Missing entirely | Not in evaluator, not in fixtures, not in production. |
| `APPLICATION_CTA` | evaluator only (overfit) | Test-only | `apply now` ambiguity. |
| `ACQUISITION_CTA` | evaluator only (derived) | Test-only | Golden: guarded by quote/consultation/app/context. Production: absent. |
| `SUPPORT_CTA` | evaluator only | Test-only | Production contact/whatsapp detectors never classify support. |
| `SELF_SERVICE_PORTAL` | evaluator only | Test-only | None in production. |
| `ONLINE_MEMBERSHIP` | evaluator only (overfit) | Test-only | None in production. |
| `APP_BASED_SERVICE` | evaluator only | Test-only | ADR-006 ground truth is store links — no production detector. |
| `CTA_CONTEXT` (PHONE/EMAIL/FORM) | **NOWHERE** | Missing entirely | Evaluator handles WhatsApp label text only; production doesn't. |
| `CTA_CONTEXT.classified_intent = REGULATORY_DISCLOSURE` | **NOWHERE** | Missing entirely | Type exists; never emitted. |

**Golden Fixture reliance not covered by production:** every Level-1 assertion in `contract_expectations.ts` (QUOTE_CTA, DIRECT_CHECKOUT, CONSULTATION_CTA, ACQUISITION_CTA, SUPPORT_CTA, SELF_SERVICE_PORTAL, ONLINE_MEMBERSHIP, APP_BASED_SERVICE, CTA_CONTEXT intent) is produced only by the test-only evaluator. **If the production pipeline ran the 9 fixture HTML files through `DetectionEngine`, it would produce zero matching atoms.** This is the single most important gap.

### Fixture-contract drift
ADR-006 §7's fixture table labels `GF-001`=Quote-driven Custom Service, but `contract_expectations.ts` calls `GF-001`=Direct E-Commerce and `GF-002`=Quote-driven. IDs/scenarios are shuffled (GF-005 in ADR is Direct E-Commerce vs fixtures' Acquisition WhatsApp). Cosmetic, but contract readers can't cross-reference reliably.

---

## 8. Critical Findings (would gate-out)

### CF-1 — No production detector emits any ADR-006 Level-1 atom
**Where:** `_shared/detection/detectors/*` (8/8), `_shared/intelligence/evidence/types.ts:5-16`
**Problem:** The Gate-3 deliverable is "candidate Level 1 Detectors (TransactionDetector, CtaContextDetector, SelfServiceDetector)". None exist. The only atom-emitting code lives in a test-only oracle (`golden-evidence-evaluator.ts`) unreachable from `DetectionEngine.run()`.
**Violation:** ADR-006 Gate 3 (detector implementation) not performed for production; ADR-006 §1 architecture (HTML → Level 1 → Level 2) not implemented in the pipeline.
**Fix:** Implement production Level-1 detectors (name per ADR-006 Gate 3: `TransactionDetector`, `CtaContextDetector`, `SelfServiceDetector`), wire into `DetectionEngine`, and make `EvidenceEngine` emit the §3.1 atoms. No OPPORTUNITY_RULES changes.

### CF-2 — CTA_CONTEXT is unpimplemented in production (and REGULATORY_DISCLOSURE nowhere)
**Where:** `ContactDetector.ts:45-181`, `WhatsAppDetector.ts:81-155`; `golden-evidence-evaluator.ts:204-218`
**Problem:** Channel presence is recorded with zero surrounding context or intent. Legal-footer disclosures (Lendo `hn-006`), support channels (PureGym `hn-014`), and emergency dispatch (Morni `hn-007`) are all emitted identically. `REGULATORY_DISCLOSURE` is dead code across the codebase.
**Violation:** ADR-006 §3.2 strict intent-classification rules; §1.1/§1.2 is the exact failure ADR-006 was written to prevent.
**Fix:** Capture `cta_label` + `surrounding_text` + `destination_url` for every PHONE/EMAIL/WHATSAPP link; classify intent with explicit context thresholds; default to `UNKNOWN`, never `ACQUISITION`.

### CF-3 — Detectors claim VERIFIED/STRONG absence without observability input
**Where:** `ChatbotDetector.ts:110-119` (`score` 90, `VERIFIED`, `ambiguous:false`), `SocialDetector.ts:77-86` (88), `AnalyticsDetector.ts:91-100` (90, `VERIFIED`), `PixelDetector.ts:88-97` (90, `VERIFIED`), `TechStackDetector.ts:160-169` (85), `ContactDetector.ts:170-179` (80, `STRONG`)
**Problem:** Absence is asserted at 80-90 confidence / `VERIFIED` `STRONG` level from an unbounded HTML string, with `ambiguous` hardcoded `false`. Homepage-only crawl → `BOOKING=VERIFIED absent` at the detector level (engine's `determineAbsencePolarity` is the only thing saving the polarity — and it's channel-category-based, not route-presence-based).
**Violation:** ADR-006 §6.1 evidence sufficiency: homepage alone cannot assert absence of `/shop`/`/pricing`/`/book` capabilities.
**Fix:** Thread observability/route coverage into every detector's decision (or standardize a `coverage_gate` contract on `DetectionResult`); absence without sufficient observability ⇒ `ambiguous=true` ⇒ `UNKNOWN`.

### CF-4 — negative_signals semantics corrupted by BookingDetector
**Where:** `BookingDetector.ts:150-152`
**Problem:** "Uncorroborated" positives are copied into `negative_signals` ("checked and NOT found"), polluting counts/reasoning downstream (`evidence/engine.ts:237` `signalsChecked`).
**Violation:** ADR-004 `DetectionResult` contract (`types.ts:77`).
**Fix:** Return weak positives in a distinct field (or keep in `positive_signals` with the corroboration verdict in `metadata`/`reason`); never reuse `negative_signals` for observed-but-rejected signals.

### CF-5 — Level-2 formula deviation: HAS_SELF_SERVICE_PATH includes SELF_SERVICE_PORTAL
**Where:** `golden-evidence-evaluator.ts:149-157`
**Problem:** ADR-006 §3.3 defines `HAS_SELF_SERVICE_PATH = DIRECT_CHECKOUT ∨ ONLINE_MEMBERSHIP ∨ APP_BASED_SERVICE`. The evaluator ORs in `SELF_SERVICE_PORTAL`, making a customer-support dashboard count as a self-service acquisition path. This propagates to `HAS_SELF_SERVICE_PATH` in every fixture assessment.
**Violation:** ADR-006 §3.3 formula; §1.2 failure mode 4 (portal intake ≠ purchase path).
**Fix:** Remove `SELF_SERVICE_PORTAL` from the formula; keep portal as an independent atom.

### CF-6 — Atom taxonomy drift: `APPOINTMENT_CTA` missing, GF ID shuffle
**Where:** `contract_expectations.ts:13-33` vs ADR-006 §3.1/§7
**Problem:** `APPOINTMENT_CTA` atom never defined/tested; fixture IDs don't match ADR-006 §7's table (GF-001/002/005 labels differ).
**Violation:** ADR-006 §3.1 completeness; §7 fixture contract traceability.
**Fix:** Add the atom + a fixture; realign fixture IDs with ADR-006 table.

### CF-7 — Fixture-overfit Level-1 detectors in the evaluator
**Where:** `golden-evidence-evaluator.ts:240-246,274-291`
**Problem:** Membership/journey/consultation/application detection matches literal fixture copy (e.g. `join now & select membership`, `step 1…step 4`). The 9 fixtures pass, but the detectors are not general; they would miss real-world ground-truth phrasing in §3.1.
**Violation:** ADR-006 §3.1 ground-truth indicators (detectors should implement the vocabulary, not the fixture sentences).
**Fix:** Re-key each private detector to the §3.1 observable vocabulary with context-aware composition (phrase + surrounding anchor), then re-run fixtures.

---

## 9. Gate 3 Verdict

### **OVERALL: FAIL**

Gate 3's deliverable — production Level-1 detectors tested strictly against the Golden Fixtures — is not met. The Golden Fixtures **pass** (via the test-only evaluator), but no production detector produces a single ADR-006 atom, and the production `EvidenceEngine` maps only legacy channels. Gate 4 (backtest) and Gate 5 (policy) must not begin.

### Blocker list (must resolve before Gate 4)

1. **B1 — Ship production Level-1 detectors** (`TransactionDetector`, `CtaContextDetector`, `SelfServiceDetector`) that emit the §3.1 atoms, wire through `DetectionEngine.run()` and `EvidenceEngine`, and pass the 9 fixtures through **their own** output (not the evaluator's private regexes). Reuse the evaluator's structure and `WhatsAppDetector.v2` href-validation as the pattern.
2. **B2 — Implement `CTA_CONTEXT` for PHONE/EMAIL/WHATSAPP/FORM** in production, with `classified_intent` incl. `REGULATORY_DISCLOSURE`, defaulting to `UNKNOWN`. (Fixes CF-2.)
3. **B3 — Add the evidence-sufficiency guard to Level 1 production path**: detect() receives observability; `observed-but-absent` vs `not-observed`. Absence ⇒ `UNKNOWN` when relevant routes uncrawled. (Fixes CF-3.)
4. **B4 — Repair Reporting Semantics:** BookingDetector negative-signal corruption (CF-4); stop hardcoding `ambiguous:false` + `VERIFIED` absence scores in the four script-scan detectors (CF-3).
5. **B5 — Correct Level-2 `HAS_SELF_SERVICE_PATH`** to the ADR-006 formula, and add `APPOINTMENT_CTA` torn–atom + fixture (CF-5, CF-6).
6. **B6 — De-overfit evaluator's private detectors** to §3.1 vocabulary; re-run fixtures to confirm zero regression (CF-7).
7. **B7 — Confirm decision:** whether legacy channel evidence (`BOOKING`/`CHATBOT`/`SOCIAL`/`PHONE`/`TECHNOLOGY`) should be *migrated* into equivalent atoms (`APPOINTMENT_CTA`, `SUPPORT_CTA`, …) or *deprecated* from the atom taxonomy entirely. ADR-006 §3.1 has no `CHATBOT` atom; leaving these as un-mapped output is a silent data-integrity risk at Gate 4.

### Non-blocker observations (nice-to-have, not gate-blocking)
- `AnalyticsDetector` / `PixelDetector` / `SocialDetector` are outside the ADR-006 taxonomy — deprecate or quarantine rather than re-verify. Fractional-metadata scoring (`meta_pixel`="highest value for B2B") should be stripped from Level-1 logic regardless.
- GF fixture ID alignment with ADR-006 §7 (documentation hygiene).

---

## 10. Reference Index (file:line anchors)

Audit-critical locations:
- `supabase/functions/_shared/detection/detectors/BookingDetector.ts:150-152` (negative-signal corruption)
- `supabase/functions/_shared/detection/detectors/WhatsAppDetector.ts:49-64,145` (href validation; ambiguous=incidental keyword) — **reference pattern**
- `supabase/functions/_shared/detection/detectors/ContactDetector.ts:170-179,162-168` (STRONG absence; no context)
- `supabase/functions/_shared/detection/types.ts:63-80` (DetectionResult contract, ADR-004)
- `supabase/functions/_shared/intelligence/evidence/engine.ts:90-123` (legacy category mapping only)
- `supabase/functions/_shared/intelligence/evidence/types.ts:5-16` (legacy EvidenceType enum)
- `supabase/functions/_shared/intelligence/evidence/confidence.ts:53-78` (determineAbsencePolarity)
- `src/domain/evidence/golden-evidence-evaluator.ts:45-57,149-157,195-225,240-291` (suffi-guard; L2 formula deviation; WhatsApp context; overfit detectors)
- `tests/fixtures/evidence_golden/contract_expectations.ts:13-33,54-316` (atom taxonomy; fixtures)
- `tests/unit/evidence_golden_fixtures.test.ts:132-137` (OPPORTUNITY_RULES frozen ✓)

---

*End of read-only audit. No files modified other than this report.*