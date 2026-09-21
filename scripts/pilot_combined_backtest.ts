// Pilot Combined Backtest: 31 FIT + 15 NOT_FIT (65 Total Candidates)
// Adheres strictly to the Frozen Observability Contract (pilot_backtest_v2.ts).
// ZERO-MUTATION GATE: reads ONLY frozen files; writes ONLY combined_backtest_report.json.

import * as fs from 'fs';
import * as path from 'path';

const FIT_INPUTS_FILE   = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_candidate_inputs_v2.csv');
const FIT_LABELS_FILE   = path.join(process.cwd(), 'scripts', 'pilot_data', 'llm_reference_labels.csv');
const NEG_RESULTS_FILE  = path.join(process.cwd(), 'scripts', 'pilot_data', 'negative_control_results.json');
const OUTPUT_REPORT     = path.join(process.cwd(), 'scripts', 'pilot_data', 'combined_backtest_report.json');

type TriState = 'PRESENT' | 'ABSENT' | 'UNKNOWN';
type RuleResult = 'MATCH' | 'NO_MATCH' | 'UNKNOWN';
type GroundTruth = '1' | '0' | 'U';

interface BusinessRecord {
  id: string;
  source: 'PILOT_50' | 'NEGATIVE_CONTROL_15';
  crawl_status: string;
  ground_truth: GroundTruth;
  p: TriState;
  e: TriState;
  w: TriState;
  b: TriState;
  c: TriState;
}

