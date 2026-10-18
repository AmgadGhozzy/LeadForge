# LeadForge — Gate 5.0 Commercial Semantics Research

**Gate:** 5.0  
**Title:** Commercial Semantics Research  
**Mode:** READ-ONLY  
**Status:** RESEARCH-ONLY / NO PRODUCTION CHANGE  
**Date:** 2026-09-23

---

## 0. Scope and Frozen Preconditions

This document starts after the Evidence Backtest cycle was closed at Gate 4.6.

Frozen inputs:

- ADR-004 Evidence Layer — FROZEN
- ADR-006 Evidence Design — RATIFIED
- ADR-005 Opportunity Engine — `OPPORTUNITY_RULES = []`
- Evidence Layer — `BASELINED`
- Level-1 Atomic Evidence — accepted as the source of observable website facts
- Level-2 Derived Commercial Signals — deterministic derivations only
- C1/C2 detector candidates — DEFERRED
- No production code changes
- No database mutation
- No Ground Truth mutation
- No detector changes
- No new Opportunity Rule

### Research boundary

This research may establish what a website can prove, what it cannot prove, and which opportunity hypotheses are testable.

It MUST NOT infer:

- internal CRM usage
- lead volume
- response speed
- staffing levels
- missed leads
- conversion rate
- sales performance
- operational bottlenecks
- whether a company "needs automation"
- whether a company "is likely losing leads"
- whether absence of WhatsApp causes missed opportunities
- any other internal business state not observable from the website

The central distinction is:

```text
Website Evidence
    !=
Internal Business State
    !=
Commercial Outcome
```

---

# R1 — Commercial Intent

## R1.1 Definition

**Observable commercial intent** means that the website exposes an observable path by which a visitor can initiate, request, schedule, apply for, purchase, or otherwise enter a transaction/service interaction.

It does not mean that the business is actively seeking leads, has high demand, or has an operational problem.

Level-1 atoms considered in this research include:

- `DIRECT_CHECKOUT`
- `QUOTE_CTA`
- `CONSULTATION_CTA`
- `APPLICATION_CTA`
- `BOOKING_CTA`
- `SUPPORT_CTA`
- `ACQUISITION_CTA`
- `SELF_SERVICE_PORTAL`
- `ONLINE_MEMBERSHIP`
- `APP_BASED_SERVICE`

Relevant Level-2 signals include:

- `HAS_ACQUISITION_PATH`
- `HAS_SELF_SERVICE_PATH`
- `REQUIRES_HUMAN_INTERACTION`
- `CUSTOMER_JOURNEY_STAGES`

## R1.2 Candidate combinations

### Candidate R1-A — Explicit Acquisition CTA

**Atoms required**

- `ACQUISITION_CTA = PRESENT`
- sufficient evidence/provenance for the CTA
- CTA context is associated with the service/business offering rather than support, careers, newsletter, or unrelated content

**What it proves**

The website exposes an observable acquisition/entry action for the offering.

**What it does not prove**

- lead volume
- lead quality
- lead response speed
- conversion
- manual processing
- need for automation
- missed leads
- CRM usage
- business intent outside the observed website path

**Result:** `SUPPORTED`

---

### Candidate R1-B — Quote / Consultation Acquisition

**Atoms required**

One of:

- `QUOTE_CTA = PRESENT`
- `CONSULTATION_CTA = PRESENT`

plus service-context evidence and adequate observability.

**What it proves**

The website exposes a human-interaction acquisition stage in which the visitor requests a quote or consultation.

**What it does not prove**

- that the business receives many such requests
- that requests are handled manually
- that response is slow
- that requests are lost
- that follow-up is deficient
- that an automation product is required

**Result:** `SUPPORTED`

---

### Candidate R1-C — Booking Acquisition

**Atoms required**

- `BOOKING_CTA = PRESENT`
- service context
- adequate observability of the relevant journey surface

**What it proves**

The website exposes a booking/scheduling interaction.

**What it does not prove**

- booking volume
- no-show rate
- appointment utilization
- reminder quality
- follow-up quality
- operational automation gap

**Result:** `SUPPORTED`

---

### Candidate R1-D — Direct Transaction

**Atoms required**

- `DIRECT_CHECKOUT = PRESENT`

Optionally supported by:

- `ONLINE_MEMBERSHIP = PRESENT`
- `SELF_SERVICE_PORTAL = PRESENT`

**What it proves**

An observable self-service transaction path exists on the website.

**What it does not prove**

- that all offerings are self-service
- that human interaction is unnecessary
- that the business has no acquisition journey
- that the business has no support needs
- that the observed transaction concerns the primary service rather than retail/product sales

