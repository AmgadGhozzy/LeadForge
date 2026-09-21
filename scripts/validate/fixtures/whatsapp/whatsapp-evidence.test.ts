import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { EvidenceEngine } from '../../../../supabase/functions/_shared/intelligence/evidence/engine.ts';
import { CanonicalBusinessProfile } from '../../../../supabase/functions/_shared/types/canonical.ts';

const engine = new EvidenceEngine();
const dummyScanId = 'scan-123';

function buildProfile(pages: { url: string; content: string; pageType: string; links?: string[] }[], pagesDiscovered = 2, blockedPages = 0): CanonicalBusinessProfile {
  return {
    identity: {
      id: 'biz-123',
      names: ['Test Business'],
      phones: [],
      emails: [],
      websites: [],
      locations: []
    },
    digitalPresence: {
      pages,
      pagesScraped: pagesDiscovered,
      technologies: []
    },
    reputation: {}
  } as unknown as CanonicalBusinessProfile;
}

// ── E01-E03: PRESENT Traceability ─────────────────────────────────────────────

test('E01 — wa.me href → WHATSAPP PRESENT', async () => {
  const profile = buildProfile([
    { url: 'https://example.com', content: '<a href="https://wa.me/254123456">WhatsApp</a>', pageType: 'HOME', links: ['https://wa.me/254123456'] },
    { url: 'https://example.com/contact', content: 'Contact us', pageType: 'CONTACT' }
  ]);
  const evidence = await engine.extractEvidence(profile, dummyScanId);
  const wa = evidence.find(e => e.type === 'WHATSAPP');
  
  assert.equal(wa?.polarity, 'PRESENT');
  assert.equal(wa?.value, 'https://wa.me/254123456');
  assert.equal(wa?.detector_version, 'v2.1');
});

test('E02 — api.whatsapp.com/send → WHATSAPP PRESENT', async () => {
  const profile = buildProfile([
    { url: 'https://example.com', content: '<a href="https://api.whatsapp.com/send?phone=254123">Chat</a>', pageType: 'HOME', links: ['https://api.whatsapp.com/send?phone=254123'] },
    { url: 'https://example.com/contact', content: 'Contact us', pageType: 'CONTACT' }
  ]);
  const evidence = await engine.extractEvidence(profile, dummyScanId);
  const wa = evidence.find(e => e.type === 'WHATSAPP');
  
  assert.equal(wa?.polarity, 'PRESENT');
});

test('E03 — web.whatsapp.com/send → WHATSAPP PRESENT', async () => {
  const profile = buildProfile([
    { url: 'https://example.com', content: '<a href="https://web.whatsapp.com/send?phone=254123">Chat</a>', pageType: 'HOME', links: ['https://web.whatsapp.com/send?phone=254123'] },
    { url: 'https://example.com/contact', content: 'Contact us', pageType: 'CONTACT' }
  ]);
  const evidence = await engine.extractEvidence(profile, dummyScanId);
  const wa = evidence.find(e => e.type === 'WHATSAPP');
  
  assert.equal(wa?.polarity, 'PRESENT');
});

// ── E04-E06: Semantic/Infrastructure/Incidental Boundaries → UNKNOWN ──────────

test('E04 — Text-only WhatsApp CTA → WHATSAPP UNKNOWN', async () => {
  const profile = buildProfile([
    { url: 'https://example.com', content: 'Call or WhatsApp +254796064430', pageType: 'HOME', links: [] },
    { url: 'https://example.com/contact', content: 'Contact', pageType: 'CONTACT', links: [] }
  ]);
  const evidence = await engine.extractEvidence(profile, dummyScanId);
  const wa = evidence.find(e => e.type === 'WHATSAPP');
  
  assert.equal(wa?.polarity, 'UNKNOWN');
  assert.equal(wa?.value, null);
});

test('E05 — Plugin infrastructure only → WHATSAPP UNKNOWN', async () => {
  const profile = buildProfile([
    { url: 'https://example.com', content: '<link rel="stylesheet" href="click-to-chat-for-whatsapp.css">', pageType: 'HOME', links: [] },
    { url: 'https://example.com/contact', content: 'Contact', pageType: 'CONTACT', links: [] }
  ]);
  const evidence = await engine.extractEvidence(profile, dummyScanId);
  const wa = evidence.find(e => e.type === 'WHATSAPP');
  
  assert.equal(wa?.polarity, 'UNKNOWN');
});

test('E06 — Incidental CSS/JS/social occurrence → WHATSAPP UNKNOWN', async () => {
  const profile = buildProfile([
    { url: 'https://example.com', content: '<i class="fa-whatsapp"></i>', pageType: 'HOME', links: [] },
    { url: 'https://example.com/contact', content: 'Contact', pageType: 'CONTACT', links: [] }
  ]);
  const evidence = await engine.extractEvidence(profile, dummyScanId);
  const wa = evidence.find(e => e.type === 'WHATSAPP');
  
  assert.equal(wa?.polarity, 'UNKNOWN');
});

// ── E07: Observability Restrictions ───────────────────────────────────────────

test('E07 — No WhatsApp + blocked/timed out coverage → WHATSAPP UNKNOWN', async () => {
  const profile = buildProfile([
    { url: 'https://example.com', content: 'Home', pageType: 'HOME', links: [] }
    // Contact page missing/blocked
  ], 5, 3); // 5 discovered, 3 blocked
  const evidence = await engine.extractEvidence(profile, dummyScanId);
  const wa = evidence.find(e => e.type === 'WHATSAPP');
  
  assert.equal(wa?.polarity, 'UNKNOWN');
});

// ── E08-E09: Crucial Monotonicity & Safety Rules ──────────────────────────────

test('E08 — Incidental evidence + 100% coverage must NOT be ABSENT (UNKNOWN safety)', async () => {
  const profile = buildProfile([
    { url: 'https://example.com', content: 'whatsapp is cool', pageType: 'HOME', links: [] },
    { url: 'https://example.com/contact', content: 'Contact', pageType: 'CONTACT', links: [] }
  ], 2, 0); // 2 pages discovered, 2 scanned = 100% coverage
  const evidence = await engine.extractEvidence(profile, dummyScanId);
  const wa = evidence.find(e => e.type === 'WHATSAPP');
  
  assert.equal(wa?.polarity, 'UNKNOWN', 'Even with 100% coverage, incidental keyword must yield UNKNOWN, not ABSENT');
});

test('E09 — Clean absence + 100% observable coverage remains ABSENT', async () => {
  const profile = buildProfile([
    { url: 'https://example.com', content: 'Welcome to our clinic', pageType: 'HOME', links: [] },
    { url: 'https://example.com/contact', content: 'Contact via email only', pageType: 'CONTACT', links: [] }
  ], 2, 0);
  const evidence = await engine.extractEvidence(profile, dummyScanId);
  const wa = evidence.find(e => e.type === 'WHATSAPP');
  
  assert.equal(wa?.polarity, 'ABSENT', 'Clean absence with sufficient observability must yield ABSENT');
  assert.equal(wa?.value, 'false');
});
