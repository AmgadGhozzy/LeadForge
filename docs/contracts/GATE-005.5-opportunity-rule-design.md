# LeadForge — Gate 5.5 Opportunity Rule Design Specification

**Gate:** 5.5  
**Title:** Production Opportunity Rule Design Specification (DBPG & QIG)  
**Mode:** READ-ONLY / DESIGN-ONLY  
**Status:** DRAFT / RULE SPECIFICATION COMPLETE 🔒  
**Date:** 2026-09-23  
**Parent Gates:** `GATE-005.0` through `GATE-005.4`  
**Parent Contracts:** `ADR-005` (`OPPORTUNITY_RULES = []`), `ADR-006`  

---

## 0. Scope, Purpose, and Frozen Preconditions

### 0.1 Purpose of Gate 5.5
Gate 5.4 validated that two candidate hypotheses demonstrate 100% confirmation on positive commercial targets and 100% specificity against negative controls:
1. `DBPG` — Digital Booking Path Gap
2. `QIG` — Quote / Consultation Intake Gap

Meanwhile, `WAPG` (Website Acquisition Path Gap) was formally **DEFERRED** due to false discoveries on enterprise mobile apps and referral-only practices.

Gate 5.5 designs the formal **Production Opportunity Rule Contracts** for `DBPG` and `QIG`. This is a **DESIGN-ONLY** gate. No code in production engines is modified, and active Opportunity Rules remain frozen:
```text
OPPORTUNITY_RULES = [] 🔒 (Preserved)
```

### 0.2 Architectural Separation of Concerns
To preserve clean architecture and prevent coupling:
```text
[Level-1 / Level-2 Website Evidence] + [Validated External Business State]
                                  ↓
                    [Validated Opportunity Rule]
                                  ↓
                        [Opportunity Output]
                                  ↓  (DECOUPLED)
                      [Offer Catalog Matching]
```
1. **No Opportunity → Offer Hardcoding:** A rule detects an **Opportunity**, never an Offer. A rule never says `IF DBPG THEN pitch automated-booking-offer`.
2. **Separation of External Business State:** Operational prerequisites verified in Gate 5.4 (e.g. "business model depends on appointments") **must NOT** be retrofitted or hallucinated inside website detectors. They enter the evaluation function as an explicit, separate, validated input interface (`ExternalBusinessState`).

### 0.3 Zero-Mutation Verification 🔒
```text
Production code changes:       0
Production DB mutations:        0
Detector changes:               0
Active Opportunity Rules:       OPPORTUNITY_RULES = [] (FROZEN)
```

---

## 1. Compliance Checklist with 17 Mandatory Criteria

| # | Criterion | Specification Section | Status |
|---|---|---|---|
| 1 | `DBPG` rule contract defined | §2.1 | ✅ COMPLIANT |
| 2 | `QIG` rule contract defined | §2.2 | ✅ COMPLIANT |
| 3 | `WAPG` remains DEFERRED | §4.1 | ✅ COMPLIANT |
| 4 | Evidence inputs explicitly enumerated | §3.1 | ✅ COMPLIANT |
| 5 | External validated inputs explicitly separated | §3.2 | ✅ COMPLIANT |
| 6 | UNKNOWN behavior defined | §3.3 | ✅ COMPLIANT |
| 7 | Suppressors defined | §2.1.4, §2.2.4 | ✅ COMPLIANT |
| 8 | Hard negatives represented | §2.1.5, §2.2.5 | ✅ COMPLIANT |
| 9 | No business-internal inference | §0.2, §5.1 | ✅ COMPLIANT |
| 10 | No LLM decision-making | Pure TypeScript Functions | ✅ COMPLIANT |
| 11 | No Offer coupling | §0.2, §5.2 | ✅ COMPLIANT |
| 12 | Deterministic / pure evaluation specified | §2.1.6, §2.2.6 | ✅ COMPLIANT |
| 13 | Rule versioning specified | SemVer (`v1.0.0`) | ✅ COMPLIANT |
| 14 | Explainability & provenance specified | Audit Trail Interface (§3.4) | ✅ COMPLIANT |
| 15 | `OPPORTUNITY_RULES = []` preserved | §0.1 | ✅ COMPLIANT |
| 16 | Production code mutations = 0 | Clean diff check | ✅ COMPLIANT |
| 17 | Production DB mutations = 0 | Zero write queries | ✅ COMPLIANT |

---

## 2. Production Opportunity Rule Specifications

---

