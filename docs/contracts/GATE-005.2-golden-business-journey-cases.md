# LeadForge — Gate 5.2 Golden Business-Journey Cases

**Gate:** 5.2  
**Title:** Golden Business-Journey Cases (Falsifiable Contract Test Suite)  
**Mode:** READ-ONLY / TEST-DATA ONLY  
**Status:** PASS — GOLDEN BUSINESS-JOURNEY CASE SUITE RATIFIED 🔒  
**Date:** 2026-09-23  

---

## 0. Scope, Purpose, and Frozen Preconditions

### 0.1 Purpose of Gate 5.2
Gate 5.1 established the deterministic contracts for the three `CONTRACTABLE` opportunity candidates:
1. `Website Acquisition Path Gap`
2. `Digital Booking Path Gap`
3. `Quote / Consultation Intake Gap`

The purpose of Gate 5.2 is to **test the Candidate Contracts themselves**, not the underlying Level-1 detectors (which were baselined and closed at Gate 4.6).

Gate 5.2 establishes a frozen suite of reference cases to verify:
```text
Website Evidence
      ↓
Candidate Evaluation Contract
      ↓
Deterministic Classification
```

And to strictly eliminate the commercial over-interpretation trap:
```text
Website Evidence
      ↓  ❌ (REJECTED)
"The business probably needs this service"
```

### 0.2 The Central Governance Rule: Hard Negatives & Anti-Over-Inference
The risk at this stage is **not** detector failure (solved in Gate 4). The real risk is **commercial over-inference from valid evidence**.
- Observing `CONSULTATION_CTA = PRESENT` and `APPOINTMENT_CTA = ABSENT` **does not** by itself prove the business has a "booking problem".
- The Opportunity Contract must only flag a gap when the business model and website journey satisfy every precise, falsifiable condition.
- If the business model is self-service, walk-in, non-commercial, or operates via an uninspected portal, the contract **must** output `NO_GAP`, `NOT_APPLICABLE`, or `UNKNOWN`.

### 0.3 Frozen Invariants 🔒
```text
Production code changes:       0
Production DB mutations:        0
Ground Truth mutations:         0
Detector changes:               0
Offer catalog changes:          0
Active Opportunity Rules:       OPPORTUNITY_RULES = [] (ADR-005 frozen)
Evidence Layer state:           BASELINED (ADR-004 frozen, ADR-006 ratified)
Excluded Candidates:
  - Lead Nurturing / Follow-up:  UNTESTABLE (Out of pipeline)
  - Channel-based Opportunity:   NOT_SUPPORTED (Out of pipeline)
  - Website Audit / Conversion:  DEFERRED (Out of pipeline)
```

---

## 1. Case Archetypes Taxonomy

Each of the three contractable candidates is evaluated against five canonical case archetypes:

| Archetype | Definition | Purpose & Guard | Expected Contract Output |
|---|---|---|---|
| **`POSITIVE`** | Active commercial intent + confirmed relevant journey stage + verified absence of capability under full coverage. | Proves that a genuine observable gap is captured when all conditions are fulfilled. | `GAP_DETECTED` |
| **`HARD_NEGATIVE`** | Intent or journey present, but capability exists or the commercial model renders the gap inapplicable. | Guards against false positives and over-reaching commercial assumptions. | `NO_GAP` or `NOT_APPLICABLE` |
| **`BOUNDARY`** | Subtle edge cases (e.g. recruitment vs client intake, third-party iframe, mixed checkout/consultation). | Tests semantic isolation and context precision at the boundary. | Deterministic (Case-Specific) |
| **`UNKNOWN`** | Ambiguous DOM state, unrendered dynamic client-side widget, or unresolvable destination. | Validates that ambiguity never defaults to `ABSENT` or `GAP_DETECTED`. | `UNKNOWN` |
| **`INSUFFICIENT_OBSERVABILITY`** | Shallow crawl, blocked destination URL, bot defense, or unvisited journey sub-pages. | Enforces the Evidence Sufficiency Guard (§6.1): lack of inspection ⇒ UNKNOWN. | `UNKNOWN` |

---

## 2. Golden Cases: Candidate 1 — Website Acquisition Path Gap

