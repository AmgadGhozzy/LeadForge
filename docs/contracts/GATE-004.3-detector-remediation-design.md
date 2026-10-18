# GATE-004.3 — Detector Remediation Design Document

**Status:** DESIGN RATIFIED  
**Date:** 2026-09-23  
**Phase:** Gate 4.3 — Pre-Implementation Architectural Design  
**Governing Documents:** `ADR-006`, Gate 3.1, Gate 4.1, Gate 4.2 Reports  
**Scope:** Design specification for 8 audited `SYSTEM_BUG` detector defects  
**Mode:** DESIGN-ONLY / ZERO CODE CHANGES / ZERO DB MUTATION / ZERO_RULES  

---

## 0. Executive Mandate & Architectural Invariants

Following the Gate 4.2 forensic reconciliation across the 56 root mismatches, **8 cases** were definitively classified as `SYSTEM_BUG` in Level-1 detector patterns.

This document sets the design contracts and technical specifications for remediating these 8 defects **prior to any code modifications**.

### Invariants:
1. **Raw Observation First:** Detectors observe concrete DOM phenomena; they do not infer intent or commercial policy.
2. **Context, Not Uncontrolled Blacklists:** Rejection of non-commercial tokens must rely on syntactic and structural context (e.g. content marketing vs paid acquisition), not fragile single-keyword blacklists.
3. **No Hiding of Authentic Evidence:** E-commerce transactions (`add-to-cart`) on clinic sites remain valid Level-1 observations; domain policy separation belongs strictly to Level-2.
4. **Zero Code Changes in this Gate:** This document specifies patterns, fixtures, and boundary tests. Implementation occurs only upon explicit ratification.

---

## 1. Remediation Specification: Defect Family 1 — Newsletter vs. Membership (`ONLINE_MEMBERSHIP`)

### The Defect (Affected Targets: Pearl Dental, Kings Dental, First Dental):
In `TransactionDetector.ts` (line 35):
```ts
{ name: 'recurring subscription', re: /\bsubscribe\b|\brecurring\b|monthly pass|annual pass/i }
```
A bare word-boundary `\bsubscribe\b` matches footer newsletter inputs (`<input placeholder="Subscribe to our newsletter">`), incorrectly asserting that the business operates a paid online recurring membership model.

### Contract Boundary:
- **`SERVICE_ACQUISITION` (Paid Membership):** Recurring billing for commercial service, membership plan, digital pass, or SaaS tier.
- **`CONTENT_MARKETING` (Newsletter/Blog):** Free informational email distribution.

### Proposed Pattern Specification:
Replace bare `\bsubscribe\b` with contextual membership/billing anchors:
```ts
// Negative lookahead / context-anchored recurring subscription
{
  name: 'recurring membership subscription',
  re: /(?:recurring|paid|monthly|annual|yearly)\s+subscription|(?:subscribe|subscription)\s+(?:to\s+)?(?:plan|membership|service|tier|pass)|\b(?:monthly|annual)\s+pass\b/i
}
```
**Content Marketing Exclusion:**
If a matched element or container contains `newsletter`, `email updates`, `our blog`, `mailing list`, or `stay updated`, the detector must NOT emit `ONLINE_MEMBERSHIP`.

---

## 2. Remediation Specification: Defect Family 2 — Recruitment vs. Acquisition (`APPLICATION_CTA`)

### The Defect (Affected Target: Emirates Dental):
In `CtaContextDetector.ts` (line 57):
```ts
{ name: 'apply now', re: /apply now/i }
```
A bare `apply now` matches buttons in career/recruitment sections (`"Join our team as Dental Specialist: Apply Now"`), misclassifying employment applications as customer lead intake.

### Contract Boundary:
- **`CUSTOMER_INTAKE`:** Patient onboarding, financing/credit application, customer account opening, service intake form.
- **`TALENT_ACQUISITION`:** Job candidate resume submission, careers, employment opportunities.

### Proposed Pattern Specification:
```ts
{
  name: 'customer/financing application',
  re: /(?:credit|loan|mortgage|financing|patient|client|customer)\s+application|submit\s+(?:an?\s+)?(?:account|patient|service)\s+application|onboarding\s+intake/i
}
```
**Careers Exclusion:**
If the element or its parent link container links to `/careers`, `/jobs`, `/vacancies`, or has surrounding text containing `resume`, `cv`, `hiring`, `positions`, `join our team`, or `employment`, it must NOT emit `APPLICATION_CTA`.