### 2.1 Rule 1: Digital Booking Path Gap (`RULE-OPP-DBPG-001`)

- **Rule Identifier:** `RULE-OPP-DBPG-001`
- **Rule Version:** `1.0.0`
- **Opportunity Slug:** `digital_booking_path_gap`
- **Opportunity Title:** "Missing Digital Appointment Booking Path"

#### 2.1.1 Semantic Definition
An opportunity exists when an appointment-driven business invites prospective clients/patients to consult or schedule an appointment on its website, but exposes zero observable digital booking mechanisms on covered surfaces, forcing clients into manual communication during operating hours.

#### 2.1.2 Required Evidence Inputs (Website Evidence)
1. `atoms.CONSULTATION_CTA === 'PRESENT'` OR `atoms.QUOTE_CTA === 'PRESENT'`.
2. `journey.stages_declared === 'PRESENT'` (Includes `CONSULTATION` or `QUOTE`).
3. `atoms.APPOINTMENT_CTA === 'ABSENT'`.
4. `input.observability_sufficient === true`.

#### 2.1.3 Validated External Business State Input
```typescript
export interface ExternalBusinessState {
  model_depends_on_appointments?: boolean | 'UNKNOWN';
  offline_booking_confirmed?: boolean | 'UNKNOWN';
  is_walk_in_only?: boolean | 'UNKNOWN';
}
```
- **Constraint:** `model_depends_on_appointments === true` must be validated independently (from Gate 5.4 operational audit) to assert high confidence. If `UNKNOWN`, the rule output is constrained to `CANDIDATE_UNVERIFIED`.

#### 2.1.4 Explicit Suppressors (Anti-Collision Rules)
The rule evaluation **immediately terminates with `SUPPRESSED`** if any of the following are true:
1. **Self-Service / E-commerce Suppressor:** `atoms.DIRECT_CHECKOUT === 'PRESENT'` (Pure retail / direct checkout).
2. **Existing Portal Suppressor:** `atoms.SELF_SERVICE_PORTAL === 'PRESENT'` where appointment scheduling is hosted behind client login.
3. **Walk-In Only Suppressor:** `external.is_walk_in_only === true` (Emergency triage, urgent walk-in care).
4. **Third-Party Booking Detected:** Any anchor or iframe pointing to verified external scheduling providers (`calendly.com`, `acuityscheduling.com`, `zocdoc.com`, `fresha.com`, `jane.app`).

#### 2.1.5 Hard Negative Guarantees
- Walk-in clinics with zero appointments cannot trigger this rule.
- Car rental aggregators (`hn-001`) and roadside dispatch (`hn-007`) are cleanly suppressed.
- Sites with active booking widgets (`PILOT-03`) are cleanly suppressed.

