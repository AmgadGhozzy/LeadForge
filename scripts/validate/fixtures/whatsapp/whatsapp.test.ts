/**
 * WhatsApp Detector v2 — Golden Regression Fixtures
 *
 * 11 adversarial fixtures testing the Evidence Contract boundaries.
 * These must all pass before the Oracle regression is evaluated.
 *
 * Run:
 *   npx tsx --test scripts/validate/fixtures/whatsapp/whatsapp.test.ts
 *
 * Contract reminder:
 *   PRESENT  = Contact Evidence (href-extracted, hostname-validated wa.me or api.whatsapp.com/send)
 *   UNKNOWN  = everything else — infrastructure assets, CSS, share metadata,
 *              bot guards, image filenames, raw keyword, query-param wa.me
 */

import { it as test } from 'vitest';
import * as assert from 'node:assert/strict';
import { WhatsAppDetector } from '../../../../supabase/functions/_shared/detection/detectors/WhatsAppDetector.ts';

const detector = new WhatsAppDetector();

function wrap(body: string): string {
  return `<html><body>${body}</body></html>`;
}

// ── F01–F02: PRESENT — Contact Evidence ───────────────────────────────────────

test('F01 — wa.me real href → PRESENT (wa_me_link)', () => {
  const r = detector.detect(wrap(
    '<a href="https://wa.me/61412000000">Chat with us</a>'
  ));
  assert.equal(r.detected, true, 'wa.me href must produce detected=true');
  assert.ok(
    r.positive_signals.some(s => s.type === 'wa_me_link'),
    'must produce wa_me_link signal'
  );
  assert.equal(r.positive_signals.find(s => s.type === 'wa_me_link')?.value,
    'https://wa.me/61412000000');
});

test('F02 — api.whatsapp.com/send real href → PRESENT (whatsapp_api_link)', () => {
  const r = detector.detect(wrap(
    '<a href="https://api.whatsapp.com/send?phone=61412000000">WhatsApp us</a>'
  ));
  assert.equal(r.detected, true, 'api.whatsapp.com/send href must produce detected=true');
  assert.ok(
    r.positive_signals.some(s => s.type === 'whatsapp_api_link'),
    'must produce whatsapp_api_link signal'
  );
});

test('F02b — web.whatsapp.com/send real href → PRESENT (whatsapp_api_link)', () => {
  const r = detector.detect(wrap(
    '<a href="https://web.whatsapp.com/send?phone=+201100165016">WhatsApp us</a>'
  ));
  assert.equal(r.detected, true, 'web.whatsapp.com/send href must produce detected=true');
  assert.ok(
    r.positive_signals.some(s => s.type === 'whatsapp_api_link'),
    'must produce whatsapp_api_link signal'
  );
});

// ── F03–F05: UNKNOWN — Critical URL-parsing regression guards ─────────────────
// These verify that the new href-extraction approach is NOT a narrower version
// of the same raw-string bug. If any of these fail, the detector has regressed.

test('F03 — wa.me inside JS string (not an href) → UNKNOWN', () => {
  const r = detector.detect(wrap(
    '<script>var contactUrl = "https://wa.me/61412000000";</script>'
  ));
  assert.equal(r.detected, false,
    'wa.me in a JS string must not produce detected=true — only href attrs are scanned');
});

test('F04 — wa.me inside CSS (not an href) → UNKNOWN', () => {
  const r = detector.detect(wrap(
    '<style>.contact-bg { background: url("https://wa.me/img.png") }</style>'
  ));
  assert.equal(r.detected, false,
    'wa.me in CSS must not produce detected=true');
});

test('F05 — wa.me embedded in query parameter of another domain → UNKNOWN', () => {
  // hostname = example.com, not wa.me → must be rejected by URL classifier
  const r = detector.detect(wrap(
    '<a href="https://example.com/?redirect=https://wa.me/61412000000">Go</a>'
  ));
  assert.equal(r.detected, false,
    'wa.me inside a query param (hostname ≠ wa.me) must not produce detected=true');
});