**Result:** `SUPPORTED`

---

### Candidate R1-E — Human-Interaction Requirement

**Atoms required**

One or more of:

- `QUOTE_CTA`
- `CONSULTATION_CTA`
- `APPLICATION_CTA`

with valid service context and no contradictory interpretation.

**What it proves**

The observed customer journey contains an explicit interaction/application stage.

**What it does not prove**

- internal staffing
- manual workload
- response latency
- automation deficit
- lead leakage

**Result:** `SUPPORTED`

---

### Candidate R1-F — Channel Presence as Commercial Intent

Examples:

- `WHATSAPP = PRESENT`
- `PHONE = PRESENT`
- `EMAIL = PRESENT`

without a qualifying acquisition CTA/context.

**What it proves**

A contact channel is exposed.

**What it does not prove**

Commercial acquisition intent. The same channel may be support, regulatory contact, general contact, or another purpose.

**Result:** `NOT_SUPPORTED`

This is the formal rejection of the A/C/E reasoning pattern as a commercial-intent rule.

---

## R1 conclusion

The strongest observable commercial-intent evidence is an explicit, context-valid transaction or acquisition action.

A channel alone is insufficient.

```text
Explicit commercial action + valid context
    -> observable commercial intent

Contact channel alone
    -> contact capability only
```

No R1 combination is itself an Opportunity Rule.

---

# R2 — Business Journey Stages

The status below answers only whether a stage can be established from website evidence. It does not assert that the stage exists inside the business beyond the observed website.

| Journey stage | Level-1 Evidence Indicator | Status | Boundary |
|---|---|---|---|
| `DISCOVERY` | Service/product content establishing what is offered; informational page presence | `PARTIALLY_SUPPORTED` | Content can show offering information, but not a user's actual discovery behavior |
| `QUALIFICATION` | `APPLICATION_CTA`, structured intake, case-specific assessment language, quote prerequisites | `PARTIALLY_SUPPORTED` | A form/intake step can be observed; qualification outcome cannot |
| `CONSULTATION` | `CONSULTATION_CTA` with valid consultation context | `SUPPORTED` | Generic Contact Us does not qualify |
| `QUOTE` | `QUOTE_CTA` with valid service context | `SUPPORTED` | Does not prove a quote was requested or issued |
| `APPLICATION` | `APPLICATION_CTA` with customer/service-application context | `SUPPORTED` | Careers/job application is excluded |
| `BOOKING` | `BOOKING_CTA` / canonical appointment scheduling action | `SUPPORTED` | Does not prove successful appointment creation |
| `PAYMENT` | `DIRECT_CHECKOUT` with an observable payment/checkout path | `SUPPORTED` | Does not prove payment completion |
| `FULFILLMENT` | Explicit post-purchase/service-delivery path, portal/status/activation evidence | `PARTIALLY_SUPPORTED` | Website evidence may expose a delivery stage but cannot prove actual fulfillment |
| `SUPPORT` | `SUPPORT_CTA`, support portal, support/contact context | `SUPPORTED` | Does not prove support workload or response quality |

### R2.1 Journey-stage rule

A stage is `SUPPORTED` only when the website exposes an observable action or explicit journey surface corresponding to that stage.

The following are insufficient by themselves:

- phone number
- generic email
- generic Contact Us
- generic WhatsApp
- navigation labels without action/context
- internal assumptions about how the company operates

### R2.2 Journey sequence

Multiple stages may be observed together.

Example:

```text
DISCOVERY
   ↓
CONSULTATION_CTA
   ↓
QUOTE_CTA
   ↓
BOOKING_CTA
```

This can establish an **observable website journey sequence**.

It cannot establish:

```text
lead volume
conversion
staff workload
response time
drop-off
```

---

# R3 — Missing Capability: Website Absence ≠ Business Absence

## R3.1 Official rule

The official rule is:

> **Website Absence means that the relevant evidence was not observed on an adequately observable website/journey surface. Business Absence means that the capability does not exist anywhere in the business. Website Evidence can establish the former under sufficient observability; it cannot establish the latter.**

Formal representation:

```text
OBSERVABLE SURFACE
+
SUFFICIENT COVERAGE
+
NO ATOM OBSERVED
    ↓
WEBSITE_ABSENCE
```

But:

```text
WEBSITE_ABSENCE
    !=
BUSINESS_ABSENCE
```

And:

```text
INSUFFICIENT OBSERVABILITY
    ↓
UNKNOWN
```

## R3.2 Permitted inferences

Allowed:

- "No `BOOKING_CTA` was observed on the crawled booking-relevant surfaces."
- "No explicit online checkout was observed in the inspected website surface."
- "An acquisition CTA is present."
- "A consultation stage is explicitly exposed."
- "The observed journey includes quote → booking."
- "The relevant surface was insufficiently observable, therefore the state is UNKNOWN."

## R3.3 PROHIBITED_INFERENCE

The following are prohibited:

- "The business does not accept bookings."
- "The business has no CRM."
- "The business has no automation."
- "The business is losing leads."
- "The business probably loses leads."
- "They need automation."
- "No WhatsApp means missed opportunities."
- "Response times are likely slow."
- "The staff handles every lead manually."
- "The company has high lead volume."
- "The company has poor conversion."
- "The company has an internal follow-up bottleneck."

These require internal or outcome evidence unavailable from the website.

## R3.4 Absence safety

The ADR-006 observability rule remains binding:

```text
good observability + no relevant evidence
    -> ABSENT

insufficient observability
    -> UNKNOWN
```

Homepage-only observation is not sufficient to prove absence of a deep journey capability when that capability could reasonably exist on another relevant surface.

---

# R4 — Minimum Evidence Threshold

There is deliberately **no universal signal-count threshold**.

A valid Opportunity hypothesis requires three logically distinct dimensions:

```text
INTENT EVIDENCE
+
JOURNEY EVIDENCE
+
OBSERVABLE GAP EVIDENCE
```

Each candidate must define what is sufficient in its own domain.

## R4.1 Candidate Opportunity Type A — Website Acquisition Path Gap

**Intent**

- explicit service/acquisition context exists, e.g. `ACQUISITION_CTA`, `QUOTE_CTA`, `CONSULTATION_CTA`, `APPLICATION_CTA`, or `BOOKING_CTA`

**Journey**

- a relevant customer-entry stage is explicitly observed

**Gap**

- a specific expected website acquisition capability is `ABSENT`
- observability is sufficient for that specific surface

**Minimum sufficient evidence**

```text
service-linked acquisition intent
+
identified journey stage
+
specific website-level capability absence
+
sufficient observability
```

**What remains unproven**

Whether the business actually experiences a commercial problem because of that website gap.

**Status:** `PARTIALLY_SUPPORTED`

---

## R4.2 Candidate Opportunity Type B — Digital Booking Path Gap

**Intent**

- service-linked acquisition/interaction evidence

**Journey**

- consultation/quote/application or equivalent pre-booking stage

**Gap**

- no observable `BOOKING_CTA` on sufficiently covered relevant surfaces

**Minimum sufficient evidence**

```text
service interaction intent
+
pre-booking journey stage
+
booking capability ABSENT
+
sufficient observability
```

**Unproven**

- whether booking occurs through phone, WhatsApp, app, staff, or another channel
- whether the absence causes measurable business loss

**Status:** `PARTIALLY_SUPPORTED`

---

## R4.3 Candidate Opportunity Type C — Digital Quote/Consultation Intake Gap

**Intent**

- explicit service acquisition

**Journey**

- `QUOTE_CTA` or `CONSULTATION_CTA` or equivalent interaction stage

**Gap**

- absence of a defined digital intake mechanism can be observed only if the website exposes enough of the relevant journey to establish the absence

**Minimum sufficient evidence**

```text
explicit interaction intent
+
interaction journey stage
+
specific intake capability ABSENT
+
sufficient observability
```

**Unproven**

- manual processing
- response speed
- lead volume
- operational burden

**Status:** `PARTIALLY_SUPPORTED`

---

## R4.4 Candidate Opportunity Type D — Lead Nurturing / Follow-up Gap

**Intent**

- service acquisition evidence

**Journey**

- observable acquisition/consultation/quote/booking path

**Gap**

A website alone does not provide sufficient evidence for the internal follow-up state.

The website cannot establish:

- lead arrival volume
- response time
- follow-up cadence
- CRM state
- staffing
- missed leads
- conversion loss

**Minimum sufficient website evidence**

No website-only combination is sufficient.

**Status:** `UNTESTABLE`

This is important: the existing `automated-lead-nurturing` offer may be commercially valid, but its internal operational preconditions are not provable from the current Website Evidence contract.

---

## R4.5 Candidate Opportunity Type E — Website Audit / Conversion Improvement

A generic "website needs improvement" claim is not itself a deterministic opportunity.

A candidate would require a specific observable defect with a defined policy relationship, such as:

```text
specific acquisition surface
+
specific observable friction/absence
+
sufficient coverage
+
validated mapping to a defined commercial policy
```