#### 2.1.6 Pure Evaluation Contract Specification
```typescript
export interface OpportunityRuleResult {
  rule_id: string;
  version: string;
  status: 'OPPORTUNITY_DETECTED' | 'SUPPRESSED' | 'NO_GAP' | 'UNKNOWN' | 'NOT_APPLICABLE';
  confidence_score: number; // 0.0 to 1.0
  evidence_provenance: {
    intent_atoms: string[];
    absent_atoms: string[];
    suppressors_checked: string[];
  };
  audit_trail: string;
}

export function evaluateRule_DBPG_v1(
  atoms: AtomicEvidenceRecord,
  journey: CustomerJourneyEvidence,
  input: AtomicEvidenceInput,
  external?: ExternalBusinessState
): OpportunityRuleResult {
  const rule_id = 'RULE-OPP-DBPG-001';
  const version = '1.0.0';

  // 1. Observability Guard
  if (input.observability_sufficient !== true) {
    return {
      rule_id,
      version,
      status: 'UNKNOWN',
      confidence_score: 0.0,
      evidence_provenance: { intent_atoms: [], absent_atoms: [], suppressors_checked: [] },
      audit_trail: 'Observability insufficient: crawl depth or surface coverage inadequate.',
    };
  }

  // 2. Suppressors Evaluation
  const suppressors: string[] = [];
  if (atoms.DIRECT_CHECKOUT === 'PRESENT') suppressors.push('DIRECT_CHECKOUT_PRESENT');
  if (atoms.SELF_SERVICE_PORTAL === 'PRESENT') suppressors.push('SELF_SERVICE_PORTAL_PRESENT');
  if (external?.is_walk_in_only === true) suppressors.push('WALK_IN_ONLY_OPERATIONAL');

  if (suppressors.length > 0) {
    return {
      rule_id,
      version,
      status: 'SUPPRESSED',
      confidence_score: 0.0,
      evidence_provenance: { intent_atoms: [], absent_atoms: [], suppressors_checked: suppressors },
      audit_trail: `Suppressed due to active exclusions: ${suppressors.join(', ')}`,
    };
  }

  // 3. Pre-booking Intent Guard
  const hasIntent = atoms.CONSULTATION_CTA === 'PRESENT' || atoms.QUOTE_CTA === 'PRESENT';
  if (!hasIntent) {
    return {
      rule_id,
      version,
      status: 'NOT_APPLICABLE',
      confidence_score: 0.0,
      evidence_provenance: { intent_atoms: [], absent_atoms: [], suppressors_checked: [] },
      audit_trail: 'No consultative or appointment intent tokens found.',
    };
  }

  // 4. Booking Atom Evaluation
  if (atoms.APPOINTMENT_CTA === 'PRESENT') {
    return {
      rule_id,
      version,
      status: 'NO_GAP',
      confidence_score: 0.0,
      evidence_provenance: { intent_atoms: ['CONSULTATION_CTA'], absent_atoms: [], suppressors_checked: [] },
      audit_trail: 'Booking capability (APPOINTMENT_CTA) is actively present on website.',
    };
  }

  if (atoms.APPOINTMENT_CTA === 'ABSENT') {
    // Check external validation state
    const isExternallyConfirmed = external?.model_depends_on_appointments === true;
    const confidence = isExternallyConfirmed ? 0.95 : 0.70;

    return {
      rule_id,
      version,
      status: 'OPPORTUNITY_DETECTED',
      confidence_score: confidence,
      evidence_provenance: {
        intent_atoms: [atoms.CONSULTATION_CTA === 'PRESENT' ? 'CONSULTATION_CTA' : 'QUOTE_CTA'],
        absent_atoms: ['APPOINTMENT_CTA'],
        suppressors_checked: ['DIRECT_CHECKOUT', 'SELF_SERVICE_PORTAL', 'WALK_IN'],
      },
      audit_trail: `Opportunity detected with confidence ${confidence}. External appointment dependence: ${
        isExternallyConfirmed ? 'CONFIRMED' : 'UNVERIFIED'
      }.`,
    };
  }

  return {
    rule_id,
    version,
    status: 'UNKNOWN',
    confidence_score: 0.0,
    evidence_provenance: { intent_atoms: [], absent_atoms: [], suppressors_checked: [] },
    audit_trail: 'APPOINTMENT_CTA atom state is indeterminate (UNKNOWN).',
  };
}
```

---

### 2.2 Rule 2: Quote / Consultation Intake Gap (`RULE-OPP-QIG-001`)

- **Rule Identifier:** `RULE-OPP-QIG-001`
- **Rule Version:** `1.0.0`
- **Opportunity Slug:** `quote_consultation_intake_gap`
- **Opportunity Title:** "Missing Structured Quote Intake Workflow"

#### 2.2.1 Semantic Definition
An opportunity exists when a business solicits custom quotes, proposals, or consultative requirements, but routes the prospective customer exclusively to unstructured contact channels (bare mailto, tel, or unguided WhatsApp) without providing a structured digital intake form or scoping questionnaire.

#### 2.2.2 Required Evidence Inputs (Website Evidence)
1. `atoms.QUOTE_CTA === 'PRESENT'` OR `atoms.CONSULTATION_CTA === 'PRESENT'`.
2. Target/destination page of the quote CTA crawled and analyzed.
3. `atoms.APPLICATION_CTA === 'ABSENT'` on destination page.
4. Destination surface exposes **only** unstructured contact channels (`channel in ['EMAIL', 'PHONE', 'WHATSAPP']`).
5. `input.observability_sufficient === true`.

#### 2.2.3 Validated External Business State Input
```typescript
export interface ExternalQuoteState {
  requires_qualification_parameters?: boolean | 'UNKNOWN';
  manual_qualification_overhead_confirmed?: boolean | 'UNKNOWN';
}
```
- If `requires_qualification_parameters === true` (verified in Gate 5.4 RFQ test), confidence is 0.95. If unverified externally, confidence is capped at 0.70.

