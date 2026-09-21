import * as fs from 'fs';
import * as path from 'path';
import { WhatsAppDetector } from '../../supabase/functions/_shared/detection/detectors/WhatsAppDetector.ts';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const WHATSAPP_DATASET = process.env.WHATSAPP_DATASET  || 'phase-8b-whatsapp-v2-final';
const SNAPSHOT_DATASET = process.env.SNAPSHOT_DATASET  || 'phase-8b-v4-combined';
const REFERENCES_DIR   = path.resolve(process.cwd(), `scripts/validate/datasets/${WHATSAPP_DATASET}/references`);
const SNAPSHOTS_DIR    = path.resolve(process.cwd(), `scripts/validate/datasets/${SNAPSHOT_DATASET}/snapshots`);
const REPORT_MD        = 'detector_audit_results.md';
const REPORT_JSON      = 'detector_audit_results.json';

type Decision = 'YES' | 'NO_HIGH' | 'UNKNOWN';

const META_PHRASES = [
  'no evidence', 'not mentioned', 'not present', 'could not find',
  'does not state', 'is silent', 'no whatsapp',
];

function gate4Fail(msg: string): never {
  console.error(`\n[GATE 4 FAILED] ${msg}`);
  console.error('[GATE 4 FAILED] Detector evaluation aborted — fix the dataset first.\n');
  process.exit(1);
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 — Reference Integrity (Hard exit on any failure)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('══════════════════════════════════════════════════');
  console.log(' GATE 4 — Reference Integrity');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Oracle dataset:   ${WHATSAPP_DATASET}`);
  console.log(`  Snapshot dataset: ${SNAPSHOT_DATASET}`);
  console.log('');

  if (!fs.existsSync(REFERENCES_DIR)) gate4Fail(`References dir not found: ${REFERENCES_DIR}`);
  if (!fs.existsSync(SNAPSHOTS_DIR))  gate4Fail(`Snapshots dir not found: ${SNAPSHOTS_DIR}`);

  const refFiles  = fs.readdirSync(REFERENCES_DIR).filter(f => f.endsWith('.whatsapp.reference.json'));
  const snapFiles = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.snapshot.json'));

  // 1. Count
  if (refFiles.length  !== 87) gate4Fail(`Expected 87 references, found ${refFiles.length}`);
  if (snapFiles.length !== 87) gate4Fail(`Expected 87 snapshots, found ${snapFiles.length}`);
  console.log('  ✓ Count: 87 references, 87 snapshots');

  // 2. Unique IDs — no duplicates
  const refMap  = new Map<string, string>(); // uuid → filename
  const snapMap = new Map<string, string>();
  for (const f of refFiles)  refMap.set(f.split('.')[0], f);
  for (const f of snapFiles) snapMap.set(f.split('.')[0], f);
  if (refMap.size  !== 87) gate4Fail(`Duplicate reference IDs detected (${refMap.size} unique)`);
  if (snapMap.size !== 87) gate4Fail(`Duplicate snapshot IDs detected (${snapMap.size} unique)`);
  console.log('  ✓ No duplicate IDs');

  // 3. 1:1 mapping
  const orphans = [...refMap.keys()].filter(id => !snapMap.has(id));
  const missing = [...snapMap.keys()].filter(id => !refMap.has(id));
  if (orphans.length > 0) gate4Fail(`Orphan references (no snapshot): ${orphans.join(', ')}`);
  if (missing.length > 0) gate4Fail(`Missing references (snapshot exists): ${missing.join(', ')}`);
  console.log('  ✓ 1:1 mapping — no orphans, no missing');

  // 4. Per-reference: sha256 integrity + 100% metadata consistency
  let baseline_model: string | null = null;
  let baseline_prompt_sha256: string | null = null;
  let baseline_extractor: string | null = null;
  let baseline_contract: string | null = null;
  let baseline_proj: string | null = null;
  let hashMismatches = 0;
  let missingProj = 0;
  const metaErrors: string[] = [];

  for (const [refId] of refMap) {
    const ref  = JSON.parse(fs.readFileSync(path.join(REFERENCES_DIR, `${refId}.whatsapp.reference.json`), 'utf8'));
    const snap = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR,  `${refId}.snapshot.json`), 'utf8'));

    if (ref.snapshot_sha256 !== snap.snapshot_sha256) {
      console.error(`  ✗ sha256 mismatch ${refId}: ref=${ref.snapshot_sha256} snap=${snap.snapshot_sha256}`);
      hashMismatches++;
    }
    if (!ref.input_projection_sha256) missingProj++;

    if (!baseline_model) {
      baseline_model        = ref.model;
      baseline_prompt_sha256 = ref.prompt_sha256;
      baseline_extractor    = ref.extractor_version;
      baseline_contract     = ref.reference_contract_version;
      baseline_proj         = ref.input_projection_version;
    } else {
      if (ref.model                    !== baseline_model ||
          ref.prompt_sha256            !== baseline_prompt_sha256 ||
          ref.extractor_version        !== baseline_extractor ||
          ref.reference_contract_version !== baseline_contract ||
          ref.input_projection_version !== baseline_proj) {
        metaErrors.push(refId.substring(0, 8));
      }
    }
  }

  if (hashMismatches > 0)  gate4Fail(`${hashMismatches} snapshot_sha256 mismatches`);
  if (missingProj > 0)     gate4Fail(`${missingProj} references missing input_projection_sha256`);
  if (metaErrors.length > 0) gate4Fail(`Metadata inconsistencies in: ${metaErrors.join(', ')}`);

  console.log('  ✓ All 87 snapshot_sha256 valid');
  console.log('  ✓ All 87 input_projection_sha256 present');
  console.log('  ✓ 100% metadata consistency across all 87 references');
  console.log(`      model:             ${baseline_model}`);
  console.log(`      prompt_sha256:     ${baseline_prompt_sha256}`);
  console.log(`      extractor_version: ${baseline_extractor}`);
  console.log(`      contract_version:  ${baseline_contract}`);
  console.log(`      proj_version:      ${baseline_proj}`);
  console.log('');
  console.log('  ══ GATE 4 PASSED ══');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERENCE SANITY CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('══════════════════════════════════════════════════');
  console.log(' Reference Sanity Check');
  console.log('══════════════════════════════════════════════════');

  const refDist: Record<Decision, number> = { YES: 0, NO_HIGH: 0, UNKNOWN: 0 };
  const loadedRefs: Array<{ id: string; ref: any; snapshot: any }> = [];
  let exclusionTotal = 0;
  let exclusionRealEvidence = 0;
  const cardinalityViolations: string[] = [];

  for (const [refId] of refMap) {
    const ref  = JSON.parse(fs.readFileSync(path.join(REFERENCES_DIR, `${refId}.whatsapp.reference.json`), 'utf8'));
    const snap = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR,  `${refId}.snapshot.json`), 'utf8'));
    loadedRefs.push({ id: refId, ref, snapshot: snap });

    const dec: Decision = ref.evaluation.decision === 'NO HIGH' ? 'NO_HIGH' : ref.evaluation.decision;
    refDist[dec]++;

    // whatsapp_explicit_exclusion audit
    for (const sig of (ref.evidence.negativeSignals || []) as any[]) {
      if (sig.type === 'whatsapp_explicit_exclusion') {
        exclusionTotal++;
        const e = (sig.evidence || '').toLowerCase();
        if (!META_PHRASES.some(p => e.includes(p))) exclusionRealEvidence++;
      }
    }

    // Cardinality audit (should always be 0 given contract v2 constraints)
    const seen = new Set<string>();
    for (const sig of [...(ref.evidence.positiveSignals || []), ...(ref.evidence.negativeSignals || [])] as any[]) {
      const key = `${sig.source}::${sig.type}`;
      if (seen.has(key)) cardinalityViolations.push(`${refId.substring(0,8)} → ${key}`);
      seen.add(key);
    }
  }

  console.log(`  Distribution:`);
  console.log(`    YES:     ${refDist.YES}`);
  console.log(`    NO HIGH: ${refDist.NO_HIGH}`);
  console.log(`    UNKNOWN: ${refDist.UNKNOWN}`);
  console.log('');

  if (exclusionTotal === 0) {
    console.log('  ✓ 0 whatsapp_explicit_exclusion signals (conservative contract)');
  } else {
    const metaExclusions = exclusionTotal - exclusionRealEvidence;
    console.log(`  whatsapp_explicit_exclusion: ${exclusionTotal} total`);
    console.log(`    with real evidence: ${exclusionRealEvidence}`);
    if (metaExclusions > 0) console.warn(`  ⚠ ${metaExclusions} exclusion(s) with potential meta-evidence`);
    else console.log('  ✓ 0 meta-evidence exclusions');
  }

  if (cardinalityViolations.length > 0) {
    console.error(`  ✗ Cardinality violations: ${cardinalityViolations.join(', ')}`);
  } else {
    console.log('  ✓ 0 cardinality violations');
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // DETECTOR EVALUATION  (read-only — no production code modified)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('══════════════════════════════════════════════════');
  console.log(' Detector Evaluation (read-only)');
  console.log('══════════════════════════════════════════════════');
  console.log('  NOTE: WhatsAppDetector is instantiated directly.');
  console.log('  No DB, cache, pipeline, or production state is touched.');
  console.log('');

  const detector = new WhatsAppDetector();
  const detDist: Record<Decision, number> = { YES: 0, NO_HIGH: 0, UNKNOWN: 0 };
  const confusion: Record<Decision, Record<Decision, number>> = {
    YES:     { YES: 0, NO_HIGH: 0, UNKNOWN: 0 },
    NO_HIGH: { YES: 0, NO_HIGH: 0, UNKNOWN: 0 },
    UNKNOWN: { YES: 0, NO_HIGH: 0, UNKNOWN: 0 },
  };
  const cv = { FALSE_ABSENCE: 0, UNSUPPORTED_POSITIVE: 0, MISSED_POSITIVE: 0, MISSED_EXCLUSION: 0 };
  const disagreements: any[] = [];
  let exactAgreement = 0;

  for (const { id: refId, ref, snapshot } of loadedRefs) {
    // Combine HTML exactly as production EvidenceEngine does
    const combinedHtml = (snapshot.pages || [])
      .map((p: any) => `<!-- PAGE: ${p.route || p.url} -->\n${p.html || ''}`)
      .join('\n');

    const det = detector.detect(combinedHtml);

    const refDec: Decision = ref.evaluation.decision === 'NO HIGH' ? 'NO_HIGH' : ref.evaluation.decision;
    // WhatsAppDetector has no NO_HIGH concept — absence → UNKNOWN
    const detDec: Decision = det.detected ? 'YES' : 'UNKNOWN';

    detDist[detDec]++;
    confusion[refDec][detDec]++;

    if (refDec === detDec) {
      exactAgreement++;
    } else {
      let cls = 'OTHER_DISAGREEMENT';
      if ((refDec === 'UNKNOWN' || refDec === 'YES') && detDec === 'NO_HIGH') {
        cls = 'FALSE_ABSENCE'; cv.FALSE_ABSENCE++;
      } else if ((refDec === 'UNKNOWN' || refDec === 'NO_HIGH') && detDec === 'YES') {
        cls = 'UNSUPPORTED_POSITIVE'; cv.UNSUPPORTED_POSITIVE++;
      } else if (refDec === 'YES' && detDec === 'UNKNOWN') {
        cls = 'MISSED_POSITIVE'; cv.MISSED_POSITIVE++;
      } else if (refDec === 'NO_HIGH' && detDec === 'UNKNOWN') {
        cls = 'MISSED_EXCLUSION'; cv.MISSED_EXCLUSION++;
      }
      disagreements.push({
        lead_id:         refId,
        snapshot_url:    snapshot.pages?.[0]?.url ?? null,
        snapshot_sha256: ref.snapshot_sha256,
        classification:  cls,
        reference: {
          decision:        refDec,
          positiveSignals: ref.evidence.positiveSignals,
          negativeSignals: ref.evidence.negativeSignals,
          reasoning:       ref.evaluation.reasoning,
        },
        detector: {
          decision:        detDec,
          detected:        det.detected,
          positiveSignals: det.positive_signals,
          negativeSignals: det.negative_signals,
        },
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT GENERATION
  // ═══════════════════════════════════════════════════════════════════════════
  const p = (n: number, w = 5) => String(n).padStart(w);
  const pct = ((exactAgreement / 87) * 100).toFixed(1);

  const report = `# Detector Audit Report
**Oracle**: \`${WHATSAPP_DATASET}\`
**Generated**: ${new Date().toISOString()}

---

## Gate 4 — PASSED ✓

| Field | Value |
|---|---|
| prompt_sha256 | \`${baseline_prompt_sha256}\` |
| model | ${baseline_model} |
| extractor_version | ${baseline_extractor} |
| contract_version | ${baseline_contract} |
| proj_version | ${baseline_proj} |

---

## Summary

| Metric | Value |
|---|---|
| Snapshots evaluated | 87 |
| Exact agreement | **${exactAgreement}/87 (${pct}%)** |

---

## Reference Distribution (Frozen Oracle under Contract V2)

> These numbers reflect what the LLM Reference Oracle found under the V2 contract constraints.
> They do NOT represent ground truth. They are the baseline for evaluating the Detector.

| Decision | Count |
|---|---:|
| YES | ${refDist.YES} |
| NO HIGH | ${refDist.NO_HIGH} |
| UNKNOWN | ${refDist.UNKNOWN} |

---

## Detector Distribution

| Decision | Count |
|---|---:|
| YES | ${detDist.YES} |
| NO HIGH | ${detDist.NO_HIGH} |
| UNKNOWN | ${detDist.UNKNOWN} |

---

## Confusion Matrix

|  | Det: YES | Det: NO HIGH | Det: UNKNOWN |
|---|---:|---:|---:|
| **Ref: YES** | ${p(confusion.YES.YES)} | ${p(confusion.YES.NO_HIGH)} | ${p(confusion.YES.UNKNOWN)} |
| **Ref: NO HIGH** | ${p(confusion.NO_HIGH.YES)} | ${p(confusion.NO_HIGH.NO_HIGH)} | ${p(confusion.NO_HIGH.UNKNOWN)} |
| **Ref: UNKNOWN** | ${p(confusion.UNKNOWN.YES)} | ${p(confusion.UNKNOWN.NO_HIGH)} | ${p(confusion.UNKNOWN.UNKNOWN)} |

---

## Contract Violations

> Contract violations take priority over all other disagreements.
> They represent cases where the Detector makes a **confident claim** the Reference cannot support.

| Type | Count | Severity | Meaning |
|---|---:|---|---|
| FALSE_ABSENCE | ${cv.FALSE_ABSENCE} | 🔴 Critical | Detector asserts absence with no reference exclusion evidence |
| UNSUPPORTED_POSITIVE | ${cv.UNSUPPORTED_POSITIVE} | 🟠 High | Detector says YES with no reference positive signal |
| MISSED_POSITIVE | ${cv.MISSED_POSITIVE} | 🟡 Medium | Reference has strong evidence; Detector missed it |
| MISSED_EXCLUSION | ${cv.MISSED_EXCLUSION} | 🟡 Medium | Reference has explicit exclusion; Detector missed it |

---

## Disagreements (${disagreements.length})

Full evidence for each disagreement is available in \`${REPORT_JSON}\`.

${disagreements.map((d, i) => {
  const posSigs = (d.reference.positiveSignals || []).map((s: any) => `\`${s.type}\` (${s.strength}) — "${s.evidence}"`).join('; ') || '(none)';
  const negSigs = (d.reference.negativeSignals || []).map((s: any) => `\`${s.type}\` (${s.strength}) — "${s.evidence}"`).join('; ') || '(none)';
  const detPos = (d.detector.positiveSignals || []).map((s: any) => `\`${s.type}\``).join(', ') || '(none)';
  return `### ${i + 1}. [${d.classification}] \`${d.lead_id.substring(0, 8)}\`
- **URL**: ${d.snapshot_url || 'N/A'}
- **Reference** → ${d.reference.decision}
  - Positive: ${posSigs}
  - Negative: ${negSigs}
- **Detector** → ${d.detector.decision}
  - Matched patterns: ${detPos}`;
}).join('\n\n')}
`;

  fs.writeFileSync(REPORT_MD, report);
  fs.writeFileSync(REPORT_JSON, JSON.stringify({
    meta: {
      dataset: WHATSAPP_DATASET,
      prompt_sha256: baseline_prompt_sha256,
      model: baseline_model,
      extractor_version: baseline_extractor,
      contract_version: baseline_contract,
      proj_version: baseline_proj,
      generated_at: new Date().toISOString(),
    },
    summary: { total: 87, exactAgreement, pct: Number(pct), refDist, detDist },
    confusion,
    contractViolations: cv,
    disagreements,
  }, null, 2));

  console.log(report);
  console.log(`\nReports written:`);
  console.log(`  ${REPORT_MD}`);
  console.log(`  ${REPORT_JSON}`);
}

main().catch(e => { console.error(e); process.exit(1); });