The current Evidence contract does not yet define enough atomic evidence to make a generic website-audit Opportunity Rule.

**Status:** `PARTIALLY_SUPPORTED`

This is a research candidate, not a rule.

---

# R5 — Validation Against Outcomes

## R5.1 Principle

A commercial Opportunity hypothesis is not validated by:

- LLM classification
- heuristic agreement
- human intuition
- detector score
- retrospective label fitting

Validation requires an **independent real-world outcome** tied to the business and the proposed Opportunity.

## R5.2 Opportunity Ground Truth

For this project, an Opportunity Ground Truth record must contain:

1. **Business identity**
   - stable business identifier

2. **Frozen website evidence snapshot**
   - scan ID
   - evidence atoms
   - provenance
   - observability state
   - timestamp

3. **Candidate hypothesis**
   - exact candidate identifier/version
   - exact required evidence
   - exact observable gap

4. **Independent business-state verification**
   - a fact about the relevant operational condition that cannot be derived from the same website evidence

5. **Outcome**
   - objective event showing whether the proposed problem/opportunity condition was present and materially relevant

6. **Disposition**
   - confirmed
   - not confirmed
   - unable to verify

The decisive point is that the business-state verification must be independent of the website detector.

## R5.3 Validation protocol

### Phase 1 — Freeze

Before contacting a business:

```text
Evidence snapshot
+
Candidate hypothesis
+
Evidence version
+
Policy version
```

are frozen.

The candidate cannot be altered after seeing the business outcome.

### Phase 2 — Blind hypothesis generation

Generate the candidate deterministically from the frozen evidence.

No LLM-generated opportunity label is used as Ground Truth.

### Phase 3 — Independent verification

Obtain a business-state fact from an independent source appropriate to the candidate.

Examples of acceptable evidence:

- a business-provided operational record
- a system export
- a transaction/process record
- a verified integration state
- a documented implementation state

The website detector itself is not sufficient.

### Phase 4 — Outcome definition

For an operational opportunity, the primary outcome should be a measurable real-world event directly connected to the proposed gap.

Examples:

```text
Candidate: booking-path gap
Outcome:
business confirms booking is handled outside the website
AND
implements or purchases the proposed booking solution
```

or, for a follow-up opportunity:

```text
Candidate: follow-up gap
Outcome:
independent operational record confirms the relevant follow-up condition
AND
the business adopts the corresponding solution
```

A sale by itself is not enough to prove the underlying hypothesis. It must be paired with independent verification of the relevant business condition.

### Phase 5 — Blinded adjudication

The verifier assessing the business-state outcome must not receive the detector's candidate score or an LLM classification.

The verifier records:

```text
CONFIRMED
NOT_CONFIRMED
UNABLE_TO_VERIFY
```

using predefined evidence criteria.

### Phase 6 — Cohort validation

A candidate should not become a production rule from a single success.

Validation should use a frozen cohort containing:

- positive candidate cases
- negative controls
- unknown/insufficient-observability cases

The cohort must be frozen before outcome collection.

### Phase 7 — Predeclared decision metrics

For a binary candidate, calculate:

- precision
- recall, when an independently verified positive population exists
- specificity
- false-positive rate
- false-negative rate
- unknown rate
- outcome-confirmation rate

Do not choose a threshold after observing outcomes.

### Phase 8 — Rule eligibility

Only after the candidate demonstrates reproducible association with independently verified business outcomes may it become eligible for an Opportunity Rule design.

Even then:

```text
validated hypothesis
    !=
automatically approved production rule
```

A separate contract/rule-design gate is required.

---

# Candidate Table — Mandatory Output

| Candidate | Required Evidence | Observable Gap | Non-inferable Assumptions | Validation Method | Status |
|---|---|---|---|---|---|
| Website Acquisition Path Gap | Service-linked `ACQUISITION_CTA` / `QUOTE_CTA` / `CONSULTATION_CTA` / `APPLICATION_CTA` / `BOOKING_CTA` + sufficient coverage | Specific acquisition capability absent on relevant covered surface | Business does not offer the capability elsewhere; gap causes lost business | Independent business-state verification + frozen cohort outcome | `PARTIALLY_SUPPORTED` |
| Digital Booking Path Gap | Service interaction intent + pre-booking journey + sufficient coverage | `BOOKING_CTA` absent on relevant covered surfaces | Booking is unavailable elsewhere; absence causes missed demand | Verify actual booking workflow independently; measure adoption/operational outcome | `PARTIALLY_SUPPORTED` |
| Quote/Consultation Intake Gap | `QUOTE_CTA` / `CONSULTATION_CTA` + service context + sufficient coverage | Specific digital intake capability absent | Manual workload, slow response, lost leads | Independent workflow verification + defined operational outcome | `PARTIALLY_SUPPORTED` |
| Lead Nurturing / Follow-up Gap | Website acquisition/interaction evidence can establish context only | Internal follow-up state is not observable from website | Lead volume, response speed, staffing, CRM, missed leads | Independent operational records + outcome after controlled offer/implementation | `UNTESTABLE` |
| Website Audit / Conversion Improvement | Specific observable website defect + acquisition context + sufficient coverage | Defined website-level friction/absence | Defect causes conversion loss; business wants remediation | Independent business outcome tied to the specific defect | `PARTIALLY_SUPPORTED` |
| Channel-based Lead Opportunity | Phone/Email/WhatsApp alone | None that establishes a commercial/operational gap | Channel is acquisition; channel absence/presence predicts lead loss | No valid website-only ground truth protocol for this claim | `NOT_SUPPORTED` |

