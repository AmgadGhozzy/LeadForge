# LeadForge — Gate 5.1 Candidate Opportunity Contracts

**Gate:** 5.1  
**Title:** Candidate Opportunity Contracts (Falsifiable Hypotheses Design)  
**Mode:** READ-ONLY / DESIGN-ONLY  
**Status:** DRAFT / CONTRACT DESIGN COMPLETE  
**Date:** 2026-09-23  

---

## 0. Scope, Purpose, and Frozen Preconditions

### 0.1 Purpose of Gate 5.1
Gate 5.0 concluded the Commercial Semantics Research, categorizing potential opportunity areas and establishing that:
1. `Channel Evidence != Commercial Opportunity` (rejection of A/C/E).
2. `Website Absence != Business Absence`.
3. Commercial opportunities cannot be inferred from raw channel presence or assumed internal business states.

Gate 5.1 bridges commercial semantics research and empirical evaluation. It **does NOT** test whether an opportunity is commercially successful or profitable. Instead, it answers a strictly bounded architectural question:

> **Can we define this Opportunity hypothesis in a way that makes it testable from existing Evidence, without inventing any information about the company?**

- If **YES** → `CONTRACTABLE` (advances to Gate 5.2 Golden Business-Journey Cases)
- If **NO** → `UNTESTABLE / DEFERRED / REJECTED`

### 0.2 Frozen Constraints 🔒
This gate is executed under strict governance guarantees:
```text
Production code changes:       0
Database mutations:             0
Ground Truth mutations:         0
Detector changes:               0
Offer catalog changes:          0
Active Opportunity Rules:       OPPORTUNITY_RULES = [] (ADR-005 frozen)
Evidence Layer state:           BASELINED (ADR-004 frozen, ADR-006 ratified)
C1 / C2 detector remediations:  DEFERRED
```

---

## 1. Boundary and Non-Inferability Rules

Every candidate evaluation contract formulated in this document is bound by the three non-negotiable architectural tenets from `GATE-005`:

### 1.1 Website Evidence vs. Business State vs. Outcome
```text
Website Evidence (Observable DOM / Atoms / Journey)
        ≠
Internal Business State (Staffing / CRM / Workload / Lead Volume)
        ≠
Commercial Outcome (Closed Sales / Conversion Lift / ROI)
```

### 1.2 The Observability & Absence Guard
Absence of evidence is not evidence of absence unless observability is proven sufficient:
```text
Good Observability + No Relevant Atom Observed  ⇒  WEBSITE_ABSENCE
Insufficient Observability (Shallow/Blocked)     ⇒  UNKNOWN
WEBSITE_ABSENCE                                 ≠  BUSINESS_ABSENCE
```

### 1.3 Strict List of Prohibited Inferences
Any rule, heuristic, or evaluation that relies on or outputs any of the following statements is **invalid and rejected**:
- *"The business is losing leads or revenue."*
- *"The business has slow response times."*
- *"Staff are overwhelmed with manual intake."*
- *"The business does not have an offline booking system or CRM."*
- *"Absence of WhatsApp causes missed customer demand."*
- *"The business needs automation."*
- *"The business has poor website conversion."*

---

## 2. Excluded Pipelines (Out-of-Scope Candidates)

The following two categories from Gate 5.0 are explicitly kept **outside** the Candidate Opportunity Pipeline:

### 2.1 Candidate: Lead Nurturing / Follow-up Gap
- **Gate 5.0 Status:** `UNTESTABLE`
- **Architectural Reason:** Nurturing and follow-up are internal operational processes occurring post-inquiry. A website cannot observe lead arrival rates, follow-up cadence, CRM synchronization, or sales rep response times.
- **Pipeline Decision:** **REMAINS UNTESTABLE**. Cannot be contracted from Website Evidence alone. Retained as a valid catalog offer (`automated-lead-nurturing`), but permanently excluded from website-derived opportunity rules.

