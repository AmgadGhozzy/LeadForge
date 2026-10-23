// ──────────────────────────────────────────────
// Phase 8A — Lifecycle + Coverage Tests (8A.5)
// ──────────────────────────────────────────────

import { assertEquals, assertExists, assert, assertNotEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { EvidenceEngine } from "./engine.ts";
import { ConfidenceCalculator } from "./confidence.ts";
import { EVIDENCE_ENGINE_VERSION, DETECTOR_VERSIONS } from "./types.ts";
import type { CanonicalBusinessProfile } from "../../types/canonical.ts";
import type { ScanCoverage } from "./types.ts";

// ─── Mock Profile Factory ─────────────────────────────────────────────────────
const SCAN_A = crypto.randomUUID();
const SCAN_B = crypto.randomUUID();

function makeProfile(pages: { url: string; pageType: string; title: string; content: string }[], pagesScraped?: number): CanonicalBusinessProfile {
  return {
    identity: { id: "biz-123", projectId: "proj-123", name: "Test Biz", location: {} },
    reputation: {},
    contacts: [],
    technologies: [],
    analysisSource: "FULL_WEBSITE" as const,
    facts: [],
    knowledgeScore: 100,
    aggregateHash: "hash",
    digitalPresence: {
      pagesScraped: pagesScraped ?? pages.length,
      contentSnapshotLength: 1000,
      pages
    }
  };
}

const engine = new EvidenceEngine();

// ─── LIFECYCLE TESTS ──────────────────────────────────────────────────────────

Deno.test("Lifecycle: scan_id is required — throws on missing scanId", async () => {
  const profile = makeProfile([{ url: "/", pageType: "HOME", title: "H", content: "" }]);
  let threw = false;
  try {
    // @ts-ignore intentional invalid call
    await engine.extractEvidence(profile, undefined);
  } catch (e) {
    threw = true;
  }
  assert(threw, "Should throw when scanId is not provided");
});

Deno.test("Lifecycle: Scan A and Scan B produce different scan_ids in evidence", async () => {
  const profile = makeProfile([{ url: "/", pageType: "HOME", title: "H", content: "" }]);
  const [evA, evB] = await Promise.all([
    engine.extractEvidence(profile, SCAN_A),
    engine.extractEvidence(profile, SCAN_B),
  ]);

  assertEquals(evA[0].scan_id, SCAN_A);
  assertEquals(evB[0].scan_id, SCAN_B);
});

Deno.test("Lifecycle: Scan B does not overwrite Scan A — hashes are different", async () => {
  const profile = makeProfile([{ url: "/", pageType: "HOME", title: "H", content: "" }]);
  const [evA, evB] = await Promise.all([
    engine.extractEvidence(profile, SCAN_A),
    engine.extractEvidence(profile, SCAN_B),
  ]);

  // Same type and detector, same polarity/value — but different scan_id means different hash
  const hashA = evA[0].evidence_hash;
  const hashB = evB[0].evidence_hash;
  assertNotEquals(hashA, hashB, "Same evidence on two separate scans must produce different hashes");
});

Deno.test("Lifecycle: All evidence in a run carries the same scan_id", async () => {
  const profile = makeProfile([
    { url: "/", pageType: "HOME", title: "H", content: "wa.me/1234" },
    { url: "/contact", pageType: "CONTACT", title: "C", content: "call us" },
  ]);
  const ev = await engine.extractEvidence(profile, SCAN_A);
  const uniqueScanIds = new Set(ev.map(e => e.scan_id));
  assertEquals(uniqueScanIds.size, 1, "All evidence in a single run should share the same scan_id");
  assertEquals([...uniqueScanIds][0], SCAN_A);
});

// ─── VERSIONING TESTS ─────────────────────────────────────────────────────────

Deno.test("Versioning: engine_version matches constant on all evidence", async () => {
  const profile = makeProfile([{ url: "/", pageType: "HOME", title: "H", content: "" }]);
  const ev = await engine.extractEvidence(profile, SCAN_A);
  for (const e of ev) {
    assertEquals(e.engine_version, EVIDENCE_ENGINE_VERSION);
  }
});

Deno.test("Versioning: detector_version is a non-empty string on all evidence", async () => {
  const profile = makeProfile([{ url: "/", pageType: "HOME", title: "H", content: "" }]);
  const ev = await engine.extractEvidence(profile, SCAN_A);
  for (const e of ev) {
    assert(e.detector_version.length > 0, `detector_version is empty for type ${e.type}`);
  }
});

// ─── SEMANTIC COVERAGE TESTS ──────────────────────────────────────────────────

Deno.test("Coverage: Full crawl + target pages = ABSENT allowed", async () => {
  const profile = makeProfile([
    { url: "/", pageType: "HOME", title: "H", content: "welcome" },
    { url: "/contact", pageType: "CONTACT", title: "C", content: "email us" },
    { url: "/services", pageType: "SERVICES", title: "S", content: "our services" },
    { url: "/about", pageType: "ABOUT", title: "A", content: "about" },
    { url: "/faq", pageType: "UNKNOWN", title: "F", content: "faq" },
  ], 5);
  const ev = await engine.extractEvidence(profile, SCAN_A);
  const booking = ev.find(e => e.type === "BOOKING")!;
  assertEquals(booking.polarity, "ABSENT");
  assert(booking.confidence > 0, "ABSENT with high coverage should have non-zero confidence");
});

Deno.test("Coverage: 1/5 pages crawled = UNKNOWN for BOOKING", async () => {
  // pagesScraped=5 but only 1 page in `pages` (crawler discovered 5 but only got 1)
  const profile = makeProfile([
    { url: "/", pageType: "HOME", title: "H", content: "welcome" },
  ], 5);
  const ev = await engine.extractEvidence(profile, SCAN_A);
  const booking = ev.find(e => e.type === "BOOKING")!;
  assertEquals(booking.polarity, "UNKNOWN");
  assertEquals(booking.confidence, 0.0);
});

Deno.test("Coverage: Full crawl but no target pages = UNKNOWN for BOOKING", async () => {
  // 3/3 pages crawled, but all are blog posts (not HOME, CONTACT, SERVICES)
  const profile = makeProfile([
    { url: "/blog/1", pageType: "UNKNOWN", title: "B1", content: "post" },
    { url: "/blog/2", pageType: "UNKNOWN", title: "B2", content: "post" },
    { url: "/blog/3", pageType: "UNKNOWN", title: "B3", content: "post" },
  ], 3);
  const ev = await engine.extractEvidence(profile, SCAN_A);
  const booking = ev.find(e => e.type === "BOOKING")!;
  assertEquals(booking.polarity, "UNKNOWN", "No target pages = cannot prove absence");
});

// ─── POSITIVE EVIDENCE NOT PENALISED BY COVERAGE ─────────────────────────────

Deno.test("Coverage: wa.me on single crawled page = PRESENT with high confidence", async () => {
  const profile = makeProfile([
    { url: "/", pageType: "HOME", title: "H", content: "href='https://wa.me/201234567'" },
  ], 10); // discovered 10 pages, but we only scraped 1
  const ev = await engine.extractEvidence(profile, SCAN_A);
  const wa = ev.find(e => e.type === "WHATSAPP")!;
  assertEquals(wa.polarity, "PRESENT");
  // PRESENT must not be penalized by low crawl coverage
  assert(wa.confidence > 0.9, `Expected WHATSAPP PRESENT confidence > 0.9, got ${wa.confidence}`);
});

// ─── MATHEMATICAL PROPERTY TESTS (8A regression) ─────────────────────────────

Deno.test("Property: UNKNOWN always returns 0.0 confidence", () => {
  const calc = new ConfidenceCalculator();
  const conf = calc.calculate({ type: "BOOKING", polarity: "UNKNOWN", baseReliability: 0.99 });
  assertEquals(conf, 0.0);
});

Deno.test("Property: Increasing targetCoverage increases ABSENT confidence monotonically", () => {
  const calc = new ConfidenceCalculator();
  const base: ScanCoverage = {
    pagesDiscovered: 5, pagesScanned: 5, crawlCoverage: 1.0,
    targetPagesExpected: 3, targetPagesScanned: 0, targetCoverage: 0.0,
    jsRendered: false, blockedPages: 0, timedOutPages: 0
  };
  const c0 = calc.calculate({ type: "BOOKING", polarity: "ABSENT", baseReliability: 0.95, coverage: { ...base, targetPagesScanned: 0, targetCoverage: 0.0 } });
  const c1 = calc.calculate({ type: "BOOKING", polarity: "ABSENT", baseReliability: 0.95, coverage: { ...base, targetPagesScanned: 1, targetCoverage: 0.33 } });
  const c2 = calc.calculate({ type: "BOOKING", polarity: "ABSENT", baseReliability: 0.95, coverage: { ...base, targetPagesScanned: 3, targetCoverage: 1.0 } });
  assert(c1 > c0, `c1(${c1}) should be > c0(${c0})`);
  assert(c2 > c1, `c2(${c2}) should be > c1(${c1})`);
});

Deno.test("Property: Threshold boundary — crawlCoverage exactly 0.5 allows ABSENT", () => {
  const calc = new ConfidenceCalculator();
  const atThreshold: ScanCoverage = {
    pagesDiscovered: 10, pagesScanned: 5, crawlCoverage: 0.5,
    targetPagesExpected: 2, targetPagesScanned: 2, targetCoverage: 1.0,
    jsRendered: false, blockedPages: 0, timedOutPages: 0
  };
  assertEquals(calc.determineAbsencePolarity(atThreshold), "ABSENT");
});

Deno.test("Property: Threshold boundary — crawlCoverage 0.49 forces UNKNOWN", () => {
  const calc = new ConfidenceCalculator();
  const belowThreshold: ScanCoverage = {
    pagesDiscovered: 100, pagesScanned: 49, crawlCoverage: 0.49,
    targetPagesExpected: 2, targetPagesScanned: 2, targetCoverage: 1.0,
    jsRendered: false, blockedPages: 0, timedOutPages: 0
  };
  assertEquals(calc.determineAbsencePolarity(belowThreshold), "UNKNOWN");
});

Deno.test("Property: Threshold boundary — targetCoverage exactly 0.5 allows ABSENT", () => {
  const calc = new ConfidenceCalculator();
  const atTarget: ScanCoverage = {
    pagesDiscovered: 5, pagesScanned: 5, crawlCoverage: 1.0,
    targetPagesExpected: 2, targetPagesScanned: 1, targetCoverage: 0.5,
    jsRendered: false, blockedPages: 0, timedOutPages: 0
  };
  assertEquals(calc.determineAbsencePolarity(atTarget), "ABSENT");
});

Deno.test("Property: Threshold boundary — targetCoverage 0.49 forces UNKNOWN", () => {
  const calc = new ConfidenceCalculator();
  const belowTarget: ScanCoverage = {
    pagesDiscovered: 5, pagesScanned: 5, crawlCoverage: 1.0,
    targetPagesExpected: 4, targetPagesScanned: 1, targetCoverage: 0.25,
    jsRendered: false, blockedPages: 0, timedOutPages: 0
  };
  assertEquals(calc.determineAbsencePolarity(belowTarget), "UNKNOWN");
});

Deno.test("Lifecycle: Google Places evidence has scan_id and confidence = 1.0", async () => {
  const profile = makeProfile([], 0);
  (profile as any).reputation = { rating: 4.7, reviews: 230 };
  const ev = await engine.extractEvidence(profile, SCAN_A);
  const rating = ev.find(e => e.type === "GOOGLE_RATING")!;
  assertExists(rating);
  assertEquals(rating.scan_id, SCAN_A);
  assertEquals(rating.confidence, 1.0);
  assertEquals(rating.source, "GOOGLE_PLACES");
});
