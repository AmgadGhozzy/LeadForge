import * as fs from 'fs';
import * as path from 'path';

const INPUTS_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_candidate_inputs_v2.csv');
const LABELS_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'llm_reference_labels.csv');

type TriState = 'PRESENT' | 'ABSENT' | 'UNKNOWN';
type RuleResult = 'MATCH' | 'NO_MATCH' | 'UNKNOWN';

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

function evalA(i: BusinessInput): boolean {
  return i.p === 'PRESENT' && i.b === 'ABSENT' && i.c === 'ABSENT';
}

function evalC(i: BusinessInput): boolean {
  return i.w === 'PRESENT' && i.b === 'ABSENT';
}

function evalE(i: BusinessInput): boolean {
  return i.p === 'PRESENT' && i.e === 'PRESENT' && i.b === 'ABSENT' && i.c === 'ABSENT';
}

function main() {
  const inputs = parseInputs();
  const labels = parseLabels();
  
  const sets = {
    'A_only': { FIT: 0, UNKNOWN: 0 },
    'C_only': { FIT: 0, UNKNOWN: 0 },
    'E_only': { FIT: 0, UNKNOWN: 0 },
    'A_and_C_not_E': { FIT: 0, UNKNOWN: 0 },
    'A_and_E_not_C': { FIT: 0, UNKNOWN: 0 },
    'C_and_E_not_A': { FIT: 0, UNKNOWN: 0 },
    'A_and_C_and_E': { FIT: 0, UNKNOWN: 0 },
  };

  for (const [id, input] of inputs) {
    const label = labels.get(id) || 'U';
    // Only analyze evaluable cases for overlap? No, any match.
    // If it's a match, we count it towards FIT or UNKNOWN.
    const matchA = evalA(input);
    const matchC = evalC(input);
    const matchE = evalE(input);
    
    if (!matchA && !matchC && !matchE) continue;
    
    const cat = label === '1' ? 'FIT' : 'UNKNOWN';
    
    if (matchA && !matchC && !matchE) sets['A_only'][cat]++;
    else if (!matchA && matchC && !matchE) sets['C_only'][cat]++;
    else if (!matchA && !matchC && matchE) sets['E_only'][cat]++;
    else if (matchA && matchC && !matchE) sets['A_and_C_not_E'][cat]++;
    else if (matchA && !matchC && matchE) sets['A_and_E_not_C'][cat]++;
    else if (!matchA && matchC && matchE) sets['C_and_E_not_A'][cat]++;
    else if (matchA && matchC && matchE) sets['A_and_C_and_E'][cat]++;
  }

  console.log('================================================================');
  console.log('=== CANDIDATE OVERLAP ANALYSIS (A, C, E) ===');
  console.log('================================================================');
  console.log('Subsets Breakdown:');
  console.log(`  A only:         FIT=${sets['A_only'].FIT}, UNKNOWN=${sets['A_only'].UNKNOWN}`);
  console.log(`  C only:         FIT=${sets['C_only'].FIT}, UNKNOWN=${sets['C_only'].UNKNOWN}`);
  console.log(`  E only:         FIT=${sets['E_only'].FIT}, UNKNOWN=${sets['E_only'].UNKNOWN}`);
  console.log(`  A ∩ C (not E):  FIT=${sets['A_and_C_not_E'].FIT}, UNKNOWN=${sets['A_and_C_not_E'].UNKNOWN}`);
  console.log(`  A ∩ E (not C):  FIT=${sets['A_and_E_not_C'].FIT}, UNKNOWN=${sets['A_and_E_not_C'].UNKNOWN}`);
  console.log(`  C ∩ E (not A):  FIT=${sets['C_and_E_not_A'].FIT}, UNKNOWN=${sets['C_and_E_not_A'].UNKNOWN}`);
  console.log(`  A ∩ C ∩ E:      FIT=${sets['A_and_C_and_E'].FIT}, UNKNOWN=${sets['A_and_C_and_E'].UNKNOWN}`);
  
  console.log('\nAggregated Overlaps:');
  const aIntersectC = sets['A_and_C_not_E'].FIT + sets['A_and_C_not_E'].UNKNOWN + sets['A_and_C_and_E'].FIT + sets['A_and_C_and_E'].UNKNOWN;
  const aIntersectE = sets['A_and_E_not_C'].FIT + sets['A_and_E_not_C'].UNKNOWN + sets['A_and_C_and_E'].FIT + sets['A_and_C_and_E'].UNKNOWN;
  const cIntersectE = sets['C_and_E_not_A'].FIT + sets['C_and_E_not_A'].UNKNOWN + sets['A_and_C_and_E'].FIT + sets['A_and_C_and_E'].UNKNOWN;
  
  console.log(`  Total A ∩ C:    ${aIntersectC}`);
  console.log(`  Total A ∩ E:    ${aIntersectE}`);
  console.log(`  Total C ∩ E:    ${cIntersectE}`);
  console.log('================================================================');
}

main();