### 2.2 Candidate: Channel-based Lead Opportunity (A/C/E Reasoning)
- **Gate 5.0 Status:** `NOT_SUPPORTED`
- **Architectural Reason:** The presence of contact channels (Phone, Email, WhatsApp) indicates contact capability only, not acquisition intent or operational bottlenecks. Absence of booking alongside WhatsApp presence does not prove an automation opportunity.
- **Pipeline Decision:** **REMAINS NOT_SUPPORTED**. Formally rejected from the candidate opportunity pipeline.

---

## 3. Candidate Opportunity Contracts

We evaluate the four `PARTIALLY_SUPPORTED` candidates from Gate 5.0:
1. `Website Acquisition Path Gap`
2. `Digital Booking Path Gap`
3. `Quote / Consultation Intake Gap`
4. `Website Audit / Conversion Improvement`

---

### Candidate 1: Website Acquisition Path Gap

```text
Candidate 1: Website Acquisition Path Gap
├── Business hypothesis
│   Commercial businesses offering products/services benefit from explicit digital acquisition
│   entry points (quote, consultation, booking, application, direct checkout) on their website.
│   When a commercial website describes offerings but lacks any observable digital entry/acquisition
│   action across all covered surfaces, an observable gap in its digital acquisition path exists.
│
├── Required Intent Evidence
│   - Service/product offering content present (Commercial discovery/presence).
│   - At least one commercial service or product described on the domain.
│
├── Required Journey Evidence
│   - Customer journey includes DISCOVERY stage (identifiable commercial offerings/catalog).
│   - Journey demonstrates outward commercial intent rather than internal/informational focus.
│
├── Required Observable Gap
│   All explicit Level-1 acquisition and transaction atoms are ABSENT across all crawled surfaces:
│   - QUOTE_CTA = ABSENT
│   - CONSULTATION_CTA = ABSENT
│   - APPOINTMENT_CTA = ABSENT
│   - APPLICATION_CTA = ABSENT (non-career context)
│   - DIRECT_CHECKOUT = ABSENT
│   - ONLINE_MEMBERSHIP = ABSENT
│   - APP_BASED_SERVICE = ABSENT
│
├── Observability requirement
│   - Multi-page crawl (depth >= 2) covering:
│     * Homepage
│     * Primary navigation links (Services, Solutions, Products, Contact)
│   - HTTP 200 on all crawled targets without bot blocking or hydration failure.
│   - observability_sufficient == true.
│
├── UNKNOWN conditions
│   - Single-page / homepage-only crawl when internal navigation links exist.
│   - JavaScript SPA rendering failure / blank DOM / hydration error.
│   - Anti-bot / Cloudflare captcha / HTTP 403/429.
│   - External subdomain / portal linked in header/nav but uninspected.
│
├── Hard negatives
│   - Non-commercial sites (personal blogs, open-source projects, informational documentation).
│   - Any site exposing at least one valid commercial acquisition CTA.
│   - Careers / Job recruitment pages (APPLICATION_CTA with hiring context must NOT be counted as acquisition).
│   - Newsletter / Blog subscription forms (must NOT be counted as customer acquisition).
│
├── Prohibited inferences
│   - MUST NOT infer that the business lacks clients or offline sales.
│   - MUST NOT infer that the business lacks phone or walk-in customer acquisition.
│   - MUST NOT infer that the company is "losing business" or "needs digital marketing".
│
├── Independent outcome required
│   - Independent business verification (blinded to detector):
│     1. Does the business actively seek customer acquisition via digital channels?
│     2. Is the lack of a website acquisition path intentional (e.g. referral-only, invite-only)?
│     3. When an explicit digital acquisition path is added, does it generate confirmed client inquiries?
│
└── Deterministic evaluation contract
```

