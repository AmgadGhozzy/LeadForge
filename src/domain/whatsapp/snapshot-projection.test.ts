/**
 * Projection invariant tests.
 *
 * These tests are PURE — no LLM, no network.
 * They prove buildSnapshotProjection satisfies the following invariants:
 *
 *   ✓ all pages retained (pageCount === snapshot.pages.length)
 *   ✓ all links retained (href present in projection text)
 *   ✓ all iframe src retained
 *   ✓ all form metadata retained (action + method + field names)
 *   ✓ visible_text deterministic (same snapshot → same text)
 *   ✓ html excerpt deterministic
 *   ✓ projection sha256 deterministic (same input → same hash)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshotProjection } from "./whatsapp-llm-extractor.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSnapshot(pages: any[]) {
  return { pages };
}

const FULL_PAGE = {
  route: "home",
  url: "https://example.com/",
  visible_text: "A".repeat(8000), // longer than 5K budget
  html: "B".repeat(5000),         // longer than 3K budget
  links: [
    { href: "https://wa.me/201234567890", text: "Chat with us" },
    { href: "mailto:info@example.com",    text: "Email us" },
  ],
  iframes: [
    { src: "https://widget.example.com/chat" },
    { src: "https://another.example.com/embed" },
  ],
  forms: [
    { action: "/contact", method: "POST", fields: [{ name: "name" }, { name: "email" }, { name: "message" }] },
  ],
};

const CONTACT_PAGE = {
  route: "contact",
  url: "https://example.com/contact",
  visible_text: "Contact us by phone or email.",
  html: "<form action='/contact' method='post'><input name='email'/></form>",
  links: [{ href: "tel:+123456789", text: "Call us" }],
  iframes: [],
  forms: [{ action: "/contact", method: "POST", inputs: [{ name: "email" }, { id: "submit" }] }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildSnapshotProjection invariants", () => {

  // ✓ Invariant 1: pageCount === snapshot.pages.length (no page drop)
  test("all pages retained — single page", () => {
    const snap = makeSnapshot([FULL_PAGE]);
    const proj = buildSnapshotProjection(snap);
    assert.strictEqual(proj.pageCount, 1, "pageCount must equal number of pages in snapshot");
    assert.ok(proj.text.includes("=== PAGE: home ==="), "home page marker must be present");
  });

  test("all pages retained — two pages", () => {
    const snap = makeSnapshot([FULL_PAGE, CONTACT_PAGE]);
    const proj = buildSnapshotProjection(snap);
    assert.strictEqual(proj.pageCount, 2, "pageCount must equal 2");
    assert.ok(proj.text.includes("=== PAGE: home ==="),    "home page marker must be present");
    assert.ok(proj.text.includes("=== PAGE: contact ==="), "contact page marker must be present");
  });

  // ✓ Invariant 2: all links retained
  test("all links retained (object format)", () => {
    const snap = makeSnapshot([FULL_PAGE]);
    const proj = buildSnapshotProjection(snap);
    assert.ok(proj.text.includes("https://wa.me/201234567890"), "wa.me link must be present");
    assert.ok(proj.text.includes("mailto:info@example.com"),   "mailto link must be present");
  });

  test("all links retained (string format)", () => {
    const snap = makeSnapshot([{
      route: "home",
      links: [
        "https://wa.me/123456789",
        "https://api.whatsapp.com/send?phone=987654321"
      ]
    }]);
    const proj = buildSnapshotProjection(snap);
    assert.ok(proj.text.includes("https://wa.me/123456789"), "wa.me link (string) must be present");
    assert.ok(proj.text.includes("https://api.whatsapp.com/send?phone=987654321"), "api.whatsapp link (string) must be present");
  });

  // ✓ Invariant 3: all iframe srcs retained
  test("all iframe src retained", () => {
    const snap = makeSnapshot([FULL_PAGE]);
    const proj = buildSnapshotProjection(snap);
    assert.ok(proj.text.includes("https://widget.example.com/chat"),   "iframe 1 src must be present");
    assert.ok(proj.text.includes("https://another.example.com/embed"), "iframe 2 src must be present");
  });

  // ✓ Invariant 4: form metadata retained (action, method, field names)
  test("form metadata retained — action, method, field names", () => {
    const snap = makeSnapshot([FULL_PAGE]);
    const proj = buildSnapshotProjection(snap);
    assert.ok(proj.text.includes("action=/contact"), "form action must be present");
    assert.ok(proj.text.includes("method=POST"),     "form method must be present");
    assert.ok(proj.text.includes("name"),            "field name must be present");
    assert.ok(proj.text.includes("email"),           "field email must be present");
    assert.ok(proj.text.includes("message"),         "field message must be present");
  });

  // Form inputs via `inputs[]` alternate shape
  test("form metadata retained — inputs[] alternate shape", () => {
    const snap = makeSnapshot([CONTACT_PAGE]);
    const proj = buildSnapshotProjection(snap);
    assert.ok(proj.text.includes("action=/contact"), "form action must be present in contact page");
    assert.ok(proj.text.includes("method=POST"),     "form method must be present in contact page");
    assert.ok(proj.text.includes("email"),           "input name email must be present");
  });

  // ✓ Invariant 5: visible_text truncated at 5,000
  test("visible_text truncated to 5,000 chars (budget respected)", () => {
    const snap = makeSnapshot([FULL_PAGE]);
    const proj = buildSnapshotProjection(snap);
    // FULL_PAGE has 8000 A's — expect exactly 5000
    assert.ok(proj.text.match(/A{4000,}/),    "visible_text A-run must be present");
    assert.ok(!proj.text.match(/A{5001,}/),   "visible_text must NOT exceed 5,000 chars");
  });

  // ✓ Invariant 6: html excerpt truncated at 3,000
  test("html excerpt truncated to 3,000 chars (budget respected)", () => {
    const snap = makeSnapshot([FULL_PAGE]);
    const proj = buildSnapshotProjection(snap);
    // FULL_PAGE html has 5000 B's — expect exactly 3000
    assert.ok(proj.text.match(/B{2000,}/),    "html B-run must be present");
    assert.ok(!proj.text.match(/B{3001,}/),   "html excerpt must NOT exceed 3,000 chars");
  });

  // ✓ Invariant 7a: same snapshot → same projection text
  test("projection text is deterministic", () => {
    const snap = makeSnapshot([FULL_PAGE, CONTACT_PAGE]);
    const proj1 = buildSnapshotProjection(snap);
    const proj2 = buildSnapshotProjection(snap);
    assert.strictEqual(proj1.text, proj2.text, "same snapshot must produce identical projection text");
  });

  // ✓ Invariant 7b: same snapshot → same sha256
  test("projection sha256 is deterministic", () => {
    const snap = makeSnapshot([FULL_PAGE, CONTACT_PAGE]);
    const proj1 = buildSnapshotProjection(snap);
    const proj2 = buildSnapshotProjection(snap);
    assert.strictEqual(proj1.sha256, proj2.sha256, "sha256 must be identical for same snapshot");
    assert.match(proj1.sha256, /^[0-9a-f]{64}$/, "sha256 must be 64-char hex");
  });

  // ✓ Different snapshots → different sha256
  test("different snapshots produce different sha256", () => {
    const snap1 = makeSnapshot([FULL_PAGE]);
    const snap2 = makeSnapshot([CONTACT_PAGE]);
    const proj1 = buildSnapshotProjection(snap1);
    const proj2 = buildSnapshotProjection(snap2);
    assert.notStrictEqual(proj1.sha256, proj2.sha256, "different snapshots must produce different sha256");
  });

  // ✓ Empty pages → zero pageCount, sha256 still defined
  test("empty snapshot pages — zero pageCount, sha256 still defined", () => {
    const snap = makeSnapshot([]);
    const proj = buildSnapshotProjection(snap);
    assert.strictEqual(proj.pageCount, 0);
    assert.match(proj.sha256, /^[0-9a-f]{64}$/, "sha256 must be defined even for empty snapshot");
  });

  // ✓ Page with no links/iframes/forms → retained without crash
  test("page with no links, iframes, forms — retained without crash", () => {
    const minimalPage = {
      route: "about",
      url: "https://example.com/about",
      visible_text: "About us page.",
      html: "<p>About</p>",
    };
    const snap = makeSnapshot([minimalPage]);
    const proj = buildSnapshotProjection(snap);
    assert.strictEqual(proj.pageCount, 1);
    assert.ok(proj.text.includes("=== PAGE: about ==="));
    assert.ok(proj.text.includes("About us page."));
  });
});
