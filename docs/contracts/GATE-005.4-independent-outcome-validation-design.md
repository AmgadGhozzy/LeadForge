# LeadForge — Gate 5.4 Independent Outcome Validation Design & Pilot Protocol

**Gate:** 5.4  
**Title:** Independent Outcome Validation Design & Pilot Protocol  
**Mode:** READ-ONLY / DESIGN-ONLY  
**Status:** DRAFT / PROTOCOL SPECIFICATION COMPLETE 🔒  
**Date:** 2026-09-23  
**Parent Gates:** `GATE-005.0` (Semantics), `GATE-005.1` (Contracts), `GATE-005.2` (Golden Cases), `GATE-005.3` (Backtest)  
**Parent Contracts:** `ADR-005` (`OPPORTUNITY_RULES = []`), `ADR-006`  

---

## 0. Scope, Purpose, and Frozen Preconditions

### 0.1 Purpose of Gate 5.4
In Gates 5.1 through 5.3, we proved that the three candidate contracts (`WAPG`, `DBPG`, `QIG`) can be evaluated deterministically and repeatably from observable Website Evidence.

Now, for the first time, the core question fundamentally shifts:
```text
Gates 5.1 - 5.3: "Does the website evidence satisfy the candidate contract?"
                          ↓
Gate 5.4:        "When the contract detects a candidate gap, does an independent
                  real-world business state confirm that the commercial opportunity exists?"
```

This gate establishes the **Design and Pilot Protocol** for validating candidates against **Independent Ground Truth**.

### 0.2 Forbidden Validation Practices (Strict Anti-Patterns) ❌
To prevent circular reasoning, false validation, and subjective bias, Gate 5.4 strictly prohibits:
- ❌ **Detector Output as Ground Truth:** Using the detector's score or presence/absence output to justify validity.
- ❌ **LLM Classification / Hallucination:** Asking an LLM if a company "needs" or "could benefit from" the service.
- ❌ **Website-Only Re-inspection:** Re-reading the same website content to validate a business-level claim.
- ❌ **Sales Intuition / Wishful Thinking:** Stating "it's obvious this dental clinic loses appointments" without operational verification.
- ❌ **Label Retrofitting:** Modifying reference labels post-hoc to force high precision.
- ❌ **Database Writes / Mutation:** Zero writes to production tables (`Δ = 0`).

### 0.3 The Golden Architectural Invariant 🔒
```text
Frozen Website Evidence + Candidate Hypothesis
                     ↓
Independent Operational Business-State Verification (Blind)
                     ↓
        CONFIRMED | NOT_CONFIRMED | UNABLE_TO_VERIFY
```

---

## 1. Independent Ground Truth Criteria per Candidate

For each candidate, an independent outcome requires verification sources outside the website.

### 1.1 Candidate 1: Website Acquisition Path Gap (`WAPG`)
- **Website Observable Gap:** Commercial offerings described, but zero digital acquisition CTAs across covered pages.
- **Underlying Commercial Hypothesis:** The business intends to acquire clients digitally and would benefit from an inbound digital acquisition channel.
- **Independent Verification Questions:**
  1. Does the business actively seek customer acquisition via digital/inbound channels?
  2. Is the lack of a website acquisition path deliberate (e.g. exclusive referral network, closed enterprise RFP, government tender only)?
  3. If presented with inbound digital inquiries, does the business have the capacity and operational intent to service them?
- **Independent Evidence Sources:**
  - Direct business inquiry / executive interview (blinded).
  - Commercial registry & licensing scope.
  - Active paid digital ad campaigns (e.g. Google Ads, Meta Ads) driving traffic to non-website landers (proving active digital acquisition spend).
- **Classification Rules:**
  - `CONFIRMED`: Business actively seeks client acquisition, relies currently on unguided walk-in/phone, and confirms commercial desire for digital lead intake.
  - `NOT_CONFIRMED`: Business is referral-only, captive/in-house provider, at maximum capacity, or deliberately avoids public lead acquisition.
  - `UNABLE_TO_VERIFY`: Business non-responsive or operating status indeterminate.

---

### 1.2 Candidate 2: Digital Booking Path Gap (`DBPG`)
- **Website Observable Gap:** Pre-booking consultation intent present (`CONSULTATION_CTA`), but online scheduling action is `ABSENT`.
- **Underlying Commercial Hypothesis:** The business operates on scheduled appointments and experiences friction/bottlenecks in manual scheduling.
- **Independent Verification Questions:**
  1. Does the business actually operate an appointment-based service model?
  2. What is the current operational mechanism for booking appointments (phone call, front-desk register, WhatsApp chat)?
  3. Does manual booking create verifiable friction (missed booking calls during off-hours, staff scheduling overhead)?