#### Deterministic Contract (TypeScript Specification)
```typescript
export function evaluateWebsiteAcquisitionPathGap(
  atoms: AtomicEvidenceRecord,
  journey: CustomerJourneyEvidence,
  input: AtomicEvidenceInput
): 'GAP_DETECTED' | 'NO_GAP' | 'UNKNOWN' | 'NOT_APPLICABLE' {
  // 1. Observability Guard
  if (input.observability_sufficient !== true) {
    return 'UNKNOWN';
  }

  // 2. Commercial Intent & Journey Guard
  const hasDiscovery = journey.stages_declared === 'PRESENT';
  if (!hasDiscovery) {
    return 'NOT_APPLICABLE'; // Non-commercial or insufficient journey surface
  }

  // 3. Acquisition Atoms Evaluation
  const hasAcquisitionCta =
    atoms.QUOTE_CTA === 'PRESENT' ||
    atoms.CONSULTATION_CTA === 'PRESENT' ||
    atoms.APPOINTMENT_CTA === 'PRESENT' ||
    atoms.APPLICATION_CTA === 'PRESENT' ||
    atoms.DIRECT_CHECKOUT === 'PRESENT' ||
    atoms.ONLINE_MEMBERSHIP === 'PRESENT' ||
    atoms.APP_BASED_SERVICE === 'PRESENT';

  if (hasAcquisitionCta) {
    return 'NO_GAP';
  }

  // 4. All atoms conclusively ABSENT under verified coverage
  return 'GAP_DETECTED';
}
```

**Gate 5.1 Verdict: `CONTRACTABLE`**  
*Rationale:* Every element (intent, journey, gap) is strictly determinable from existing Level-1 atoms and Level-2 journey signals without inventing any internal business condition.

---

### Candidate 2: Digital Booking Path Gap

```text
Candidate 2: Digital Booking Path Gap
├── Business hypothesis
│   Service businesses whose delivery model relies on scheduled appointments (e.g. healthcare,
│   dental, professional consulting, personal services) benefit from direct online scheduling.
│   When a business offers appointment-driven services and invites consultations or appointments
│   on its website, but exposes zero digital booking/scheduling CTAs across all covered surfaces,
│   an observable gap in its digital booking path exists.
│
├── Required Intent Evidence
│   Explicit service interaction intent:
│   - CONSULTATION_CTA = PRESENT, OR
│   - QUOTE_CTA = PRESENT, OR
│   - Explicit service offering requiring appointment scheduling.
│
├── Required Journey Evidence
│   Pre-booking journey stage:
│   - CONSULTATION stage in customer journey, OR
│   - QUOTE stage in customer journey.
│   Excludes businesses where the primary transaction is direct checkout (e-commerce).
│
├── Required Observable Gap
│   - APPOINTMENT_CTA = ABSENT on all covered relevant surfaces.
│
├── Observability requirement
│   - Full coverage of homepage, service pages, practitioner/staff pages, and contact page.
│   - Inspection of all internal links matching booking/scheduling tokens:
│     ("book", "schedule", "appointment", "reserve", "احجز").
│   - observability_sufficient == true.
│
├── UNKNOWN conditions
│   - Uninspected third-party booking links (e.g. Calendly, Acuity, Fresha, HotDoc, Zocdoc).
│   - Crawl coverage limited to homepage when appointment keywords exist in navigation.
│   - Booking widget situated behind authenticated client/patient portal (SELF_SERVICE_PORTAL = PRESENT).
│   - Anti-bot / iframe sandbox blocking booking widget inspection.
│
├── Hard negatives
│   - Sites where APPOINTMENT_CTA = PRESENT.
│   - Non-appointment commercial models:
│     * Pure e-commerce retail (DIRECT_CHECKOUT = PRESENT).
│     * Urgent care / walk-in clinics with explicit "walk-in only, no appointments" text.
│     * Pure informational/directory sites.
│   - Sites offering generic contact channels (Phone/Email) without scheduled service context.
│
├── Prohibited inferences
│   - MUST NOT infer that the business cannot take bookings (may use phone, WhatsApp, or desk).
│   - MUST NOT infer that the business suffers high no-show rates or poor calendar utilization.
│   - MUST NOT infer that front-desk staff are overwhelmed by booking inquiries.
│   - MUST NOT infer that absence of online booking causes missed patient/client revenue.
│
├── Independent outcome required
│   - Independent operational verification:
│     1. Does the business actually operate on scheduled appointments?
│     2. What percentage of appointments are booked via offline channels?
│     3. When a digital booking workflow is deployed, does it generate confirmed appointments
│        that are operationally accepted by staff?
│
└── Deterministic evaluation contract
```