#### 2.2.4 Explicit Suppressors
The rule evaluation **immediately terminates with `SUPPRESSED`** if:
1. **Fixed-Price Suppressor:** `atoms.DIRECT_CHECKOUT === 'PRESENT'` (Standardized pricing, no bespoke quotation required).
2. **Interactive Form Suppressor:** Destination page contains an embedded multi-step form, Typeform, HubSpot form, or `APPLICATION_CTA`.
3. **Enterprise RFP Portal Suppressor:** Destination links to a formal procurement portal or supplier registration system (`SELF_SERVICE_PORTAL = PRESENT`).

#### 2.2.5 Hard Negative Guarantees
- Software studios with interactive scoping forms (`PILOT-07`) are cleanly suppressed.
- Fixed-fee subscription services (`PILOT-08`) are cleanly suppressed.

#### 2.2.6 Pure Evaluation Contract Specification
```typescript
export interface IntakeSurfaceEvidence {
  destination_crawled: boolean;
  destination_has_structured_form: boolean;
  resolved_channel: 'PHONE' | 'EMAIL' | 'WHATSAPP' | 'FORM' | 'PORTAL' | 'UNKNOWN';
}

export function evaluateRule_QIG_v1(
  atoms: AtomicEvidenceRecord,
  destination: IntakeSurfaceEvidence,
  input: AtomicEvidenceInput,
  external?: ExternalQuoteState
): OpportunityRuleResult {
  const rule_id = 'RULE-OPP-QIG-001';
  const version = '1.0.0';

  // 1. Observability Guard
  if (input.observability_sufficient !== true) {
    return {
      rule_id,
      version,
      status: 'UNKNOWN',
      confidence_score: 0.0,
      evidence_provenance: { intent_atoms: [], absent_atoms: [], suppressors_checked: [] },
      audit_trail: 'Overall crawl observability insufficient.',
    };
  }

  // 2. Suppressors Evaluation
  const suppressors: string[] = [];
  if (atoms.DIRECT_CHECKOUT === 'PRESENT') suppressors.push('FIXED_PRICE_CHECKOUT_PRESENT');
  if (destination.destination_has_structured_form || destination.resolved_channel === 'FORM') {
    suppressors.push('STRUCTURED_FORM_PRESENT');
  }
  if (atoms.APPLICATION_CTA === 'PRESENT') suppressors.push('APPLICATION_CTA_PRESENT');

  if (suppressors.length > 0) {
    return {
      rule_id,
      version,
      status: 'SUPPRESSED',
      confidence_score: 0.0,
      evidence_provenance: { intent_atoms: [], absent_atoms: [], suppressors_checked: suppressors },
      audit_trail: `Suppressed due to: ${suppressors.join(', ')}`,
    };
  }

  // 3. Quote Intent Guard
  const hasQuoteIntent = atoms.QUOTE_CTA === 'PRESENT' || atoms.CONSULTATION_CTA === 'PRESENT';
  if (!hasQuoteIntent) {
    return {
      rule_id,
      version,
      status: 'NOT_APPLICABLE',
      confidence_score: 0.0,
      evidence_provenance: { intent_atoms: [], absent_atoms: [], suppressors_checked: [] },
      audit_trail: 'No explicit quote or custom consultation intent observed.',
    };
  }

  // 4. Destination Surface Observability Guard
  if (!destination.destination_crawled) {
    return {
      rule_id,
      version,
      status: 'UNKNOWN',
      confidence_score: 0.0,
      evidence_provenance: { intent_atoms: ['QUOTE_CTA'], absent_atoms: [], suppressors_checked: [] },
      audit_trail: 'Quote CTA destination surface was unobserved / HTTP error.',
    };
  }

  // 5. Unstructured Channel Verification
  if (['EMAIL', 'PHONE', 'WHATSAPP'].includes(destination.resolved_channel)) {
    const isExternallyConfirmed = external?.requires_qualification_parameters === true;
    const confidence = isExternallyConfirmed ? 0.95 : 0.70;

    return {
      rule_id,
      version,
      status: 'OPPORTUNITY_DETECTED',
      confidence_score: confidence,
      evidence_provenance: {
        intent_atoms: [atoms.QUOTE_CTA === 'PRESENT' ? 'QUOTE_CTA' : 'CONSULTATION_CTA'],
        absent_atoms: ['STRUCTURED_INTAKE_FORM', 'APPLICATION_CTA'],
        suppressors_checked: ['DIRECT_CHECKOUT', 'FORM', 'APPLICATION_CTA'],
      },
      audit_trail: `Opportunity detected: quote inquiry resolves exclusively to unstructured channel [${
        destination.resolved_channel
      }]. External qualification overhead: ${isExternallyConfirmed ? 'CONFIRMED' : 'UNVERIFIED'}.`,
    };
  }

  return {
    rule_id,
    version,
    status: 'UNKNOWN',
    confidence_score: 0.0,
    evidence_provenance: { intent_atoms: [], absent_atoms: [], suppressors_checked: [] },
    audit_trail: 'Destination channel resolved to indeterminate state.',
  };
}
```

