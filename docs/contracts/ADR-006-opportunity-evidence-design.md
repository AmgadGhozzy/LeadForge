# ADR-006: Opportunity Evidence Design & Commercial Grounding Contract

**Status:** APPROVED WITH AMENDMENTS 🔒  
**Date:** 2026-09-22  
**Parent Decisions:** [`ADR-004`](file:///D:/MyProjects/LeadForge/docs/contracts/ADR-004-evidence-layer-freeze.md), [`ADR-005 Section 10.3`](file:///D:/MyProjects/LeadForge/docs/contracts/ADR-005-opportunity-engine-freeze.md#103-hard-negative-controls-audit-results-hard_negative_control_spec-v1)  
**Scope:** `_shared/intelligence/evidence/types.ts`, `_shared/intelligence/evidence/*`, `_shared/intelligence/opportunities/*`  

---

## 1. Executive Summary & Context

Following the formal execution of [`HARD_NEGATIVE_CONTROL_SPEC v1`](file:///D:/MyProjects/LeadForge/docs/contracts/HARD_NEGATIVE_CONTROL_SPEC_v1.md) against 15 real-world service businesses, all surface-level heuristic rules (**Patterns A, C, and E**) were conclusively broken:
- **Pattern A (`PHONE ∧ ¬BOOKING ∧ ¬CHATBOT`):** Specificity = 63.64% (FP Rate = 36.36%).
- **Pattern C (`WHATSAPP ∧ ¬BOOKING`):** Specificity = 72.73% (FP Rate = 27.27%).
- **Pattern E (`PHONE ∧ EMAIL ∧ ¬BOOKING ∧ ¬CHATBOT`):** Specificity = 72.73% (FP Rate = 27.27%).
- **Combined `ANY(A, C, E)`:** Specificity = 54.55% (**FP Rate = 45.45%**).

This empirical failure demonstrated that surface-level contact heuristics (`has_phone`, `has_email`, `has_whatsapp`) cannot distinguish between an unoptimized service business that genuinely loses leads and an automated digital platform, self-service subscription service, emergency dispatch provider, or regulated institution.

**ADR-006 establishes the foundational Evidence Design Contract required before any new Detectors are coded or any Opportunity Rules are considered for production.**

```
ARCHITECTURAL FLOW:
[HTML Scrape Artifacts] ──> [Level 1: Atomic Evidence] ──> [Level 2: Derived Commercial Signals] ──> [Future: Opportunity Policy]
```

---

## 2. Section 1: Lessons from A/C/E Failure

### 1.1 The Channel-to-Commercial Leap Fallacy
The fatal flaw of Patterns A, C, and E was attempting to leap directly from channel-level observable existence to a commercial operations conclusion:

$$\text{Channel Detection} \not\longrightarrow \text{Operational Opportunity}$$

```
FLAWED APPROACH (Patterns A, C, E):
[Phone / Email / WhatsApp detected] ──> [Assert: Lead Nurturing Opportunity exists] ❌

GROUNDED ARCHITECTURE (ADR-006):
[Website Evidence] ──> [Business Model & Intent] ──> [Customer Journey Stage] ──> [Operational Opportunity] ✅
```

### 1.2 Forensic Failure Modes from Hard Negatives
The forensic audit exposed four distinct failure mechanisms in real commercial service businesses:

1. **Regulatory Disclosures vs. Commercial Intake (`Lendo - hn-006`):**
   - *Observation:* Visible phone and email; no booking or chatbot.
   - *Reality:* 100% digital crowdlending platform under SAMA regulatory sandbox. Phone and email are legal/regulatory compliance disclosures for consumers, not pipeline entry points for outbound sales nurturing.
2. **Emergency Dispatch vs. Nurture Sequences (`Morni - hn-007`):**
   - *Observation:* Visible phone and WhatsApp; no booking or chatbot.
   - *Reality:* On-demand roadside assistance and emergency towing dispatched via mobile app. Emergency needs demand immediate response; delayed email/WhatsApp nurture sequences are commercially absurd.
3. **WhatsApp as Support vs. Acquisition (`PureGym - hn-014` & `Morni - hn-007`):**
   - *Core Finding:* $\text{WhatsApp} \neq \text{Lead Nurturing}$.
   - WhatsApp is frequently deployed for post-sale support, account troubleshooting, physical club inquiries, or operational dispatch, rather than inbound lead qualification.
4. **Standardized Self-Service Subscriptions (`Fitness First - hn-015` & `Hive - hn-016`):**
   - *Observation:* Visible contact info; absence of calendar booking.
   - *Reality:* Memberships and hot desks are purchased directly through self-service digital checkouts. No sales nurturing is required or offered.

### 1.3 The "Absence of Website Feature" Fallacy
Heuristic rules assumed that `BOOKING=ABSENT` proved an operational gap. The audit proved that `ABSENCE OF FEATURE` is inherently ambiguous:
$$\text{NO\_BOOKING observed on website} \Longrightarrow \begin{cases} 
\text{Booking handled via mobile app} \\
\text{Booking handled via direct phone call} \\
\text{Booking handled inside private CRM/portal} \\
\text{Business model does not require booking} \\
\text{Genuine operational gap (only a fraction of cases)}
\end{cases}$$

> [!CRITICAL]
> **Absence of a website feature can NEVER, on its own, serve as sufficient evidence for an operational opportunity.** Opportunity detection requires positive confirmation of business model fit combined with affirmative interaction requirements.

---

## 3. Section 2: Two-Level Evidence Architecture

To prevent premature conclusions disguised as Evidence, ADR-006 strictly separates **Atomic Website Evidence** from **Derived Commercial Signals**.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: ATOMIC WEBSITE EVIDENCE (Directly observed from DOM / Text / URLs) │
│ - Pure factual observations; zero business interpretation.                  │
│ - Each item has: Polarity (PRESENT / ABSENT / UNKNOWN) + Source Anchor Text │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Deterministic Logic Only
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 2: DERIVED COMMERCIAL SIGNALS (Synthesized from Level 1 Atoms)        │
│ - Expresses commercial flow capability; DOES NOT declare Opportunity Fit.   │
│ - Never mutates database; never triggers outbound campaigns.                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Future Validation Gated
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 3: OPPORTUNITY POLICY (Frozen at ZERO_RULES 🔒)                       │
│ - Inactive until Level 1 & 2 pass independent Golden Fixtures.             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Section 3: Evidence Taxonomy & Specifications

### 3.1 Level 1: Atomic Website Evidence

All atoms are evaluated independently. **Transaction signals are NOT an exclusive single-choice enum**; a website may legitimately offer both a consultation and an immediate direct checkout.

| Evidence Atom | Category | Observable Ground Truth Indicator | Polarity Values |
| :--- | :--- | :--- | :---: |
| `DIRECT_CHECKOUT` | Transaction Capability | E-commerce cart, Stripe Elements, Shopify/WooCommerce checkout buttons | `PRESENT \| ABSENT \| UNKNOWN` |
| `QUOTE_CTA` | Interaction Requirement | Explicit buttons/links: "Request a Quote", "Get Pricing", "Submit RFQ" | `PRESENT \| ABSENT \| UNKNOWN` |
| `CONSULTATION_CTA` | Interaction Requirement | Explicit CTAs: "Book Consultation", "Speak with an Advisor", "Free Assessment" | `PRESENT \| ABSENT \| UNKNOWN` |
| `APPOINTMENT_CTA` | Interaction Requirement | Explicit CTAs: "Book Appointment", "Schedule Slot", "Reserve Time" | `PRESENT \| ABSENT \| UNKNOWN` |
| `APPLICATION_CTA` | Interaction Requirement | Multi-step form/intake: "Apply Now", "Submit Application", "Onboarding Intake" | `PRESENT \| ABSENT \| UNKNOWN` |
| `ACQUISITION_CTA` | Conversion Intent | Anchor text intended for new clients ("Start Project", "Become Client") | `PRESENT \| ABSENT \| UNKNOWN` |
| `SUPPORT_CTA` | Conversion Intent | Anchor text intended for existing users ("Help Desk", "Track Order", "Support") | `PRESENT \| ABSENT \| UNKNOWN` |
| `SELF_SERVICE_PORTAL` | Capability | Customer sign-in/portal links ("Customer Portal", "Client Login", "Dashboard") | `PRESENT \| ABSENT \| UNKNOWN` |
| `ONLINE_MEMBERSHIP` | Capability | Recurring plan checkout ("Join Now", "Select Membership Plan", "Subscribe") | `PRESENT \| ABSENT \| UNKNOWN` |
| `APP_BASED_SERVICE` | Capability | Dominant links pointing to `apps.apple.com` or `play.google.com` | `PRESENT \| ABSENT \| UNKNOWN` |

---

### 3.2 First-Class Concept: `CTA_CONTEXT`
A contact channel is meaningless without its surrounding context. Detectors must capture full CTA context:

```typescript
export interface CtaContext {
  channel: 'PHONE' | 'WHATSAPP' | 'EMAIL' | 'FORM' | 'PORTAL' | 'EXTERNAL_LINK';
  cta_label: string;          // e.g. "Request a Quote", "Customer Support", "Talk to Sales"
  surrounding_text: string;   // Nearby container text clarifying purpose
  destination_url?: string;   // e.g. "https://wa.me/...", "mailto:...", "/contact-sales"
  classified_intent: 'ACQUISITION' | 'SUPPORT' | 'REGULATORY_DISCLOSURE' | 'UNKNOWN';
}
```

#### Strict Intent Classification Rules:
- **`WhatsApp + "Contact us for a quote"`** $\longrightarrow$ `classified_intent: ACQUISITION`.
- **`WhatsApp + "Customer support / Help desk"`** $\longrightarrow$ `classified_intent: SUPPORT`.
- **`WhatsApp button with NO contextual text`** $\longrightarrow$ `classified_intent: UNKNOWN` (NEVER default to ACQUISITION).
- **`Phone / Email in legal footer with NO sales CTA`** $\longrightarrow$ `classified_intent: REGULATORY_DISCLOSURE`.

---

### 3.3 Level 2: Derived Commercial Signals

Derived deterministically from Level 1 atoms:

1. **`HAS_ACQUISITION_PATH`**:
   $$\text{QUOTE\_CTA} = \text{PRESENT} \lor \text{CONSULTATION\_CTA} = \text{PRESENT} \lor \text{APPLICATION\_CTA} = \text{PRESENT} \lor \text{ACQUISITION\_CTA} = \text{PRESENT}$$
2. **`HAS_SELF_SERVICE_PATH`**:
   $$\text{DIRECT\_CHECKOUT} = \text{PRESENT} \lor \text{ONLINE\_MEMBERSHIP} = \text{PRESENT} \lor \text{APP\_BASED\_SERVICE} = \text{PRESENT}$$
3. **`REQUIRES_HUMAN_INTERACTION`**:
   $$(\text{QUOTE\_CTA} = \text{PRESENT} \lor \text{CONSULTATION\_CTA} = \text{PRESENT}) \land \text{DIRECT\_CHECKOUT} = \text{ABSENT}$$
4. **`CUSTOMER_JOURNEY_STAGES`**:
   Concrete count and representation of explicitly stated pipeline stages (e.g. `"1. Discovery 2. Proposal 3. Kickoff"` $\longrightarrow$ `stage_count: 3`). Subjective impressions of "complexity" are prohibited.

---

### 3.4 Self-Service Suppressor Semantics (Policy-Specific, Not Universal)

> [!IMPORTANT]
> **Suppressors are policy-specific, NOT universal commercial disqualifiers.**
> 
> The presence of an app (`APP_BASED_SERVICE = PRESENT`) or checkout (`DIRECT_CHECKOUT = PRESENT`) does NOT prove that no commercial relationship or nurturing can ever exist in the universe.
> 
> Rather, a **Suppressor** is evidence that **invalidates specific Opportunity Policy assumptions** (e.g. invalidating the assumption that contact visibility without calendar booking proves an inbound lead qualification gap).

---

## 5. Section 3: Observable vs. Inferred Boundaries & The Golden Rule

> [!CRITICAL]
> ### 🛡️ THE GOLDEN RULE OF LEADFORGE EVIDENCE
> **«إذا احتاجت الـ Evidence إلى معرفة ما يحدث داخل الشركة، فهي ليست Website Evidence.»**  
> *(If an Evidence signal requires knowing what happens inside the company, it is NOT Website Evidence.)*

### Prohibited Inferences vs. Valid Observable Facts

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ STRICTLY PROHIBITED INFERENCES (Violates Architectural Boundaries)         │
├────────────────────────────────────────────────────────────────────────────┤
│ ❌ Guessing whether the company uses Salesforce, HubSpot, or a spreadsheet │
│ ❌ Estimating the company's daily inbound lead volume                      │
│ ❌ Inferring how quickly their sales team replies to inquiries             │
│ ❌ Assuming that lack of a calendar link means no bookings occur           │
│ ❌ Assuming phone visibility means a sales rep is answering calls          │
│ ❌ Classifying business as "B2B Custom" from marketing slogans             │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ STRICTLY VALID OBSERVABLE EVIDENCE (Ground Truth from Scrape Artifacts)    │
├────────────────────────────────────────────────────────────────────────────┤
│ ✅ DOM element containing a form with fields: [Name, Budget, Project Scope]│
│ ✅ Text anchor with explicit string: "Request a custom quotation"          │
│ ✅ Links pointing to apps.apple.com / play.google.com                      │
│ ✅ E-commerce checkout scripts (Shopify, WooCommerce, Stripe Elements)     │
│ ✅ Presence of a customer login / authentication portal link               │
│ ✅ Stated multi-step process list in HTML DOM                              │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Section 4: Tri-State Semantics & Evidence Sufficiency Contract

In accordance with [`ADR-004`](file:///D:/MyProjects/LeadForge/docs/contracts/ADR-004-evidence-layer-freeze.md), all Evidence items strictly adhere to **Tri-State Polarity**:

$$\text{EvidencePolarity} \in \{\text{PRESENT}, \text{ABSENT}, \text{UNKNOWN}\}$$

### 6.1 The Principle of Evidence Sufficiency
> **Absence is ONLY meaningful when the scanner has sufficient observability of the relevant journey surface.**

- Successfully crawling the **Homepage alone** is **NOT** sufficient to assert `DIRECT_CHECKOUT = ABSENT`. The checkout may exist on `/pricing`, `/shop`, `/book`, or `/plans`.
- If `/pricing` or primary navigation links could not be crawled or were blocked, the signal MUST be evaluated as `UNKNOWN`:
$$\text{Relevant Journey Unobserved} \implies \text{EvidencePolarity} = \text{UNKNOWN}$$
- *Strict Rule:* An `UNKNOWN` signal cannot satisfy a positive rule condition, nor can it serve as an absent suppressor.

---

## 7. Section 5: Golden Fixtures Contract (Independent Evidence Validation)

Before any Opportunity Policies are formulated, the **Evidence Layer must be validated independently** against synthetic and captured **Golden Fixtures**.

> [!WARNING]
> **Golden Fixtures MUST NOT be labeled as "Websites that should produce an opportunity."**  
> Golden Fixtures MUST be labeled as **"Websites representing observable Evidence conditions and counterexamples."**

### Golden Fixture Benchmark Suite

| Fixture ID | Archetype Description | Expected Level 1 Evidence Assertions |
| :--- | :--- | :--- |
| `GF-001` | **Quote-driven Custom Service** | `QUOTE_CTA = PRESENT`, `ACQUISITION_CTA = PRESENT`, `DIRECT_CHECKOUT = ABSENT` |
| `GF-002` | **Consultation / Advisory Service** | `CONSULTATION_CTA = PRESENT`, `DIRECT_CHECKOUT = ABSENT` |
| `GF-003` | **Support-only WhatsApp Channel** | `SUPPORT_CTA = PRESENT`, `ACQUISITION_CTA = ABSENT`, `WHATSAPP = PRESENT` |
| `GF-004` | **Quote Request via WhatsApp** | `ACQUISITION_CTA = PRESENT`, `WHATSAPP = PRESENT` |
| `GF-005` | **Direct E-Commerce Store** | `DIRECT_CHECKOUT = PRESENT`, `QUOTE_CTA = ABSENT` |
| `GF-006` | **Self-Service Gym Membership** | `ONLINE_MEMBERSHIP = PRESENT`, `SELF_SERVICE_PORTAL = PRESENT` |
| `GF-007` | **App-based Emergency Dispatch** | `APP_BASED_SERVICE = PRESENT`, `QUOTE_CTA = ABSENT` |
| `GF-008` | **Ambiguous WhatsApp Presence** | `WHATSAPP = PRESENT`, `CtaContext.classified_intent = UNKNOWN` |
| `GF-009` | **Partially Crawled Domain** | `DIRECT_CHECKOUT = UNKNOWN`, `QUOTE_CTA = UNKNOWN` (Evidence Sufficiency Guard) |

---

## 8. Section 6: Governance & Next Phase Hard Gates

The LeadForge Opportunity Engine remains strictly frozen under the baseline:

```typescript
// LeadForge Opportunity Engine Status — ADR-006
export const OPPORTUNITY_RULES: OpportunityRule[] = []; // ZERO_RULES 🔒
```

### Hard Implementation Gates:
1. **Gate 1 (Contract Ratification):** ADR-006 approved with amendments. ✅
2. **Gate 2 (Golden Fixture Suite):** Construct local HTML/DOM fixture files for `GF-001` through `GF-009` with automated Jest/Vitest assertions verifying expected Evidence only.
3. **Gate 3 (Evidence Detector Implementation):** Code candidate Level 1 Detectors (`TransactionDetector`, `CtaContextDetector`, `SelfServiceDetector`) tested strictly against Golden Fixtures. Zero opportunity rules. Zero production DB mutation.
4. **Gate 4 (Evidence Backtest):** Re-run evidence collection against the 31 Reference + 15 Hard Negative targets to verify zero classification contamination.
5. **Gate 5 (Opportunity Policy):** Only after Gates 1–4 pass with 100% precision on evidence atoms will candidate opportunity policies be drafted.

---

## 9. Revision History

| Version | Date | Status | Changes |
| :--- | :--- | :--- | :--- |
| `0.1.0-draft` | 2026-09-22 | DRAFT | Initial Evidence Design draft post Hard Negatives |
| `1.0.0-approved` | 2026-09-22 | **APPROVED 🔒** | Incorporated GPT review amendments: Level 1 vs Level 2 separation, CtaContext, non-exclusive tx_model, evidence sufficiency, and Golden Fixtures contract |