#### Deterministic Contract (TypeScript Specification)
```typescript
export function evaluateDigitalBookingPathGap(
  atoms: AtomicEvidenceRecord,
  journey: CustomerJourneyEvidence,
  input: AtomicEvidenceInput
): 'GAP_DETECTED' | 'NO_GAP' | 'UNKNOWN' | 'NOT_APPLICABLE' {
  // 1. Observability Guard
  if (input.observability_sufficient !== true) {
    return 'UNKNOWN';
  }

  // 2. Pre-booking Intent & Non-appointment Model Exclusion
  const hasPreBookingIntent =
    atoms.CONSULTATION_CTA === 'PRESENT' ||
    atoms.QUOTE_CTA === 'PRESENT';

  const isPureEcommerce =
    atoms.DIRECT_CHECKOUT === 'PRESENT' && !hasPreBookingIntent;

  if (!hasPreBookingIntent || isPureEcommerce) {
    return 'NOT_APPLICABLE';
  }

  // 3. Booking Capability Evaluation
  if (atoms.APPOINTMENT_CTA === 'PRESENT') {
    return 'NO_GAP';
  }

  if (atoms.APPOINTMENT_CTA === 'ABSENT') {
    return 'GAP_DETECTED';
  }

  return 'UNKNOWN';
}
```

**Gate 5.1 Verdict: `CONTRACTABLE`**  
*Rationale:* Operates strictly on observable Level-1 atoms (`CONSULTATION_CTA`, `QUOTE_CTA`, `APPOINTMENT_CTA`, `DIRECT_CHECKOUT`). Business scheduling operations are acknowledged as unobservable from the web and isolated into the independent outcome phase.

---

### Candidate 3: Quote / Consultation Intake Gap

```text
Candidate 3: Quote / Consultation Intake Gap
├── Business hypothesis
│   Businesses offering customized or consultative services require structured prospect intake
│   (e.g. project requirements, scope, budget, specifications) to qualify leads effectively.
│   When a business explicitly solicits quotes or consultations on its website, but provides
│   no structured digital intake mechanism (application form, structured intake questionnaire)
│   on the destination surface, routing the prospect exclusively to unstructured contact channels,
│   an observable intake gap exists.
│
├── Required Intent Evidence
│   Explicit commercial inquiry intent:
│   - QUOTE_CTA = PRESENT, OR
│   - CONSULTATION_CTA = PRESENT.
│
├── Required Journey Evidence
│   Customer journey includes QUOTE or CONSULTATION stage.
│
├── Required Observable Gap
│   The observable destination of the quote/consultation CTA lacks a structured digital intake mechanism:
│   - APPLICATION_CTA = ABSENT on the destination surface.
│   - The CTA resolves exclusively to an unstructured channel (raw mailto, tel:, or bare WhatsApp).
│   - No structured questionnaire or requirement-gathering form exists on the destination page.
│
├── Observability requirement
│   - The specific target/destination URL of the QUOTE_CTA or CONSULTATION_CTA must be crawled and analyzed.
│   - If the CTA links to an internal sub-page (e.g. /quote, /consultation-request), that page MUST
│     be fetched and inspected.
│   - If the destination page is not fetched, observability is INSUFFICIENT (UNKNOWN).
│
├── UNKNOWN conditions
│   - Destination URL of the CTA failed to crawl (HTTP 404, 500, timeout).
│   - Multi-step questionnaire hosted in an unrendered third-party iframe (Typeform, HubSpot, Jotform).
│   - Client-side dynamic form rendered only upon complex user interaction.
│   - Gated portal requiring authentication prior to viewing the intake form.
│
├── Hard negatives
│   - Sites with structured onboarding or inquiry forms (APPLICATION_CTA = PRESENT in customer context).
│   - Sites with dedicated quote intake forms containing structured input fields.
│   - Fixed-price e-commerce models (DIRECT_CHECKOUT = PRESENT).
│   - Careers / Employment application pages.
│
├── Prohibited inferences
│   - MUST NOT infer that sales reps or staff have slow response times.
│   - MUST NOT infer that the company handles quote requests in spreadsheets or lacks a CRM.
│   - MUST NOT infer that manual qualification causes lead drop-off or deal loss.
│   - MUST NOT infer that the business is dissatisfied with phone/email inquiries.
│
├── Independent outcome required
│   - Independent operational qualification verification:
│     1. How does the business currently capture lead requirements for quotes/consultations?
│     2. Does the business spend significant manual time qualifying unvetted inquiries?
│     3. When a structured digital intake form is deployed, does it yield actionable project data
│        and decrease qualification friction?
│
└── Deterministic evaluation contract
```