---

## 3. Remediation Specification: Defect Family 3 — Arabic Consultation Token Gap (`CONSULTATION_CTA`)

### The Defect (Affected Targets: IMAGE Dental, St George Dental, Loran Dental, Pearl Dental):
In `CtaContextDetector.ts` (lines 40–44):
```ts
const CONSULTATION_PATTERNS: Pattern[] = [
  { name: 'book/schedule consultation', re: /(?:book|schedule|reserve)[^<]{0,40}consultation/i },
  { name: 'speak with an advisor', re: /speak with an advisor/i },
  { name: 'free assessment', re: /free assessment/i },
];
```
Patterns are exclusively English. Prominent bilingual and Arabic medical clinics using explicit consultation tokens (`احجز استشارتك`, `طلب استشارة`, `استشارة مجانية`) failed detection despite clear DOM presence.

### Contract Boundary:
- **Level-1 Unambiguous Consultation:** Must require the root semantic token `استشارة` or explicit clinical assessment.
- **Strict Gate 3.1 Compliance:** Generic contact phrases (`اتصل بنا`, `تواصل معنا`, `راسلنا`) remain **STRICTLY PROHIBITED** from emitting `CONSULTATION_CTA`.

### Proposed Pattern Specification:
```ts
const ARABIC_CONSULTATION_PATTERNS: Pattern[] = [
  { name: 'arabic consultation booking', re: /(?:احجز|حجز|طلب|سجل)\s*(?:في\s*)?(?:استشارتك|استشارة)/u },
  { name: 'arabic free consultation', re: /استشارة\s*(?:مجانية|طبية|عاجلة)/u },
  { name: 'arabic speak with doctor/advisor', re: /(?:تحدث|استشر)\s*(?:مع\s*)?(?:طبيب|استشاري|مختص)/u },
];
```

---

## 4. Architectural Boundary Confirmation: Retail Merchandise (`DIRECT_CHECKOUT`)

### The Case (Affected Targets: ZED Dental, First Dental):
Clinics featuring e-commerce widgets (WooCommerce `add-to-cart`) for dental retail products (electric toothbrushes, whitening kits).

### Architectural Decision:
- **Level-1 Integrity Preserved:** The Level-1 detector will **NOT** be altered or suppressed. A physical shopping cart widget is an authentic, observable transaction capability.
- **Layer Separation:** The distinction between:
  - *Core clinical treatment direct booking* vs.
  - *Ancillary retail merchandise purchase*  
  belongs strictly to **Level-2 Derived Interpretation / Level-3 Commercial Policy**. Hiding raw e-commerce evidence at Level-1 would violate the foundational ADR-006 rule: *"Raw observation first. Policy never."*

---

## 5. Verification & Contract Test Plan (Next Gate: Gate 4.4)

Before implementing the changes in production code:
1. **Unit Fixture Expansion (`tests/fixtures/evidence_golden/`):**
   - Fixture `GF-NEWSLETTER-001`: Footer newsletter form `<input type="email"> <button>Subscribe</button>` $\rightarrow$ Assert `ONLINE_MEMBERSHIP = ABSENT`.
   - Fixture `GF-MEMBERSHIP-001`: Gym recurring plan `<button>Subscribe to Monthly Pass ($49/mo)</button>` $\rightarrow$ Assert `ONLINE_MEMBERSHIP = PRESENT`.
   - Fixture `GF-CAREERS-001`: Hospital careers page `<a href="/careers/apply">Apply Now</a>` $\rightarrow$ Assert `APPLICATION_CTA = ABSENT`.
   - Fixture `GF-ARABIC-CONSULT-001`: Dental clinic header `<button>احجز استشارتك المجانية</button>` $\rightarrow$ Assert `CONSULTATION_CTA = PRESENT`.
2. **Regression Verification:**
   - 100% pass across all existing 74 test suites (13 Golden Fixtures + 48 Production Detectors + 5 Negative Controls).
3. **Focused Replay:**
   - Re-running the 8 specific targets to verify correction from `SYSTEM_BUG` to verified expected contract state.

***
*Design document finalized for Gate 4.3. Ready for review and sign-off.*
