# ADR-005: Opportunity Engine Contract (Draft)

**Status:** DRAFT 📝 (Awaiting Review & Taxonomy Verification)
**Date:** 2026-09-19
**Scope:** `_shared/intelligence/priority/*`, `_shared/intelligence/next-best-action/*`, `_shared/ai/gemini-service.ts`, `_shared/services/offer-matcher.ts`

---

## 1. Definition

**What is an Opportunity?**
An Opportunity is a **deterministic business-policy condition evaluated over verified Evidence.**

Evidence establishes observable facts. Opportunity rules define which combinations of those facts constitute a sales opportunity.

No Opportunity may be created from unsupported assumptions, UNKNOWN Evidence, generated text, or inferred business pain.

---

## 2. Evidence → Opportunity Truth Tables (TBD)

The mapping from `EvidencePolarity` to `Opportunity` must be deterministic, hardcoded, and governed by business policy, not just logical deduction (e.g., having a phone and no WhatsApp is only an opportunity because the business policy targets that gap, not because it's a structural failure).

*Note: The following is a placeholder taxonomy that will be replaced by the verified Taxonomy matrix.*

| Opportunity Rule Type | Required Evidence (PRESENT) | Required Evidence (ABSENT) | Target Offer (Compile-time Map) | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `NEEDS_WEBSITE` | TBD | TBD | `seo_website` | **Requires explicit WEBSITE=ABSENT evidence**, not just CMS absence. |
| `NEEDS_BOOKING` | `WEBSITE` | `BOOKING` | `smart_booking` | Requires explicit WEBSITE=PRESENT evidence. |
| `NEEDS_WHATSAPP` | `PHONE` | `WHATSAPP` | `whatsapp_automation` | **Business Policy:** Targeted gap. |
| `NEEDS_CHATBOT` | `WEBSITE` | `CHATBOT` | `ai_chatbot` | Requires explicit WEBSITE=PRESENT evidence. |
| `NEEDS_RECEPTIONIST`| TBD | TBD | `ai_receptionist` | **Pending Validation:** Current logic uses Phone Present + Chatbot/WhatsApp Absent, which does not logically deduce a missing receptionist. Must be verified. |

---

## 3. UNKNOWN Safety

**Rule: `UNKNOWN ≠ ABSENT`**

An Opportunity that relies on the *absence* of a capability CANNOT be triggered if the underlying Evidence is `UNKNOWN`.

```text
Evidence(BOOKING) = UNKNOWN
       ↓
Opportunity(NEEDS_BOOKING) = FALSE (Do not pitch booking)
```

---

## 4. Traceability Contract (Rule vs. Instance)

The generation of an Opportunity is strictly separated into the **Rule Definition** (Compile-time) and the **Generated Instance** (Runtime). 

**Compile-time Mapping:**
```typescript
type OpportunityType = 'NEEDS_BOOKING' | 'NEEDS_CHATBOT' /* ... */;

// Fixed compile-time mapping to prevent runtime typos/misconfigurations
type OpportunityOfferMap = {
  NEEDS_BOOKING: 'smart_booking';
  NEEDS_CHATBOT: 'ai_chatbot';
  // ...
};

interface OpportunityRule<T extends OpportunityType> {
  opportunity_type: T;
  target_offer: OpportunityOfferMap[T];
  required_conditions: Condition[]; // The deterministic Evidence logic
  rule_version: string;
}
```

**Generated Runtime Instance:**
The instance contains no lifecycle state (e.g., `DISCARDED`). It is an immutable domain primitive.
```typescript
interface GeneratedOpportunity<T extends OpportunityType> {
  opportunity_type: T;
  target_offer: OpportunityOfferMap[T];
  supporting_evidence_ids: string[]; // Runtime provenance
  rule_version: string;
}
```

---

## 5. LLM Boundary

The LLM functions strictly as a **Sales Copywriter**.

**The LLM MAY receive:**
- The selected `Opportunity` type.
- The `verified supporting evidence` (to cite facts in the copy).
- The `approved offer` (features, hooks).
- Business-safe context (Name, Industry).

**The LLM MUST NOT:**
- Create or infer an Opportunity.
- Reinterpret `UNKNOWN` Evidence as `ABSENT`.
- Select or switch the Target Offer.
- Invent supporting evidence (no hallucinated pain points).

---

## 6. Existing Logic Inventory

| Component | Future State |
| :--- | :--- |
| `consultant-v2.ts` | **REPLACE** with Copywriter prompt. Remove `ai_opportunities` and `strengths/weaknesses` generation. |
| `prompt-builder.ts` | **REPLACE**. Feed only the deterministic Opportunity and Offer to the LLM. |
| `offer-matcher.ts` | **DELETE**. Offer selection becomes 1:1 typed mapping. |
| `priority/engine.ts` | **OUT OF SCOPE (Audit Required)**. Determines lead/contact priority, not opportunity generation. To be handled in a separate lifecycle layer. |
| `next-best-action/engine.ts` | **OUT OF SCOPE (Audit Required)**. Routing logic will move downstream of Opportunity generation. |

---

## 7. Contract Gates

Before implementation is considered complete, these gates must be met:

1. **No Negative Inference:** The Engine cannot invent factual claims. (e.g., `CHATBOT=ABSENT` + `WHATSAPP=ABSENT` ❌ "Business has no automated customer communication"). It can only apply business policy (`NEEDS_CHATBOT`), without hallucinating new facts.
2. **Positive Evidence Integrity:** Any Opportunity requiring Evidence `X = PRESENT` must have `supporting_evidence_ids.length > 0`, and every ID must point to valid, compatible Evidence.
3. **No LLM Decision Path:** The LLM cannot output `OfferCandidate` or Opportunities.
4. **Deterministic Rules:** Every Opportunity is generated by a pure function `f(Evidence[]) -> Opportunity[]`.
5. **UNKNOWN Safety:** Synthetic tests prove that `Evidence = UNKNOWN` does not trigger absence-based Opportunities.
6. **Structural Typing:** The `target_offer` is structurally typed via `OpportunityOfferMap`.