#### Deterministic Contract (TypeScript Specification)
```typescript
export interface IntakeDestinationEvidence {
  destination_crawled: boolean;
  has_structured_form: boolean;
  resolved_channel: 'PHONE' | 'EMAIL' | 'WHATSAPP' | 'FORM' | 'PORTAL' | 'UNKNOWN';
}

export function evaluateQuoteConsultationIntakeGap(
  atoms: AtomicEvidenceRecord,
  destination: IntakeDestinationEvidence,
  input: AtomicEvidenceInput
): 'GAP_DETECTED' | 'NO_GAP' | 'UNKNOWN' | 'NOT_APPLICABLE' {
  // 1. Observability Guard
  if (input.observability_sufficient !== true) {
    return 'UNKNOWN';
  }

  // 2. Quote / Consultation Intent
  const hasIntakeIntent =
    atoms.QUOTE_CTA === 'PRESENT' || atoms.CONSULTATION_CTA === 'PRESENT';

  if (!hasIntakeIntent) {
    return 'NOT_APPLICABLE';
  }

  // 3. Destination Surface Observability Guard
  if (!destination.destination_crawled) {
    return 'UNKNOWN'; // Destination was not observed; cannot assert absence of intake form
  }

  // 4. Intake Capability Evaluation
  const hasStructuredIntake =
    atoms.APPLICATION_CTA === 'PRESENT' ||
    destination.has_structured_form ||
    destination.resolved_channel === 'FORM';

  if (hasStructuredIntake) {
    return 'NO_GAP';
  }

  // Destination relies purely on unstructured channel
  if (['PHONE', 'EMAIL', 'WHATSAPP'].includes(destination.resolved_channel)) {
    return 'GAP_DETECTED';
  }

  return 'UNKNOWN';
}
```

**Gate 5.1 Verdict: `CONTRACTABLE`**  
*Rationale:* Fully expressible as a falsifiable hypothesis based on the presence of quote/consult intent and the absence of structured intake on the crawled destination surface. Dependent on destination surface observability.

---

### Candidate 4: Website Audit / Conversion Improvement