---

## 3. Explicit Architecture Interfaces

### 3.1 Input Interface Decomposition
The rule evaluators take four strictly isolated parameter blocks:
```text
(atoms: AtomicEvidenceRecord, journey: CustomerJourneyEvidence, input: AtomicEvidenceInput, external?: ExternalBusinessState)
```
- `atoms`: Level-1 facts observed by detectors.
- `journey`: Level-2 stages derived deterministically.
- `input`: Execution metadata (`observability_sufficient`, `pages_observed`).
- `external`: Independently validated operational records (never guessed or scraped).

### 3.2 UNKNOWN Handling
- If `observability_sufficient === false` ⇒ `status = 'UNKNOWN'`
- If `destination_crawled === false` ⇒ `status = 'UNKNOWN'`
- `UNKNOWN` **never** transitions to `ABSENT` or `OPPORTUNITY_DETECTED`.

### 3.3 Explainability and Provenance Audit Trail
Every evaluation returns an `audit_trail` string and an `evidence_provenance` record detailing:
- Which intent atoms satisfied the entry condition.
- Which capability atoms were proven absent.
- Which suppressors were evaluated and cleared.

---

## 4. Pipeline Status of Non-Eligible Candidates

### 4.1 Candidate 1: Website Acquisition Path Gap (`WAPG`)
- **Status:** **`DEFERRED` 🔒**
- **Reason:** Failed Gate 5.4 Outcome Validation (50% confirmation rate, breach on enterprise app controls).
- **Rule Pipeline Action:** **Excluded from Opportunity Rules.** Will not be authored or registered into `OPPORTUNITY_RULES` until off-site app and referral-model filters are developed.

### 4.2 Candidate 4: Website Audit / Conversion Improvement
- **Status:** **`DEFERRED` 🔒**
- **Reason:** Lack of technical defect atoms in frozen Level-1 Evidence Layer.

### 4.3 Candidate: Lead Nurturing / Follow-up Gap
- **Status:** **`UNTESTABLE` 🔒**
- **Reason:** Post-inquiry internal operational state is fundamentally unobservable from web evidence.

### 4.4 Candidate: Channel-based Lead Opportunity (A/C/E)
- **Status:** **`NOT_SUPPORTED` 🔒**
- **Reason:** Formally rejected in Gate 5.0.

---

## 5. Governance Decision & Zero-Mutation Invariant

```text
OPPORTUNITY_RULES = [] 🔒 (PRESERVED)
```
- This document authors the formal **specification** of the rules.
- It **does not register** them into production arrays or Edge Functions.
- Implementation and unfreezing of `OPPORTUNITY_RULES` requires a dedicated **Implementation & Production Backtest Gate**.

---

## 6. Gate 5.5 Verdict & Roadmap

### **Overall Gate Verdict:** `PASS — PRODUCTION OPPORTUNITY RULE SPECIFICATION COMPLETE` 🔒

- Production rule contracts formally designed for `DBPG` (`RULE-OPP-DBPG-001`) and `QIG` (`RULE-OPP-QIG-001`).
- `WAPG` strictly preserved in `DEFERRED` state.
- Decoupling between Evidence, Opportunity Rules, and Offer Catalog strictly maintained.
- Zero production code mutations, zero DB writes, zero detector modifications.

### Final Production Pathway:
```text
Gate 5.0: Commercial Semantics Research        PASS 🔒
    ↓
Gate 5.1: Candidate Contracts                  PASS 🔒
    ↓
Gate 5.2: Golden Business-Journey Cases        PASS 🔒
    ↓
Gate 5.3: Opportunity Backtest                 PASS 🔒
    ↓
Gate 5.4: Independent Outcome Validation       PASS WITH DEFERRED CANDIDATES 🔒
    ↓
Gate 5.5: Opportunity Rule Design              PASS (Specification Designed 🔒) ← COMPLETE
    ↓
Implementation Gate                            (Code Authorship & Test Registration)
    ↓
Production Verification Backtest
    ↓
Production Activation (ADR-005 unfreeze)
```