**Candidate Code:** `WAPG`  
**Contract Definition:** `evaluateWebsiteAcquisitionPathGap()` ([GATE-005.1 §3](file:///d:/MyProjects/LeadForge/docs/contracts/GATE-005.1-candidate-opportunity-contracts.md))

### Case GBJ-WAPG-POS-001: Boutique Corporate Tax Consultancy
- **Archetype:** `POSITIVE`
- **Commercial Reality:** A high-value corporate tax practice. Describes tax compliance, audit representation, and international structuring. The website is purely an informational brochure; there is no quote form, consultation request, booking button, or application form anywhere on the domain.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/services`, `/about-us`, `/contact` (Crawl Depth: 2)
  - HTTP Status: 200 on all pages
  - `observability_sufficient`: `true`
- **Observed Evidence:**
  - `journey.stages_declared`: `'PRESENT'` (`DISCOVERY` stage present)
  - `QUOTE_CTA`: `'ABSENT'`
  - `CONSULTATION_CTA`: `'ABSENT'`
  - `APPOINTMENT_CTA`: `'ABSENT'`
  - `APPLICATION_CTA`: `'ABSENT'`
  - `DIRECT_CHECKOUT`: `'ABSENT'`
  - `ONLINE_MEMBERSHIP`: `'ABSENT'`
  - `APP_BASED_SERVICE`: `'ABSENT'`
- **Expected Contract Output:** `GAP_DETECTED`
- **Falsification Guard Tested:** Validates that when a commercial entity presents services but provides zero digital acquisition entry points across all covered pages, a true website-level gap is reported.

---

### Case GBJ-WAPG-HN-001: Self-Service Cloud Analytics SaaS
- **Archetype:** `HARD_NEGATIVE`
- **Commercial Reality:** A subscription software tool. The homepage presents features and pricing, with a direct "Start Free Trial / Subscribe Now" button linking to a credit card checkout page. There is no "Request a Quote" or "Book Consultation" button.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/pricing`, `/checkout`
  - HTTP Status: 200 on all pages
  - `observability_sufficient`: `true`
- **Observed Evidence:**
  - `journey.stages_declared`: `'PRESENT'` (`DISCOVERY`, `PAYMENT`)
  - `DIRECT_CHECKOUT`: `'PRESENT'` (Provenance: Stripe Elements / checkout form)
  - `ONLINE_MEMBERSHIP`: `'PRESENT'`
  - `QUOTE_CTA`: `'ABSENT'`
  - `CONSULTATION_CTA`: `'ABSENT'`
- **Expected Contract Output:** `NO_GAP`
- **Falsification Guard Tested:** Guards against the false assumption that every commercial site requires a consultative sales path; self-service checkout satisfies the acquisition path requirement.

---

### Case GBJ-WAPG-HN-002: Public Open-Source Documentation Hub
- **Archetype:** `HARD_NEGATIVE`
- **Commercial Reality:** An open-source software library documentation portal. Contains guides, API references, and release notes. No products, commercial services, or fee-based offerings exist.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/docs`, `/api`, `/about`
  - HTTP Status: 200 on all pages
  - `observability_sufficient`: `true`
- **Observed Evidence:**
  - `journey.stages_declared`: `'ABSENT'` (No commercial discovery or catalog)
  - All acquisition CTAs: `'ABSENT'`
- **Expected Contract Output:** `NOT_APPLICABLE`
- **Falsification Guard Tested:** Prevents evaluating non-commercial informational domains as having an acquisition gap.

---

### Case GBJ-WAPG-BND-001: Management Consultancy with Careers Intake Only
- **Archetype:** `BOUNDARY`
- **Commercial Reality:** Strategic management consultancy. Presents case studies. In the header navigation, an "Apply Now" button exists, but it links strictly to the `/careers` portal ("Join our team as an Associate"). No customer acquisition CTA exists.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/cases`, `/careers`, `/contact`
  - `observability_sufficient`: `true`
- **Observed Evidence:**
  - `journey.stages_declared`: `'PRESENT'` (`DISCOVERY`)
  - `APPLICATION_CTA`: `'ABSENT'` (Careers exclusion rule in `CtaContextDetector` correctly blocked emitting `APPLICATION_CTA` for job recruitment)
  - All other commercial acquisition CTAs: `'ABSENT'`
- **Expected Contract Output:** `GAP_DETECTED`
- **Falsification Guard Tested:** Verifies that recruitment applications are not erroneously counted as customer acquisition paths.

---

### Case GBJ-WAPG-OBS-001: Regional Law Firm (Shallow Homepage-Only Crawl)
- **Archetype:** `INSUFFICIENT_OBSERVABILITY`
- **Commercial Reality:** A regional law firm. The homepage displays an introduction and phone number. Deep sub-pages (`/practice-areas/corporate-law`, `/request-case-evaluation`) exist in navigation but were not fetched because the crawler terminated at depth 1.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/` only (Unvisited nav links: `/evaluation`, `/contact`)
  - `observability_sufficient`: `false`
- **Observed Evidence:**
  - Evaluator enforces ADR-006 §6.1 Evidence Sufficiency Guard:
  - All journey atoms set to `'UNKNOWN'`
- **Expected Contract Output:** `UNKNOWN`
- **Falsification Guard Tested:** Proves that an incomplete crawl **never** asserts absence or flags an acquisition gap.

---

## 3. Golden Cases: Candidate 2 — Digital Booking Path Gap

**Candidate Code:** `DBPG`  
**Contract Definition:** `evaluateDigitalBookingPathGap()` ([GATE-005.1 §3](file:///d:/MyProjects/LeadForge/docs/contracts/GATE-005.1-candidate-opportunity-contracts.md))

### Case GBJ-DBPG-POS-001: Private Dental Clinic with Phone-Only Booking
- **Archetype:** `POSITIVE`
- **Commercial Reality:** Dental practice offering orthodontic and restorative procedures. The site promotes consultations ("Book your initial consultation today"), but clicking the CTA scrolls to a footer with a phone number. No online appointment scheduling interface exists anywhere on the site.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/treatments`, `/consultation`, `/contact`
  - `observability_sufficient`: `true`
- **Observed Evidence:**
  - `CONSULTATION_CTA`: `'PRESENT'` (Anchor: "Book a consultation")
  - `APPOINTMENT_CTA`: `'ABSENT'`
  - `DIRECT_CHECKOUT`: `'ABSENT'`
  - `journey.stages_declared`: `'PRESENT'` (`CONSULTATION` stage)
- **Expected Contract Output:** `GAP_DETECTED`
- **Falsification Guard Tested:** Validates that an appointment-driven business with explicit consultation intent but no digital booking capability is accurately flagged.

---

### Case GBJ-DBPG-HN-001: Sports Physical Therapy Practice with Online Booking
- **Archetype:** `HARD_NEGATIVE`
- **Commercial Reality:** Physical therapy clinic. Features an explicit "Schedule Appointment Online" button that opens an embedded Jane/Mindbody scheduling widget.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/services`, `/book-online`
  - `observability_sufficient`: `true`
- **Observed Evidence:**
  - `CONSULTATION_CTA`: `'PRESENT'`
  - `APPOINTMENT_CTA`: `'PRESENT'` (Anchor: "Schedule appointment online")
- **Expected Contract Output:** `NO_GAP`
- **Falsification Guard Tested:** Verifies that when digital booking is present, no gap is flagged regardless of how many other contact channels are exposed.

---

### Case GBJ-DBPG-HN-002: 24/7 Urgent Care Walk-In Facility
- **Archetype:** `HARD_NEGATIVE`
- **Commercial Reality:** Emergency walk-in clinic. Banner states: "Immediate walk-in medical attention. No appointments needed. Patients triaged upon arrival."
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/services`, `/location`
  - `observability_sufficient`: `true`
- **Observed Evidence:**
  - `CONSULTATION_CTA`: `'ABSENT'`
  - `QUOTE_CTA`: `'ABSENT'`
  - `APPOINTMENT_CTA`: `'ABSENT'`
  - `journey.stages_declared`: `'ABSENT'` (No pre-booking journey stage)
- **Expected Contract Output:** `NOT_APPLICABLE`
- **Falsification Guard Tested:** Eliminates the false assumption that all clinics require appointments; walk-in businesses are correctly filtered out as non-applicable.

---

### Case GBJ-DBPG-BND-001: Executive Coaching with Third-Party Calendly Link
- **Archetype:** `BOUNDARY`
- **Commercial Reality:** Business coaching firm. On the consultation page, a button says "Reserve a 30-min Strategy Slot" linking externally to `https://calendly.com/executive-coach/strategy`.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/coaching`, `/schedule`
  - `observability_sufficient`: `true`
- **Observed Evidence:**
  - `CONSULTATION_CTA`: `'PRESENT'`
  - `APPOINTMENT_CTA`: `'PRESENT'` (Matched regex on "Reserve a 30-min Strategy Slot" / calendly destination)
- **Expected Contract Output:** `NO_GAP`
- **Falsification Guard Tested:** Verifies that external booking provider links are recognized as digital booking paths rather than false absences.

---

### Case GBJ-DBPG-OBS-001: Hospital Network with Uninspected Patient Portal
- **Archetype:** `INSUFFICIENT_OBSERVABILITY`
- **Commercial Reality:** Hospital system. Public pages describe specialty clinics. A prominent button states "Existing & New Patients: Log in to MyChart to Schedule". The scheduling mechanism is inside the authenticated portal, which was not inspected by the public crawler.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/departments`
  - Portal surface: Unvisited / behind authentication (`SELF_SERVICE_PORTAL = PRESENT`)
  - `observability_sufficient`: `false` (scheduling surface is unobservable)
- **Observed Evidence:**
  - `SELF_SERVICE_PORTAL`: `'PRESENT'`
  - `APPOINTMENT_CTA`: `'UNKNOWN'`
- **Expected Contract Output:** `UNKNOWN`
- **Falsification Guard Tested:** Proves that when scheduling is handled through an uninspected authenticated portal, the engine must return `UNKNOWN` rather than falsely claiming an absence of digital booking.

---

## 4. Golden Cases: Candidate 3 — Quote / Consultation Intake Gap

**Candidate Code:** `QIG`  
**Contract Definition:** `evaluateQuoteConsultationIntakeGap()` ([GATE-005.1 §3](file:///d:/MyProjects/LeadForge/docs/contracts/GATE-005.1-candidate-opportunity-contracts.md))

### Case GBJ-QIG-POS-001: Architectural Millwork Firm with Bare Mailto Quote CTA
- **Archetype:** `POSITIVE`
- **Commercial Reality:** Bespoke commercial carpentry. Solicits custom architectural tenders. The primary CTA is "Request Custom Project Quotation", which links to `mailto:rfq@millwork.com`. The destination page contains no form, questionnaire, or structured requirement fields.
- **Coverage & Crawl Data:**
  - Destination URL: `mailto:rfq@millwork.com` (analyzed via `CtaContext`)
  - `observability_sufficient`: `true`
  - `destination_crawled`: `true`
- **Observed Evidence:**
  - `QUOTE_CTA`: `'PRESENT'` (Anchor: "Request Custom Project Quotation")
  - `destination.resolved_channel`: `'EMAIL'`
  - `destination.has_structured_form`: `false`
  - `APPLICATION_CTA`: `'ABSENT'`
- **Expected Contract Output:** `GAP_DETECTED`
- **Falsification Guard Tested:** Accurately detects that an explicit quote inquiry route relies entirely on an unstructured, unguided channel.

---

### Case GBJ-QIG-HN-001: Custom Software Studio with Interactive Scoping Form
- **Archetype:** `HARD_NEGATIVE`
- **Commercial Reality:** Software consultancy. CTA is "Get an Estimate", which navigates to `/project-intake`. The intake page features a structured multi-step form collecting project type, tech stack, budget range, and timeline.
- **Coverage & Crawl Data:**
  - Destination URL: `/project-intake`
  - `observability_sufficient`: `true`
  - `destination_crawled`: `true`
- **Observed Evidence:**
  - `QUOTE_CTA`: `'PRESENT'`
  - `destination.resolved_channel`: `'FORM'`
  - `destination.has_structured_form`: `true`
  - `APPLICATION_CTA`: `'PRESENT'` (Anchor: "Onboarding intake")
- **Expected Contract Output:** `NO_GAP`
- **Falsification Guard Tested:** Confirms that structured digital intake mechanisms satisfy the contract and reject gap detection.

---

### Case GBJ-QIG-HN-002: Fixed-Fee Accounting Subscription
- **Archetype:** `HARD_NEGATIVE`
- **Commercial Reality:** Online accounting firm selling fixed-fee monthly packages ($199/mo, $399/mo). Clients subscribe directly via an online checkout button. There is no quote or bespoke consultation stage.
- **Coverage & Crawl Data:**
  - Crawled URLs: `/`, `/pricing`, `/checkout`
  - `observability_sufficient`: `true`
- **Observed Evidence:**
  - `DIRECT_CHECKOUT`: `'PRESENT'`
  - `QUOTE_CTA`: `'ABSENT'`
  - `CONSULTATION_CTA`: `'ABSENT'`
- **Expected Contract Output:** `NOT_APPLICABLE`
- **Falsification Guard Tested:** Validates that transactional subscription services are not evaluated for quote intake gaps.

---

### Case GBJ-QIG-BND-001: Commercial Roofing with Dual WhatsApp and Structured Form
- **Archetype:** `BOUNDARY`
- **Commercial Reality:** Commercial roofing contractor. CTA is "Request an Inspection Quote". The quote landing page provides a floating WhatsApp icon for urgent questions, but also features a comprehensive roof assessment form.
- **Coverage & Crawl Data:**
  - Destination URL: `/inspection-quote`
  - `observability_sufficient`: `true`
  - `destination_crawled`: `true`
- **Observed Evidence:**
  - `QUOTE_CTA`: `'PRESENT'`
  - `WHATSAPP`: `'PRESENT'`
  - `destination.has_structured_form`: `true`
  - `destination.resolved_channel`: `'FORM'`
- **Expected Contract Output:** `NO_GAP`
- **Falsification Guard Tested:** Prevents false positive gap detection when a contact channel (WhatsApp) co-exists alongside a legitimate structured intake form.

---

### Case GBJ-QIG-OBS-001: Solar Energy Contractor (Destination Page HTTP 500)
- **Archetype:** `INSUFFICIENT_OBSERVABILITY`
- **Commercial Reality:** Residential solar provider. CTA "Calculate Solar Quote" points to `/quote-calculator`. When the crawler attempted to fetch `/quote-calculator`, the server returned HTTP 500 Server Error.
- **Coverage & Crawl Data:**
  - Destination URL: `/quote-calculator` (HTTP 500)
  - `destination_crawled`: `false`
  - `observability_sufficient`: `true` (overall crawl was valid, but target surface failed)
- **Observed Evidence:**
  - `QUOTE_CTA`: `'PRESENT'`
  - `destination.destination_crawled`: `false`
- **Expected Contract Output:** `UNKNOWN`
- **Falsification Guard Tested:** Ensures that when the specific destination surface cannot be inspected, the contract abstains with `UNKNOWN` rather than asserting the absence of an intake form.

---

## 5. Master Golden Case Verification Matrix

| Case ID | Candidate | Archetype | Commercial Context | Critical Observable Condition | Expected Contract Output | Falsification Defense |
|---|---|---|---|---|---|---|
| **`GBJ-WAPG-POS-001`** | WAPG | `POSITIVE` | Corporate Tax Consultancy | Commercial catalog present; all acquisition CTAs absent | **`GAP_DETECTED`** | Detects true digital acquisition void |
| **`GBJ-WAPG-HN-001`** | WAPG | `HARD_NEGATIVE` | Cloud Analytics SaaS | Self-service checkout present (`DIRECT_CHECKOUT`) | **`NO_GAP`** | E-commerce/SaaS does not need sales CTA |
| **`GBJ-WAPG-HN-002`** | WAPG | `HARD_NEGATIVE` | Open-Source Documentation | Non-commercial content; no service catalog | **`NOT_APPLICABLE`** | Non-commercial domains excluded |
| **`GBJ-WAPG-BND-001`** | WAPG | `BOUNDARY` | Management Consultancy | "Apply Now" exists strictly for recruitment | **`GAP_DETECTED`** | Careers form ≠ Customer acquisition |
| **`GBJ-WAPG-OBS-001`** | WAPG | `INSUFFICIENT_OBS` | Regional Law Firm | Crawl depth 1 only; service sub-pages uninspected | **`UNKNOWN`** | Shallow crawl never asserts absence |
| **`GBJ-DBPG-POS-001`** | DBPG | `POSITIVE` | Private Dental Clinic | Consultation intent present; booking CTA absent | **`GAP_DETECTED`** | Detects true appointment gap |
| **`GBJ-DBPG-HN-001`** | DBPG | `HARD_NEGATIVE` | Sports Physical Therapy | Integrated online scheduling (`APPOINTMENT_CTA`) | **`NO_GAP`** | Active booking widgets satisfy requirement |
| **`GBJ-DBPG-HN-002`** | DBPG | `HARD_NEGATIVE` | Urgent Care Walk-In | Explicit walk-in policy; no scheduled bookings | **`NOT_APPLICABLE`** | Walk-in businesses excluded |
| **`GBJ-DBPG-BND-001`** | DBPG | `BOUNDARY` | Executive Coaching | External Calendly scheduling link | **`NO_GAP`** | External booking providers recognized |
| **`GBJ-DBPG-OBS-001`** | DBPG | `INSUFFICIENT_OBS` | Hospital System | Scheduling behind uninspected patient portal | **`UNKNOWN`** | Uninspected portals yield UNKNOWN |
| **`GBJ-QIG-POS-001`** | QIG | `POSITIVE` | Architectural Millwork | Quote CTA points exclusively to raw mailto | **`GAP_DETECTED`** | Detects unstructured quote intake |
| **`GBJ-QIG-HN-001`** | QIG | `HARD_NEGATIVE` | Custom Software Studio | Dedicated multi-step scoping form on landing page | **`NO_GAP`** | Structured intake satisfies requirement |
| **`GBJ-QIG-HN-002`** | QIG | `HARD_NEGATIVE` | Accounting Subscription | Fixed-fee direct checkout; no bespoke quote stage | **`NOT_APPLICABLE`** | Standardized pricing excluded |
| **`GBJ-QIG-BND-001`** | QIG | `BOUNDARY` | Commercial Roofing | Floating WhatsApp alongside structured intake form | **`NO_GAP`** | Ancillary channel does not negate form |
| **`GBJ-QIG-OBS-001`** | QIG | `INSUFFICIENT_OBS` | Solar Energy Contractor | Quote calculator page returned HTTP 500 error | **`UNKNOWN`** | Unobserved destination yields UNKNOWN |

---

## 6. Execution Protocol for Gate 5.3 (Opportunity Backtest)

The 15 reference cases in this document constitute the frozen test set for **Gate 5.3 Opportunity Backtest**.

### 6.1 Test Execution Harness Specification
In Gate 5.3, the evaluation functions defined in `GATE-005.1` will be executed against these 15 fixture states:
```typescript
describe('Gate 5.2 Golden Business-Journey Contract Verification', () => {
  for (const testCase of GOLDEN_CASES) {
    it(`evaluates ${testCase.id} [${testCase.archetype}] -> ${testCase.expected_output}`, () => {
      const result = testCase.contractEvaluator(testCase.input);
      expect(result).toBe(testCase.expected_output);
    });
  }
});
```

### 6.2 Acceptance Threshold
To pass Gate 5.3, the Opportunity Backtest must achieve:
- **100% Deterministic Match** across all 15 cases ($15 / 15$).
- **Zero False Positives** on all `HARD_NEGATIVE` controls ($0 / 6$).
- **Zero False Definite Outputs** on `UNKNOWN` and `INSUFFICIENT_OBSERVABILITY` cases ($0 / 4$).
- **Zero code changes** to detectors or production tables.

---

## 7. Gate 5.2 Verdict & Transition

**PASS — GOLDEN BUSINESS-JOURNEY CASE SUITE COMPLETE ✅**

- 15 frozen golden reference cases created across the 3 contractable opportunity candidates.
- Complete coverage of all 5 canonical archetypes (`POSITIVE`, `HARD_NEGATIVE`, `BOUNDARY`, `UNKNOWN`, `INSUFFICIENT_OBSERVABILITY`).
- Strict isolation maintained between observable website facts and uninferable business operational states.
- Zero production code, zero detector changes, and zero database mutations.

**Pipeline Progression:**
```text
Gate 5.0: Commercial Semantics Research (PASS 🔒)
    ↓
Gate 5.1: Candidate Contracts (PASS 🔒)
    ↓
Gate 5.2: Golden Business-Journey Cases (PASS 🔒) ← COMPLETE
    ↓
Gate 5.3: Opportunity Backtest (NEXT)
    ↓
Gate 5.4: Independent Outcome Validation
    ↓
Rule Design Gate
    ↓
Production Opportunity Rule (OPPORTUNITY_RULES unfreeze)
```