```text
Candidate 4: Website Audit / Conversion Improvement
├── Business hypothesis
│   Commercial websites with digital acquisition pathways lose visitor engagement when they suffer
│   from objective, observable technical and UX defects (e.g. broken acquisition links, unhandled
│   mobile viewport, missing HTTPS on checkout/intake, severe layout CLS). Remediating these
│   observable defects improves the integrity of the acquisition path.
│
├── Required Intent Evidence
│   - Commercial presence and active acquisition intent (at least one of QUOTE_CTA, CONSULTATION_CTA,
│     APPOINTMENT_CTA, APPLICATION_CTA, DIRECT_CHECKOUT is PRESENT).
│
├── Required Journey Evidence
│   - An active customer journey stage (DISCOVERY, CONSULTATION, QUOTE, BOOKING, PAYMENT).
│
├── Required Observable Gap
│   A specific, objectively verifiable technical or UX defect on an active acquisition surface:
│   - Broken CTA destination (404/500 on CTA click target).
│   - Missing mobile viewport / non-responsive container on intake form.
│   - Insecure transport (HTTP) on intake or checkout form.
│
├── Observability requirement
│   - Full DOM inspection, HTTP status resolution of all CTA targets, mobile viewport meta verification.
│
├── UNKNOWN conditions
│   - Generic subjective aesthetic claims ("dated design", "poor copy", "bad UX") without deterministic rules.
│   - Technical inspection tools (Lighthouse, Core Web Vitals, link checkers) unexecuted.
│
├── Hard negatives
│   - Websites where all acquisition CTAs resolve to HTTP 200, mobile viewport is present, and HTTPS is active.
│   - Non-commercial websites where conversion is irrelevant.
│
├── Prohibited inferences
│   - MUST NOT infer that "80% of traffic is bouncing".
│   - MUST NOT infer conversion rate percentages without analytics access.
│   - MUST NOT infer that the business owner is unhappy with their site or wants an overhaul.
│
├── Independent outcome required
│   - Independent validation:
│     1. Does the business acknowledge the technical defect as a legitimate problem?
│     2. Does resolving the defect result in verified restoration of broken traffic or commercial lift?
│
└── Deterministic evaluation contract
```

#### Deterministic Contract Evaluation & Defect Atom Gap Analysis
Can Candidate 4 be evaluated from the **currently baselined Evidence Layer**?
Let us audit the frozen Level-1 atoms:
```text
Available Level-1 Atoms:
- DIRECT_CHECKOUT
- QUOTE_CTA
- CONSULTATION_CTA
- APPOINTMENT_CTA
- APPLICATION_CTA
- SELF_SERVICE_PORTAL
- ONLINE_MEMBERSHIP
- APP_BASED_SERVICE
- WHATSAPP
```

Notice:
- There is **no atom** for `BROKEN_CTA_TARGET`.
- There is **no atom** for `MISSING_VIEWPORT`.
- There is **no atom** for `MIXED_CONTENT_FORM`.
- There is **no atom** for `PAGE_PERFORMANCE_SCORE`.

Under the frozen preconditions (`PRODUCTION_MUTATION = 0`, `DETECTOR_CHANGES = 0`), the existing Evidence Layer **does not possess atomic detectors for technical website defects**.

To evaluate Candidate 4 today would require either:
1. Relying on subjective LLM opinions or unevidenced heuristics (violates ADR-006 and Gate 5.0 R5), or
2. Inventing un-baselined evidence atoms outside the frozen detector suite (violates ADR-004 freeze).

**Gate 5.1 Verdict: `DEFERRED`**  
*Rationale:* The hypothesis itself is conceptually falsifiable, but it **cannot be deterministically evaluated from the existing baselined Evidence Layer**. It is formally `DEFERRED` until a future Evidence Layer expansion defines, tests, and baselines specific technical defect atoms (e.g. `BROKEN_CTA_TARGET`, `VIEWPORT_RESPONSIVE`).

---

## 4. Master Candidate Evaluation Table