- **Independent Evidence Sources:**
  - Mystery shopper / simulated booking inquiry via phone or WhatsApp.
  - Verification of operating hours vs. inquiry response windows.
  - Confirmation of appointment scheduling workflow by front-desk or practice manager.
- **Classification Rules:**
  - `CONFIRMED`: Appointments are mandatory, currently scheduled manually via phone/desk, and off-hours scheduling is unavailable.
  - `NOT_CONFIRMED`: Walk-in only, emergency triage, or client already uses an unlisted automated portal or app.
  - `UNABLE_TO_VERIFY`: Clinic unreachable or workflow unverified.

---

### 1.3 Candidate 3: Quote / Consultation Intake Gap (`QIG`)
- **Website Observable Gap:** Quote/consultation CTA routes prospect exclusively to raw phone/mailto/unstructured WhatsApp.
- **Underlying Commercial Hypothesis:** The business quotes bespoke jobs and spends manual staff time gathering missing requirements from unstructured inquiries.
- **Independent Verification Questions:**
  1. Does the business require specific project parameters (scope, specifications, budget) before providing a quote?
  2. How are quote requests currently processed upon receiving an email or call?
  3. Do staff manually follow up with a standard qualification questionnaire?
- **Independent Evidence Sources:**
  - Blind RFQ submission (requesting a quote via the listed unstructured channel and recording the qualification response).
  - Business operational audit of quote qualification process.
- **Classification Rules:**
  - `CONFIRMED`: Business requires qualification parameters and manually emails/calls prospects to gather the same standardized fields that an intake form would capture.
  - `NOT_CONFIRMED`: Fixed standardized pricing, immediate phone quoting without qualification, or quotes not accepted.
  - `UNABLE_TO_VERIFY`: RFQ unanswered or business non-responsive.

---

## 2. Blind Adjudication Protocol

To guarantee scientific objectivity:
1. **Blind Verifier:** The human verifier collecting business operational truth must **not** have access to:
   - The detector's scores or atom records.
   - The Candidate Contract evaluation output (`SUPPORTED` vs `NOT_SUPPORTED`).
   - Any LLM summaries or recommendations.
2. **Standardized Questionnaire:** The verifier fills out an objective operational rubric:
   ```text
   Q1: Does the business sell services requiring appointments? [YES / NO / UNKNOWN]
   Q2: What is the primary booking method? [DIGITAL_SELF_SERVE / PHONE / WALK_IN]
   Q3: Are bookings accepted 24/7? [YES / NO]
   Q4: Does the business qualify leads prior to quote? [YES / NO]
   Q5: Does the business seek new client acquisition? [YES / NO / AT_CAPACITY]
   ```
3. **Automated Adjudication Mapping:** Once the operational rubric is submitted, a deterministic script maps the rubric answers to `CONFIRMED` / `NOT_CONFIRMED` / `UNABLE_TO_VERIFY`.

---

## 3. Stratified Pilot Cohort Design ($N = 12$)

Before evaluating all 46 targets, Gate 5.4 mandates an initial **Frozen Pilot Cohort of 12 targets** to validate the outcome protocol.

The pilot cohort must be stratified across all three candidates and include both positive candidates and negative controls:

| Pilot Target ID | Target Business Name | Primary Candidate Tested | Contract Output (Gate 5.3) | Stratum Role | Expected Independent Focus |
|---|---|---|---|---|---|
| **`PILOT-01`** | Elite Dental Care | `DBPG` | `SUPPORTED` | Positive Candidate | Verify if phone-only appointments cause off-hours booking loss. |
| **`PILOT-02`** | Dr. Michael Orthodontics | `DBPG` | `SUPPORTED` | Positive Candidate | Audit practice management booking workflow. |
| **`PILOT-03`** | Sports Physical Therapy | `DBPG` | `NOT_SUPPORTED` | Negative Control | Verify that integrated Jane app handles all scheduling. |
| **`PILOT-04`** | Urgent Care Walk-In Center | `DBPG` | `NOT_SUPPORTED` | Negative Control | Verify that walk-in triage does not utilize appointments. |
| **`PILOT-05`** | Custom Architectural Millwork | `QIG` | `SUPPORTED` | Positive Candidate | Audit RFQ intake via bare mailto link. |
| **`PILOT-06`** | Precision Engineering Works | `QIG` | `SUPPORTED` | Positive Candidate | Test RFQ follow-up response for missing technical specs. |
| **`PILOT-07`** | Custom Software Studio | `QIG` | `NOT_SUPPORTED` | Negative Control | Verify that multi-step intake questionnaire qualifies leads. |
| **`PILOT-08`** | Fixed-Fee Accounting | `QIG` | `NOT_SUPPORTED` | Negative Control | Confirm that fixed-fee checkout bypasses bespoke quotes. |
| **`PILOT-09`** | Boutique Corporate Tax Advisory| `WAPG` | `SUPPORTED` | Positive Candidate | Test if firm intentionally restricts acquisition to referrals. |
| **`PILOT-10`** | Regional Management Consulting| `WAPG` | `SUPPORTED` | Positive Candidate | Verify commercial appetite for digital inbound leads. |
| **`PILOT-11`** | Yelo Car Rental | `WAPG` | `SUPPORTED` | Hard Negative Control | Verify that mobile app & counter bookings negate website gap. |
| **`PILOT-12`** | Cloud Analytics Platform | `WAPG` | `NOT_SUPPORTED` | Negative Control | Confirm self-service subscription model. |

---

## 4. Predeclared Decision Metrics & Acceptance Gates

For each candidate, once the 12-target pilot is adjudicated, calculate:

$$\text{Confirmation Rate} = \frac{\text{CONFIRMED}}{\text{CONFIRMED} + \text{NOT\_CONFIRMED}}$$

$$\text{False Discovery Rate (FDR)} = \frac{\text{NOT\_CONFIRMED}}{\text{CONFIRMED} + \text{NOT\_CONFIRMED}}$$

### Gate 5.4 Acceptance Thresholds for Rule Eligibility:
1. **Specificity on Negative Controls:**
   - Must achieve **100% NOT_CONFIRMED** on known negative controls (e.g. Yelo Car Rental for WAPG, Walk-In clinic for DBPG).
   - If a negative control is marked `CONFIRMED`, the validation rubric is compromised.
2. **Outcome Confirmation Rate:**
   - Candidate must demonstrate $\ge 70\%$ Confirmation Rate among evaluable positive candidates.
   - If Confirmation Rate $< 50\%$, the candidate fails commercial validity and must be `REJECTED` or `REDESIGNED`.
3. **No Retroactive Metric Fitting:**
   - Thresholds cannot be altered after observing the adjudication results.

---

## 5. Candidate Rule Eligibility Criteria

A candidate passes Gate 5.4 and becomes eligible for **Rule Design Gate** if and only if:
1. The candidate contract demonstrated 100% determinism in Gate 5.3.
2. Independent outcome adjudication yields $\ge 70\%$ confirmation without leaking to negative controls.
3. The business condition is proven to be an actionable commercial problem, not an intentional operating posture.

Even upon passing Gate 5.4:
```text
Validated Candidate Hypothesis  ≠  Production Opportunity Rule
```
A formal **Rule Design Gate** is required to define production scoring, confidence intervals, and offer routing before any unfreezing of `ADR-005` (`OPPORTUNITY_RULES = []`).

---

## 6. Gate 5.4 Protocol Verdict & Governance State

**PASS — INDEPENDENT OUTCOME VALIDATION PROTOCOL RATIFIED 🔒**

- Objective, blinded adjudication methodology established.
- Concrete independent operational ground truth criteria defined for `WAPG`, `DBPG`, and `QIG`.
- 12-target stratified pilot cohort designed (including positive candidates and controls).
- Predeclared mathematical acceptance metrics established.
- Zero production mutations: `OPPORTUNITY_RULES = []` preserved.

**Roadmap to Production:**
```text
Gate 5.0: Commercial Semantics Research        PASS 🔒
    ↓
Gate 5.1: Candidate Contracts                  PASS 🔒
    ↓
Gate 5.2: Golden Business-Journey Cases        PASS 🔒
    ↓
Gate 5.3: Opportunity Backtest                 PASS 🔒
    ↓
Gate 5.4: Independent Outcome Validation       PASS (Protocol Designed 🔒)
    ↓
Pilot Execution & Outcome Adjudication
    ↓
Rule Design Gate
    ↓
Production Opportunity Rule (ADR-005 unfreeze)
```