// ── F06–F07: Infrastructure Evidence ──────────────────────────────────────────

test('F06 — click-to-chat plugin asset (stylesheet only) → UNKNOWN', () => {
  // Plugin CSS loaded but no actionable wa.me href present
  const r = detector.detect(wrap(
    '<link rel="stylesheet" href="/wp-content/plugins/click-to-chat-for-whatsapp/css/style.min.css">'
  ));
  assert.equal(r.detected, false,
    'plugin asset alone is Infrastructure Evidence — must not produce detected=true');
});

test('F07 — click-to-chat asset + actionable wa.me href → PRESENT', () => {
  // Infrastructure + Contact Evidence → Contact Evidence wins, PRESENT is correct
  const r = detector.detect(wrap(
    '<link rel="stylesheet" href="/wp-content/plugins/click-to-chat-for-whatsapp/css/style.min.css">' +
    '<a href="https://wa.me/61412000000">Chat on WhatsApp</a>'
  ));
  assert.equal(r.detected, true,
    'when Contact Evidence exists alongside infrastructure, must be PRESENT');
  assert.ok(r.positive_signals.some(s => s.type === 'wa_me_link'));
});

// ── F08–F11: Incidental Evidence — must all produce UNKNOWN ───────────────────

test('F08 — social-share WhatsApp JSON config → UNKNOWN', () => {
  const r = detector.detect(wrap(
    '<script>var sharing = {"whatsapp":{"title":"Share on WhatsApp","url":"#"}};</script>'
  ));
  assert.equal(r.detected, false,
    'social-share JSON config is Incidental — must not produce detected=true');
});

test('F09 — WhatsApp image filename in img src → UNKNOWN', () => {
  const r = detector.detect(wrap(
    '<img src="/uploads/whatsapp-image-2023-03-23-at-12_51_21.jpeg" alt="office visit">'
  ));
  assert.equal(r.detected, false,
    'WhatsApp image filename is Incidental — must not produce detected=true');
});

test('F10 — bot-guard UA string → UNKNOWN', () => {
  const r = detector.detect(wrap(
    '<script>var bots = "facebookexternalhit|whatsapp|telegram|bingbot";</script>'
  ));
  assert.equal(r.detected, false,
    'bot-guard UA string is Incidental — must not produce detected=true');
});

test('F11 — Font Awesome + Elementor WhatsApp CSS icons → UNKNOWN', () => {
  // These are the most common false-positive triggers in the 13 UNSUPPORTED_POSITIVE cases
  const r = detector.detect(wrap(
    '<style>' +
    '.fa-whatsapp:before { content: "\\f232" }' +
    '.et-social-whatsapp a.icon:before { content: "\\f232" }' +
    '.elementor-social-icon-whatsapp { background-color: #25d366 }' +
    '</style>'
  ));
  assert.equal(r.detected, false,
    'CSS icon definitions are Incidental — must not produce detected=true');
});

// ── Metadata contract ─────────────────────────────────────────────────────────

test('META01 — incidental_keyword_found=true when whatsapp in HTML but detected=false', () => {
  const r = detector.detect(wrap(
    '<style>.fa-whatsapp:before{content:"\\f232"}</style>'
  ));
  assert.equal(r.detected, false);
  assert.equal((r.metadata as Record<string, unknown>).incidental_keyword_found, true,
    'incidental keyword must be flagged in metadata even when no contact evidence found');
});

test('META02 — incidental_keyword_found=false when no whatsapp mention at all', () => {
  const r = detector.detect(wrap(
    '<p>Contact us by phone or email. Our team is ready to help.</p>'
  ));
  assert.equal(r.detected, false);
  assert.equal((r.metadata as Record<string, unknown>).incidental_keyword_found, false);
});

test('META03 — detector_version is v2.1', () => {
  const r = detector.detect('<html><body></body></html>');
  assert.equal((r.metadata as Record<string, unknown>).detector_version, 'v2.1');
});
