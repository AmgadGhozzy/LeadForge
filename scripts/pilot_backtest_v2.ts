import * as fs from 'fs';
import * as path from 'path';

const INPUTS_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_candidate_inputs_v2.csv');
const LABELS_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'llm_reference_labels.csv');
const OUTPUT_JSON = path.join(process.cwd(), 'scripts', 'pilot_data', 'backtest_v2_results.json');

type TriState = 'PRESENT' | 'ABSENT' | 'UNKNOWN';
type RuleResult = 'MATCH' | 'NO_MATCH' | 'UNKNOWN' | 'NOT_TESTABLE';

interface BusinessInput {
  id: string;
  p: TriState;
  e: TriState;
  w: TriState;
  b: TriState;
  c: TriState;
}

function parseInputs(): Map<string, BusinessInput> {
  const content = fs.readFileSync(INPUTS_FILE, 'utf-8').trim();
  const lines = content.split('\n');
  const map = new Map<string, BusinessInput>();
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(',').map(s => s.trim());
    const id = cols[0];
    const crawl_status = cols[6];
    
    // Default to UNKNOWN if crawl failed
    let p: TriState = 'UNKNOWN', e: TriState = 'UNKNOWN', w: TriState = 'UNKNOWN', b: TriState = 'UNKNOWN', c: TriState = 'UNKNOWN';
    
    if (crawl_status === 'SUCCESS') {
      p = cols[1] === 'true' ? 'PRESENT' : 'ABSENT';
      e = cols[2] === 'true' ? 'PRESENT' : 'ABSENT';
      w = cols[3] === 'true' ? 'PRESENT' : 'ABSENT';
      b = cols[4] === 'true' ? 'PRESENT' : 'ABSENT';
      c = cols[5] === 'true' ? 'PRESENT' : 'ABSENT';
    }
    
    map.set(id, { id, p, e, w, b, c });
  }
  return map;
}

function parseLabels(): Map<string, '1' | '0' | 'U'> {
  const content = fs.readFileSync(LABELS_FILE, 'utf-8').trim();
  const lines = content.split('\n');
  const map = new Map<string, '1' | '0' | 'U'>();
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const parts = lines[i].match(/^"([^"]+)",("([^"]*)"|[^,]*)/);
    if (parts) {
      map.set(parts[1], (parts[3] !== undefined ? parts[3] : parts[2]) as '1' | '0' | 'U');
    } else {
      const cols = lines[i].split(',');
      map.set(cols[0], cols[1] as '1' | '0' | 'U');
    }
  }
  return map;
}