// Frozen Rule Definitions
function evalA(r: BusinessRecord): RuleResult {
  const { p, b, c } = r;
  if (p === 'ABSENT' || b === 'PRESENT' || c === 'PRESENT') return 'NO_MATCH';
  if (p === 'PRESENT' && b === 'ABSENT' && c === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function evalC(r: BusinessRecord): RuleResult {
  const { w, b } = r;
  if (w === 'ABSENT' || b === 'PRESENT') return 'NO_MATCH';
  if (w === 'PRESENT' && b === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function evalE(r: BusinessRecord): RuleResult {
  const { p, e, b, c } = r;
  if (p === 'ABSENT' || e === 'ABSENT' || b === 'PRESENT' || c === 'PRESENT') return 'NO_MATCH';
  if (p === 'PRESENT' && e === 'PRESENT' && b === 'ABSENT' && c === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function loadPilot50(): BusinessRecord[] {
  const labelsContent = fs.readFileSync(FIT_LABELS_FILE, 'utf-8').trim();
  const labelLines = labelsContent.split('\n');
  const labelMap = new Map<string, GroundTruth>();

  for (let i = 1; i < labelLines.length; i++) {
    if (!labelLines[i]) continue;
    const match = labelLines[i].match(/^"([^"]+)",("([^"]*)"|[^,]*)/);
    if (match) {
      labelMap.set(match[1], (match[3] !== undefined ? match[3] : match[2]) as GroundTruth);
    } else {
      const cols = labelLines[i].split(',');
      labelMap.set(cols[0], cols[1] as GroundTruth);
    }
  }

  const inputsContent = fs.readFileSync(FIT_INPUTS_FILE, 'utf-8').trim();
  const inputLines = inputsContent.split('\n');
  const records: BusinessRecord[] = [];

  for (let i = 1; i < inputLines.length; i++) {
    if (!inputLines[i]) continue;
    const cols = inputLines[i].split(',').map(s => s.trim());
    const id = cols[0];
    const crawl_status = cols[6];

    let p: TriState = 'UNKNOWN', e: TriState = 'UNKNOWN', w: TriState = 'UNKNOWN', b: TriState = 'UNKNOWN', c: TriState = 'UNKNOWN';
    if (crawl_status === 'SUCCESS') {
      p = cols[1] === 'true' ? 'PRESENT' : 'ABSENT';
      e = cols[2] === 'true' ? 'PRESENT' : 'ABSENT';
      w = cols[3] === 'true' ? 'PRESENT' : 'ABSENT';
      b = cols[4] === 'true' ? 'PRESENT' : 'ABSENT';
      c = cols[5] === 'true' ? 'PRESENT' : 'ABSENT';
    }

    records.push({
      id,
      source: 'PILOT_50',
      crawl_status,
      ground_truth: labelMap.get(id) || 'U',
      p, e, w, b, c
    });
  }

  return records;
}

function loadNegativeControl15(): BusinessRecord[] {
  const raw = JSON.parse(fs.readFileSync(NEG_RESULTS_FILE, 'utf-8'));
  const records: BusinessRecord[] = [];

  for (const r of raw.results) {
    let p: TriState = 'UNKNOWN', e: TriState = 'UNKNOWN', w: TriState = 'UNKNOWN', b: TriState = 'UNKNOWN', c: TriState = 'UNKNOWN';
    if (r.crawl_status === 'SUCCESS') {
      p = r.has_phone === true ? 'PRESENT' : 'ABSENT';
      e = r.has_email === true ? 'PRESENT' : 'ABSENT';
      w = r.has_whatsapp === true ? 'PRESENT' : 'ABSENT';
      b = r.has_booking === true ? 'PRESENT' : 'ABSENT';
      c = r.has_chatbot === true ? 'PRESENT' : 'ABSENT';
    }

    records.push({
      id: r.business_id,
      source: 'NEGATIVE_CONTROL_15',
      crawl_status: r.crawl_status,
      ground_truth: '0', // Known NOT_FIT
      p, e, w, b, c
    });
  }

  return records;
}

function main() {
  console.log('========================================================================');
  console.log('=== COMBINED BACKTEST: 31 FIT + 15 NOT_FIT (STRICT OBSERVABILITY) ===');
  console.log('========================================================================\n');

  const pilotRecords = loadPilot50();
  const negRecords = loadNegativeControl15();
  const allRecords = [...pilotRecords, ...negRecords];

  const total = allRecords.length;
  const fitGroundTruth = allRecords.filter(r => r.ground_truth === '1').length;
  const notFitGroundTruth = allRecords.filter(r => r.ground_truth === '0').length;
  const unknownGroundTruth = allRecords.filter(r => r.ground_truth === 'U').length;

  console.log(`Total Records: ${total} (Pilot: ${pilotRecords.length}, Negative Control: ${negRecords.length})`);
  console.log(`Ground Truth Breakdown: FIT (1)=${fitGroundTruth}, NOT_FIT (0)=${notFitGroundTruth}, UNKNOWN (U)=${unknownGroundTruth}\n`);

  const rules = ['A', 'C', 'E'] as const;
  const results: Record<string, any> = {};

  for (const rule of rules) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    let ruleUnknown = 0;
    let groundUnknown = 0;

    for (const r of allRecords) {
      if (r.ground_truth === 'U') {
        groundUnknown++;
        continue;
      }

      const res = rule === 'A' ? evalA(r) : rule === 'C' ? evalC(r) : evalE(r);

      if (res === 'UNKNOWN') {
        ruleUnknown++;
        continue;
      }

      if (res === 'MATCH') {
        if (r.ground_truth === '1') tp++;
        else if (r.ground_truth === '0') fp++;
      } else if (res === 'NO_MATCH') {
        if (r.ground_truth === '1') fn++;
        else if (r.ground_truth === '0') tn++;
      }
    }

    const evaluable = tp + fp + fn + tn;
    const precisionNum = (tp + fp) > 0 ? (tp / (tp + fp)) : 0;
    const recallNum    = (tp + fn) > 0 ? (tp / (tp + fn)) : 0;
    const specificityNum = (tn + fp) > 0 ? (tn / (tn + fp)) : 0;
    const f1Num = (precisionNum + recallNum) > 0 ? (2 * precisionNum * recallNum) / (precisionNum + recallNum) : 0;

    results[rule] = {
      status: 'TESTABLE',
      evaluable,
      TP: tp,
      FP: fp,
      FN: fn,
      TN: tn,
      rule_unknown: ruleUnknown,
      ground_unknown: groundUnknown,
      precision: (precisionNum * 100).toFixed(2) + '%',
      recall: (recallNum * 100).toFixed(2) + '%',
      specificity: (specificityNum * 100).toFixed(2) + '%',
      f1_score: (f1Num * 100).toFixed(2) + '%'
    };
  }

  console.log('Rule | Evaluable | TP | FP | FN | TN | Precision | Recall | Specificity | F1 Score');
  console.log('----------------------------------------------------------------------------------');
  for (const rule of rules) {
    const r = results[rule];
    console.log(
      `  ${rule}  |     ${r.evaluable.toString().padStart(2)}    | ${r.TP.toString().padStart(2)} | ${r.FP.toString().padStart(2)} | ${r.FN.toString().padStart(2)} | ${r.TN.toString().padStart(2)} |   ${r.precision.padStart(7)} |  ${r.recall.padStart(6)} |     ${r.specificity.padStart(7)} |  ${r.f1_score.padStart(6)}`
    );
  }

  const report = {
    timestamp: new Date().toISOString(),
    contract: 'Strict Frozen Observability Contract (pilot_backtest_v2.ts)',
    dataset: {
      total: allRecords.length,
      pilot_sample: pilotRecords.length,
      negative_control: negRecords.length,
      ground_truth_fit: fitGroundTruth,
      ground_truth_not_fit: notFitGroundTruth,
      ground_truth_unknown: unknownGroundTruth
    },
    metrics: results
  };

  fs.writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n========================================================================`);
  console.log(`Combined Backtest complete. Report saved to: ${OUTPUT_REPORT}`);
}

main();
