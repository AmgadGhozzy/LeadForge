# WhatsApp Evidence Contract

This document defines the strict classification boundaries for WhatsApp contact evidence in the Detector v2+ architecture.

## 1. Evidence Taxonomy & Decision Matrix (Phase 3B Freeze)

The LeadForge architecture enforces a strict separation between observable contact destinations and incidental or semantic claims. 

| Evidence Pattern | Taxonomy Category | Contract Decision | Detector Output |
|---|---|---|---|
| `wa.me` actionable href | **Contact Evidence** | PRESENT | YES |
| `api.whatsapp.com/send` actionable href | **Contact Evidence** | PRESENT | YES |
| `web.whatsapp.com/send` actionable href | **Contact Evidence** | PRESENT | YES |
| Widget + actionable destination | **Contact Evidence** | PRESENT | YES |
| "WhatsApp" + phone number in text | Semantic/Text Evidence | UNKNOWN | UNKNOWN |
| "Contact us via WhatsApp" (no destination) | Semantic/Text Evidence | UNKNOWN | UNKNOWN |
| Plugin asset only (e.g. CSS/JS) | Infrastructure Evidence | UNKNOWN | UNKNOWN |
| Social-share button/metadata | Incidental Evidence | UNKNOWN | UNKNOWN |
| Image filename containing "whatsapp" | Incidental Evidence | UNKNOWN | UNKNOWN |

---

## 2. Actionable Contact Evidence (PRESENT)
The presence of a structurally valid, actionable WhatsApp destination URL on the page is sufficient to trigger a `PRESENT` decision.

### 2.1 URL Structural Validation
A structurally valid hostname (e.g., parsing `https://wa.me/...` successfully) is sufficient for Contact Evidence.
- **Phone-number semantic validity** (e.g., format, digit count, spaces like `+254 722 223 195`) is **outside the Detector's scope**.
- The WhatsApp platform handles phone resolution; the Detector's role is to identify the contact destination, not validate the number format.

---

## 3. Semantic / Reference Boundaries (UNKNOWN)

The following patterns represent known differences between the independent LLM Reference (Oracle) and the Production Detector v2.1 contract. In these cases, the Oracle may classify as `YES` (based on its own permissive instructions), but the Detector intentionally classifies as `UNKNOWN` to maintain a strict evidence boundary.

### 3.1 Text-Only Instructions (Semantic/Text Evidence)
- **Pattern:** Explicit text like "Call or WhatsApp +254796064430" or "Contact us via WhatsApp" with no accompanying actionable `href` destination.
- **Contract Decision:** `UNKNOWN`.
- **Rationale:** The Detector requires an actionable destination link (Contact Evidence). Text-only mentions without a verified endpoint require OCR, complex parsing, or semantic interpretation which leads to false positives. They are not supported as sufficient proof of integration capability.

### 3.2 Infrastructure-Only Plugins (Infrastructure Evidence)
- **Pattern:** CSS/JS assets indicating a WhatsApp plugin (e.g., `click-to-chat-for-whatsapp`), but no actionable `href` destination rendered in the DOM.
- **Contract Decision:** `UNKNOWN`.
- **Rationale:** Infrastructure Evidence alone does not prove the business has fully configured an active WhatsApp contact channel (the plugin could be disabled, misconfigured, or inaccessible). It must be corroborated by an actionable destination.

### 3.3 Incidental Keywords & Icons (Incidental Evidence)
- **Pattern:** CSS classes (e.g., `.fa-whatsapp`), social share intents, bot-guard strings, or image filenames containing the word "whatsapp".
- **Contract Decision:** `UNKNOWN`.
- **Rationale:** These occurrences are incidental. They do not constitute actionable Contact Evidence.