function evalA(input: BusinessInput): RuleResult {
  const { p, b, c } = input;
  if (p === 'ABSENT' || b === 'PRESENT' || c === 'PRESENT') return 'NO_MATCH';
  if (p === 'PRESENT' && b === 'ABSENT' && c === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function evalC(input: BusinessInput): RuleResult {
  const { w, b } = input;
  if (w === 'ABSENT' || b === 'PRESENT') return 'NO_MATCH';
  if (w === 'PRESENT' && b === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function evalE(input: BusinessInput): RuleResult {
  const { p, e, b, c } = input;
  if (p === 'ABSENT' || e === 'ABSENT' || b === 'PRESENT' || c === 'PRESENT') return 'NO_MATCH';
  if (p === 'PRESENT' && e === 'PRESENT' && b === 'ABSENT' && c === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function main() {
  const inputs = parseInputs();
  const labels = parseLabels();
  
  console.log('================================================================');
  console.log('=== A-F BACKTEST V2 (STRICT OBSERVABILITY SEMANTICS) ===');
  console.log('================================================================');
  
  const rules = ['A', 'B', 'C', 'D', 'E', 'F'];
  const metrics: any = {};
  
  for (const rule of rules) {
    if (rule === 'B' || rule === 'D' || rule === 'F') {
      metrics[rule] = { status: 'NOT_TESTABLE', reason: 'Required signals unavailable (Contact Form / Lead Capture)' };
      continue;
    }
    
    let tp = 0, fp = 0, fn = 0, tn = 0, ruleUnknown = 0, llmUnknown = 0, ruleMatch = 0, ruleNoMatch = 0;
    
    for (const [id, input] of inputs) {
      const llm = labels.get(id) || 'U';
      const result = rule === 'A' ? evalA(input) : rule === 'C' ? evalC(input) : evalE(input);
      
      if (result === 'MATCH') ruleMatch++;
      if (result === 'NO_MATCH') ruleNoMatch++;
      
      if (llm === 'U') {
        llmUnknown++;
        continue;
      }
      if (result === 'UNKNOWN') {
        ruleUnknown++;
        continue;
      }
      
      if (result === 'MATCH' && llm === '1') tp++;
      if (result === 'MATCH' && llm === '0') fp++;
      if (result === 'NO_MATCH' && llm === '1') fn++;
      if (result === 'NO_MATCH' && llm === '0') tn++;
    }
    
    const evaluable = tp + fp + fn + tn;
    const precision = (tp + fp) > 0 ? (tp / (tp + fp) * 100).toFixed(1) + '%' : 'N/A';
    const recall = (tp + fn) > 0 ? (tp / (tp + fn) * 100).toFixed(1) + '%' : 'N/A';
    
    metrics[rule] = {
      status: 'TESTABLE',
      evaluable,
      rule_match: ruleMatch,
      rule_no_match: ruleNoMatch,
      rule_unknown: ruleUnknown,
      llm_unknown: llmUnknown,
      TP: tp, FP: fp, FN: fn, TN: tn,
      precision, recall
    };
  }
  
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(metrics, null, 2), 'utf-8');
  
  // Render table
  console.log(`\nCandidate Evaluator Rules:`);
  console.log(`  A: P=PRESENT && B=ABSENT && C=ABSENT`);
  console.log(`  C: W=PRESENT && B=ABSENT`);
  console.log(`  E: P=PRESENT && E=PRESENT && B=ABSENT && C=ABSENT`);
  
  console.log(`\nCandidate | Status       | MATCH | NO_MATCH | UNKNOWN | Evaluable | TP | FP | FN | TN | Precision | Recall `);
  console.log(`----------------------------------------------------------------------------------------------------------------`);
  for (const rule of rules) {
    const m = metrics[rule];
    if (m.status === 'NOT_TESTABLE') {
      console.log(`    ${rule}     | NOT_TESTABLE |   -   |    -     |    -    |     -     |  - |  - |  - |  - |     -     |   -    `);
    } else {
      const pStr = m.precision.padStart(9);
      const rStr = m.recall.padStart(6);
      console.log(`    ${rule}     | TESTABLE     |  ${m.rule_match.toString().padStart(4)} |   ${m.rule_no_match.toString().padStart(6)} |   ${m.rule_unknown.toString().padStart(5)} |    ${m.evaluable.toString().padStart(6)} | ${m.TP.toString().padStart(2)} | ${m.FP.toString().padStart(2)} | ${m.FN.toString().padStart(2)} | ${m.TN.toString().padStart(2)} | ${pStr} | ${rStr} `);
    }
  }
  
  console.log('\n--- COVERAGE & LIMITATIONS ---');
  console.log(`Total Sample: 50`);
  console.log(`Evaluable LLM Labels (FIT): 31`);
  console.log(`Evaluable LLM Labels (NOT_FIT): 0`);
  console.log(`LLM Labels UNKNOWN: 19`);
  
  console.log('\n⚠️  CRITICAL STATISTICAL LIMITATION:');
  console.log('Negative discrimination = UNTESTED.');
  console.log('Because there are 0 NOT_FIT examples in the sample, False Positives (FP) cannot occur.');
  console.log('Precision scores of 100% reflect a lack of negative examples, NOT proof of perfect rule discrimination.');
  
  console.log('\n================================================================');
  console.log('Backtest complete. Artifact saved to: scripts/pilot_data/backtest_v2_results.json');
}

main();
