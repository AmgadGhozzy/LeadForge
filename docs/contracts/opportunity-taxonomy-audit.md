# Opportunity Taxonomy Verification v2

This document provides a read-only verification of the actual Opportunity/Offer taxonomy based on the active `offer_templates` database versus legacy application code. No production code has been modified, and ADR-005 is NOT yet frozen.

---

## A. Active Offer Catalog (Source of Truth)
Based on a direct query of the active `offer_templates` table, there are only **TWO** active offers in the database:

1. **`ai-website-audit` (AI Website Audit & Overhaul)**
   - **Features:** AI-powered UX analysis, Conversion rate optimization, Mobile responsiveness fix
   - **Hook:** "Stop losing 80% of your traffic to poor UX. Get a free AI audit today."
2. **`automated-lead-nurturing` (Automated Lead Nurturing System)**
   - **Features:** Multi-channel follow-up sequences, CRM integration, AI-driven personalization
   - **Hook:** "Turn 3x more leads into appointments on autopilot."

---

## B. Legacy Opportunity Inventory
A trace through the existing codebase reveals that legacy routing, scoring, and matching systems rely on a fictional taxonomy that is completely disconnected from the database.

- **`services/offer-matcher.ts`:**
  - Expects slugs: `whatsapp_automation`, `ai_chatbot`, `ai_receptionist`, `seo_website`.
  - Uses substring matching on LLM outputs (e.g., matching "chat" or "booking" to rank these ghost offers).
- **`intelligence/next-best-action/engine.ts`:**
  - Recommends strings: `'AI Receptionist'`, `'AI WhatsApp Assistant'`, `'Website + Local SEO'`, `'Smart Booking Engine'`.
  - Logic maps absence of website to "Website + Local SEO", which contradicts our actual DB offerings.
- **`ai/prompts/consultant-v2.ts`:**
  - The LLM hallucinates `ai_opportunities` and `automation_opportunities` JSON structures with arbitrary text.

---

## C. Evidence Capability Matrix
Using the newly frozen Evidence layer, the following domains exist and can be safely evaluated (Values: PRESENT, ABSENT, UNKNOWN):

| Evidence Type | PRESENT Meaning | ABSENT Meaning | UNKNOWN Meaning |
| --- | --- | --- | --- |
| `WEBSITE` | Definitively has a functional website. | Definitively lacks a functional website (dead link, unreachable). | Could not verify existence. |
| `BOOKING` | Has an observable booking/scheduling widget. | Definitively has no booking system. | Could not observe deeply enough. |
| `WHATSAPP`| Has a WhatsApp link/button. | Definitively has no WhatsApp integration. | Could not scan for WhatsApp. |
| `CHATBOT` | Has an observable chat widget. | Definitively has no chat widget. | Could not execute JS/scan chat. |
| `PHONE`   | A valid phone number is listed. | No phone number listed. | Failed to scrape contacts. |
| `TECHNOLOGY`| Uses a specific tech (e.g., WordPress). | Lacks a specific tech. | Wappalyzer failed. |

**Important Constraint:** `UNKNOWN` can never be treated as `ABSENT`. No implied semantics allowed.

---

## D. Verified Taxonomy Matrix

This matrix evaluates the legacy/fictional rules against our actual Database capabilities.

| Active DB Offer | Candidate Legacy Opportunity | Required PRESENT Evidence | Required ABSENT Evidence | UNKNOWN Behavior | Evidence IDs Available? | Business Policy Status | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ai-website-audit` | Legacy: `seo_website` (`WEBSITE=ABSENT`) | `WEBSITE` | None | Discarded | Yes | Directly Contradictory | **UNSUPPORTED** (You cannot audit UX if WEBSITE=ABSENT. It must be PRESENT). |
| `automated-lead-nurturing` | Legacy: `whatsapp_automation` | `PHONE` | `WHATSAPP` | Discarded | Yes | Disconnected | **TBD** (Does lack of WhatsApp logically justify pitching a CRM Nurture System?) |
| ❌ No Active Offer | Legacy: `ai_chatbot` | `WEBSITE` | `CHATBOT` | Discarded | Yes | N/A | **UNSUPPORTED** |
| ❌ No Active Offer | Legacy: `ai_receptionist`| `PHONE` | `CHATBOT` & `WA` | Discarded | Yes | Invalid Inference | **UNSUPPORTED** |
| ❌ No Active Offer | Legacy: `Smart Booking Engine` | `WEBSITE` | `BOOKING` | Discarded | Yes | N/A | **UNSUPPORTED** |

---

## E. Proposed Minimal Taxonomy
If we build the Opportunity Engine *today* strictly around what is in the Database and what Evidence supports, we have the following minimal valid set:

**1. Opportunity: Website Audit Pitch**
- **Required:** `Evidence(WEBSITE) = PRESENT`
- **Target Offer:** `ai-website-audit`
- **Justification:** Directly evidenced. You can pitch a UX audit to anyone with a website.

**2. Opportunity: Lead Nurturing Pitch**
- **Required:** `Evidence(WEBSITE) = PRESENT` (or `PHONE = PRESENT`)
- **Target Offer:** `automated-lead-nurturing`
- **Justification:** TBD (Business Policy). Is this pitched universally, or only when `BOOKING = ABSENT`?

*(Note: There are currently no rules that validly rely on Evidence=ABSENT based on the two active offers).*

---

## F. False Taxonomy Assumptions Detected
The legacy codebase contains several severe logical flaws that violate Evidence semantics:
1. **CMS Absent → Website Absent:** `TECHNOLOGY=ABSENT` does not mean `WEBSITE=ABSENT`. (Unsupported Inference)
2. **Website Absent → Pitch Audit:** Legacy logic pitched "SEO/Website" when website is absent. But the actual DB offer is "Website UX Audit", which requires a website to be PRESENT. (Factually Contradictory)
3. **Chatbot Absent + WA Absent → Needs Receptionist:** Absence of two digital widgets does not deduce the absence of a receptionist. (Unsupported Inference)

---

## G. Open Business Decisions

To finalize ADR-005 and begin implementation, we need a business decision on the following:

1. **Offer Catalog Direction:** Do we want to **add** the missing offers to the database (Chatbot, WhatsApp Automation, Booking Engine) because they reflect the true product vision? Or do we want to **delete** all legacy routing and restrict the application strictly to selling `ai-website-audit` and `automated-lead-nurturing`?
2. **Lead Nurturing Policy:** If we keep `automated-lead-nurturing`, what precise Evidence condition justifies pitching it? (e.g., `WEBSITE=PRESENT` alone? Or a specific technology gap?)

Once these two questions are answered, ADR-005 can be updated and frozen.