---

# Research Findings

## Finding 1 — Explicit action beats channel presence

The strongest Level-1 commercial signals are explicit actions tied to the service journey.

```text
QUOTE_CTA
CONSULTATION_CTA
BOOKING_CTA
APPLICATION_CTA
ACQUISITION_CTA
DIRECT_CHECKOUT
```

are semantically stronger than raw contact channels.

## Finding 2 — Website evidence can prove a website journey, not internal operations

The evidence layer can establish:

```text
"the website exposes X"
"the website does not expose X under sufficient coverage"
"the observed website journey contains stages A → B → C"
```

It cannot establish:

```text
"the business internally lacks X"
"the business has a bottleneck"
"the business loses leads"
```

## Finding 3 — Opportunity requires an independently testable gap

The minimum structure is:

```text
INTENT
+
JOURNEY
+
SPECIFIC OBSERVABLE GAP
```

but this structure produces a **candidate hypothesis**, not proof of a business outcome.

## Finding 4 — Lead nurturing is not currently website-provable

The existing `automated-lead-nurturing` offer remains a valid catalog item, but its internal prerequisites are not observable from the current Website Evidence contract.

Therefore:

```text
automated-lead-nurturing
    ≠
current website-derived Opportunity Rule
```

## Finding 5 — A/C/E remains rejected

The historical patterns based on phone/WhatsApp/email plus booking absence do not satisfy the Commercial Semantics contract.

The hard-negative results and subsequent Evidence analysis establish:

```text
Channel Evidence
    !=
Commercial Opportunity
```

---

# Governance Decision

## Current Opportunity Engine state

```text
OPPORTUNITY_RULES = []
```

This research does not authorize any production rule.

## Candidate states after Gate 5.0

```text
SUPPORTED
    = Evidence combination itself is observable and semantically defined.

PARTIALLY_SUPPORTED
    = Website can establish a candidate website-level gap,
      but business impact/internal state still requires independent verification.

NOT_SUPPORTED
    = Evidence does not support the proposed commercial interpretation.

UNTESTABLE
    = The required condition is fundamentally outside current Website Evidence.
```

## Required path before any Opportunity Rule

```text
Evidence BASELINED
        ↓
Commercial Semantics Research
        ↓
Candidate Opportunity Contract
        ↓
Golden Business-Journey Cases
        ↓
Frozen Outcome Validation Cohort
        ↓
Independent Outcome Ground Truth
        ↓
Backtest / Outcome Analysis
        ↓
Rule Design Gate
        ↓
Only then: production Opportunity Rule
```

---

# Gate 5.0 Verdict

**PASS — RESEARCH COMPLETE**

Gate 5.0 establishes that:

1. Explicit, context-valid acquisition and transaction atoms can establish observable commercial intent.
2. Several customer-journey stages are website-provable, but internal execution is not.
3. Website absence is never equivalent to business absence.
4. Opportunity candidates require intent + journey + a specific observable gap, with sufficiency defined per candidate rather than by a fixed signal count.
5. Opportunity truth must be validated against independently verified real-world business outcomes.
6. `automated-lead-nurturing` is currently `UNTESTABLE` from Website Evidence alone.
7. Channel-only A/C/E reasoning remains rejected.
8. No candidate is authorized as a production Opportunity Rule by this gate.

**Frozen state after Gate 5.0:**

```text
EVIDENCE_LAYER = BASELINED
OPPORTUNITY_RULES = []
C1 = DEFERRED
C2 = DEFERRED
PRODUCTION_MUTATION = 0
```

**Next required gate:** Candidate Opportunity Contract Design — not production implementation.
