import { EvidenceEngine } from '../../supabase/functions/_shared/intelligence/evidence/engine.ts';
import { CanonicalBusinessProfile } from '../../supabase/functions/_shared/types/canonical.ts';
import { DetectionEngine } from '../../supabase/functions/_shared/detection/DetectionEngine.ts';

// Mock DetectionEngine to return synthetic DetectionResults
const mockEngine = new EvidenceEngine();

async function runTruthTableTest() {
  console.log('══════════════════════════════════════════════════');
  console.log(' Phase 4-5 — Truth Table Invariant Gate');
  console.log('══════════════════════════════════════════════════\n');

  const coverageGood = {
    pagesDiscovered: 5, pagesScanned: 5, crawlCoverage: 1.0,
    targetPagesExpected: 2, targetPagesScanned: 2, targetCoverage: 1.0,
    jsRendered: false, blockedPages: 0, timedOutPages: 0
  };

  const coverageBad = {
    pagesDiscovered: 5, pagesScanned: 1, crawlCoverage: 0.2,
    targetPagesExpected: 2, targetPagesScanned: 0, targetCoverage: 0.0,
    jsRendered: false, blockedPages: 0, timedOutPages: 0
  };

  const tests = [
    // detected, ambiguous, coverage, expectedPolarity, confidenceScore
    { detected: true, ambiguous: false, coverage: coverageGood, expected: 'PRESENT', confidence: 100 },
    { detected: true, ambiguous: true,  coverage: coverageBad,  expected: 'PRESENT', confidence: 0 },
    { detected: false, ambiguous: true,  coverage: coverageGood, expected: 'UNKNOWN', confidence: 0 },
    { detected: false, ambiguous: true,  coverage: coverageBad,  expected: 'UNKNOWN', confidence: 90 },
    { detected: false, ambiguous: false, coverage: coverageGood, expected: 'ABSENT',  confidence: 100 },
    { detected: false, ambiguous: false, coverage: coverageGood, expected: 'ABSENT',  confidence: 0 }, // Score should not matter!
    { detected: false, ambiguous: false, coverage: coverageBad,  expected: 'UNKNOWN', confidence: 100 }
  ];

  let violations = 0;

  for (const t of tests) {
    const mockResult = {
      detected: t.detected,
      ambiguous: t.ambiguous,
      confidence: { score: t.confidence, reason: 'test' },
      evidence_level: 'UNKNOWN' as any,
      positive_signals: t.detected ? [{ type: 'test', value: 'yes', confidence: 90 }] : [],
      negative_signals: [],
      method: 'DOM' as any,
      metadata: {}
    };

    // We can test the private mapDetectionToEvidence method by casting to any
    const evidence = await (mockEngine as any).mapDetectionToEvidence(
      'test-biz', 'test-scan', 'WHATSAPP', 'WhatsAppDetector', mockResult, t.coverage, 0.99
    );

    const desc = `[detected=${t.detected}, ambiguous=${t.ambiguous}, coverage=${t.coverage === coverageGood ? 'good' : 'bad'}, score=${t.confidence}]`;
    if (evidence.polarity === t.expected) {
      console.log(`✅ ${desc} -> ${evidence.polarity}`);
    } else {
      console.error(`❌ ${desc} -> Expected ${t.expected}, got ${evidence.polarity}`);
      violations++;
    }
  }

  if (violations === 0) {
    console.log('\n✅ ALL TRUTH TABLE INVARIANTS PASSED.');
  } else {
    console.error(`\n❌ ${violations} VIOLATIONS FOUND.`);
    Deno.exit(1);
  }
}

async function runCrossDetectorTest() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' Phase 4-4 — Cross-Detector End-to-End Gate');
  console.log('══════════════════════════════════════════════════\n');

  // Let's create a fake profile with enough coverage to satisfy 'good coverage'
  const mockProfile = {
    identity: { id: 'test-lead' },
    digitalPresence: {
      pages: [
        { url: 'http://test.com', content: '<html><head></head><body>No tools here</body></html>', pageType: 'HOME', links: [] },
        { url: 'http://test.com/contact', content: '<html><body>Nothing here either</body></html>', pageType: 'CONTACT', links: [] },
        { url: 'http://test.com/booking', content: '<html><body>Book here</body></html>', pageType: 'BOOKING', links: [] }
      ],
      pagesScraped: 3, 
    },
    reputation: {}
  } as unknown as CanonicalBusinessProfile;

  const evidenceList = await mockEngine.extractEvidence(mockProfile, 'test-scan');

  const check = (type: string, expectedPolarity: string) => {
    const e = evidenceList.find(ev => ev.type === type);
    if (!e) {
      console.error(`❌ Missing evidence for ${type}`);
      return false;
    }
    if (e.polarity !== expectedPolarity) {
      console.error(`❌ ${type} polarity mismatch: Expected ${expectedPolarity}, got ${e.polarity}`);
      return false;
    }
    console.log(`✅ ${type} -> ${e.polarity}`);
    return true;
  };

  let allPassed = true;
  allPassed = check('WHATSAPP', 'ABSENT') && allPassed;
  allPassed = check('BOOKING', 'ABSENT') && allPassed;
  allPassed = check('CHATBOT', 'ABSENT') && allPassed;
  allPassed = check('TECHNOLOGY', 'ABSENT') && allPassed;
  allPassed = check('SOCIAL', 'ABSENT') && allPassed;
  allPassed = check('PHONE', 'ABSENT') && allPassed;

  if (allPassed) {
    console.log('\n✅ ALL DETECTORS CAN PRODUCE ABSENT SUCCESSFULLY.');
  } else {
    console.error(`\n❌ CROSS-DETECTOR GATE FAILED.`);
    Deno.exit(1);
  }
}

async function main() {
  await runTruthTableTest();
  await runCrossDetectorTest();
}

main().catch(console.error);