| Candidate | Required Intent Evidence | Required Journey Evidence | Required Observable Gap | Existing Evidence Sufficiency | Independent Outcome Requirement | Gate 5.1 Verdict | Next Stage |
|---|---|---|---|---|---|---|---|
| **Website Acquisition Path Gap** | Service/product catalog content | `DISCOVERY` | All acquisition CTAs `ABSENT` on all covered surfaces | **SUFFICIENT** (`QUOTE`, `CONSULT`, `APPT`, `APPL`, `CHECKOUT` atoms exist) | Verify company's digital sales intent and lead capture lift | **`CONTRACTABLE`** | **Gate 5.2 Golden Cases** |
| **Digital Booking Path Gap** | `CONSULTATION_CTA` / `QUOTE_CTA` | `CONSULTATION` / `QUOTE` | `APPOINTMENT_CTA = ABSENT` on covered surfaces | **SUFFICIENT** (`APPOINTMENT_CTA` atom exists) | Verify appointment-driven operations and staff workflow adoption | **`CONTRACTABLE`** | **Gate 5.2 Golden Cases** |
| **Quote/Consultation Intake Gap** | `QUOTE_CTA` / `CONSULTATION_CTA` | `QUOTE` / `CONSULTATION` | Destination CTA lacks structured form; unstructured channel only | **SUFFICIENT** (with destination page crawling) | Verify manual qualification overhead and intake completion | **`CONTRACTABLE`** | **Gate 5.2 Golden Cases** |
| **Website Audit / Conversion Improvement** | Any commercial acquisition CTA | `DISCOVERY` / `CONSULTATION` / `BOOKING` | Specific technical defect (broken link, viewport defect) | **INSUFFICIENT** (No technical defect atoms in frozen layer) | Verify client acknowledgment of defect and technical remediation | **`DEFERRED`** | *Deferred to future Evidence Expansion* |
| *Lead Nurturing / Follow-up Gap* | Acquisition / Service context | Any journey stage | Post-inquiry follow-up deficiency | **ZERO** (Internal process unobservable from web) | N/A | **`UNTESTABLE`** | *Permanently outside web rule pipeline* |
| *Channel-based Lead Opportunity* | Contact channel presence | None | Absence of digital widget alongside channel | **INVALID** (Rejection of A/C/E) | N/A | **`NOT_SUPPORTED`** | *Permanently rejected* |

---

## 5. Architectural Synthesis & Governance Summary

### 5.1 Findings of Gate 5.1
1. **Three candidates are `CONTRACTABLE`:**
   - `Website Acquisition Path Gap`
   - `Digital Booking Path Gap`
   - `Quote / Consultation Intake Gap`
   
   These three can be evaluated purely from observable website evidence, with strict non-inferability boundaries separating website facts from internal business operations.

2. **One candidate is `DEFERRED`:**
   - `Website Audit / Conversion Improvement` is technically defensible in principle, but the current frozen Evidence Layer lacks atomic defect detectors. In accordance with clean engineering governance, we defer it rather than fabricating unevidenced heuristics.

3. **Two categories remain permanently outside the web pipeline:**
   - `Lead Nurturing / Follow-up` (`UNTESTABLE`)
   - `Channel-based Lead Opportunity` (`NOT_SUPPORTED`)

### 5.2 Production Invariants Maintained 🔒
```text
EVIDENCE_LAYER        = BASELINED 🔒
OPPORTUNITY_RULES     = [] 🔒
CODE_MUTATIONS        = 0 🔒
DB_MUTATIONS          = 0 🔒
DETECTOR_MUTATIONS    = 0 🔒
```

---

## 6. Next Steps in the Opportunity Pipeline

With Gate 5.1 contracts designed and classified, the pipeline proceeds sequentially:

```text
Gate 5.1: Candidate Contracts (COMPLETE ✅)
    ├── CONTRACTABLE: Website Acquisition Path Gap
    ├── CONTRACTABLE: Digital Booking Path Gap
    ├── CONTRACTABLE: Quote / Consultation Intake Gap
    └── DEFERRED:     Website Audit / Conversion Improvement
            ↓
Gate 5.2: Golden Business-Journey Cases
            ↓
Gate 5.3: Opportunity Backtest
            ↓
Gate 5.4: Independent Outcome Validation
            ↓
Rule Design Gate
            ↓
Production Opportunity Rule (ADR-005 unfreeze)
```
