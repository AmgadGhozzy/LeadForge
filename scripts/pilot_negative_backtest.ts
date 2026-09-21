// Pilot Negative Control Backtest — Rules A, C, E (STRICT FROZEN CONTRACT SEMANTICS)
// Mirrors the exact tri-state observability semantics from scripts/pilot_backtest_v2.ts.
// Ground truth: ALL 15 sites are NOT_FIT (label = '0').
// Failure semantics: FAILED/RESOURCE_LIMIT_FAILED -> UNKNOWN (NOT evaluated, not counted as TN).
// ZERO-MUTATION GATE: reads ONLY negative_control_results.json; writes ONLY negative_backtest_report.json.

import * as fs from 'fs';
import * as path from 'path';

const INPUT_FILE  = path.join(process.cwd(), 'scripts', 'pilot_data', 'negative_control_results.json');
const OUTPUT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'negative_backtest_report.json');

type TriState = 'PRESENT' | 'ABSENT' | 'UNKNOWN';
type RuleResult = 'MATCH' | 'NO_MATCH' | 'UNKNOWN';

interface RawSiteResult {
  business_id: string;
  business_name?: string;
  website_url: string;
  crawl_status: string;
  has_phone: boolean | null;
  has_email: boolean | null;
  has_whatsapp: boolean | null;
  has_booking: boolean | null;
  has_chatbot: boolean | null;
  error_message?: string | null;
}

interface ParsedBusinessInput {
  id: string;
  name: string;
  url: string;
  crawl_status: string;
  p: TriState; // Phone
  e: TriState; // Email
  w: TriState; // WhatsApp
  b: TriState; // Booking
  c: TriState; // Chatbot
}

// Exact frozen rules from scripts/pilot_backtest_v2.ts
function evalA(input: ParsedBusinessInput): RuleResult {
  const { p, b, c } = input;
  if (p === 'ABSENT' || b === 'PRESENT' || c === 'PRESENT') return 'NO_MATCH';
  if (p === 'PRESENT' && b === 'ABSENT' && c === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function evalC(input: ParsedBusinessInput): RuleResult {
  const { w, b } = input;
  if (w === 'ABSENT' || b === 'PRESENT') return 'NO_MATCH';
  if (w === 'PRESENT' && b === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function evalE(input: ParsedBusinessInput): RuleResult {
  const { p, e, b, c } = input;
  if (p === 'ABSENT' || e === 'ABSENT' || b === 'PRESENT' || c === 'PRESENT') return 'NO_MATCH';
  if (p === 'PRESENT' && e === 'PRESENT' && b === 'ABSENT' && c === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function main() {
  console.log('================================================================');
  console.log('=== NEGATIVE CONTROL BACKTEST (STRICT FROZEN CONTRACT) ===');
  console.log('================================================================\n');

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const records: RawSiteResult[] = raw.results;

  const parsed: ParsedBusinessInput[] = records.map(r => {
    let p: TriState = 'UNKNOWN';
    let e: TriState = 'UNKNOWN';
    let w: TriState = 'UNKNOWN';
    let b: TriState = 'UNKNOWN';
    let c: TriState = 'UNKNOWN';

    if (r.crawl_status === 'SUCCESS') {
      p = r.has_phone === true ? 'PRESENT' : 'ABSENT';
      e = r.has_email === true ? 'PRESENT' : 'ABSENT';
      w = r.has_whatsapp === true ? 'PRESENT' : 'ABSENT';
      b = r.has_booking === true ? 'PRESENT' : 'ABSENT';
      c = r.has_chatbot === true ? 'PRESENT' : 'ABSENT';
    }

    return {
      id: r.business_id,
      name: r.business_name ?? r.website_url,
      url: r.website_url,
      crawl_status: r.crawl_status,
      p, e, w, b, c
    };
  });

  const rules = ['A', 'C', 'E'] as const;
  const metrics: Record<string, any> = {};

  console.log(`Total Negatives: ${parsed.length}`);
  console.log(`Crawl SUCCESS (Evaluable signals): ${parsed.filter(r => r.crawl_status === 'SUCCESS').length}`);
  console.log(`Crawl FAILED (Signals UNKNOWN): ${parsed.filter(r => r.crawl_status !== 'SUCCESS').length}\n`);

  console.log('--- Individual Site Evaluation ---');
  for (const site of parsed) {
    const resA = evalA(site);
    const resC = evalC(site);
    const resE = evalE(site);
    console.log(
      `${site.id.padEnd(8)} [${site.crawl_status.padEnd(7)}] ${site.name.padEnd(22)} ` +
      `A:${resA.padEnd(8)} C:${resC.padEnd(8)} E:${resE.padEnd(8)} ` +
      `(p:${site.p[0]} e:${site.e[0]} w:${site.w[0]} b:${site.b[0]} c:${site.c[0]})`
    );
  }

  for (const rule of rules) {
    let tn = 0;
    let fp = 0;
    let unknown = 0;

    for (const site of parsed) {
      const res = rule === 'A' ? evalA(site) : rule === 'C' ? evalC(site) : evalE(site);
      if (res === 'UNKNOWN') {
        unknown++;
      } else if (res === 'MATCH') {
        // Ground truth is NOT_FIT, so a MATCH is a False Positive
        fp++;
      } else if (res === 'NO_MATCH') {
        // Ground truth is NOT_FIT, so NO_MATCH is a True Negative
        tn++;
      }
    }

    const evaluable = tn + fp;
    const specificity = evaluable > 0 ? ((tn / evaluable) * 100).toFixed(2) + '%' : 'N/A';
    const fpRate = evaluable > 0 ? ((fp / evaluable) * 100).toFixed(2) + '%' : 'N/A';

    metrics[rule] = {
      status: 'TESTABLE',
      total_negative_samples: parsed.length,
      evaluable,
      unknown,
      TN: tn,
      FP: fp,
      specificity,
      false_positive_rate: fpRate
    };
  }

  // Combined OR logic (evaluable on sites where crawl SUCCESS)
  let combinedTN = 0;
  let combinedFP = 0;
  let combinedUnknown = 0;

  for (const site of parsed) {
    const a = evalA(site);
    const c = evalC(site);
    const e = evalE(site);

    if (a === 'UNKNOWN' && c === 'UNKNOWN' && e === 'UNKNOWN') {
      combinedUnknown++;
    } else {
      const anyMatch = a === 'MATCH' || c === 'MATCH' || e === 'MATCH';
      if (anyMatch) {
        combinedFP++;
      } else {
        combinedTN++;
      }
    }
  }

  const combinedEvaluable = combinedTN + combinedFP;
  metrics['COMBINED_OR'] = {
    evaluable: combinedEvaluable,
    unknown: combinedUnknown,
    TN: combinedTN,
    FP: combinedFP,
    specificity: combinedEvaluable > 0 ? ((combinedTN / combinedEvaluable) * 100).toFixed(2) + '%' : 'N/A',
    false_positive_rate: combinedEvaluable > 0 ? ((combinedFP / combinedEvaluable) * 100).toFixed(2) + '%' : 'N/A'
  };

  console.log('\n================================================================');
  console.log('=== NEGATIVE CONTROL SUMMARY METRICS ===');
  console.log('================================================================');
  console.log(`Rule | Evaluable | UNKNOWN | TN | FP | Specificity | FP Rate`);
  console.log(`---------------------------------------------------------------`);
  for (const rule of rules) {
    const m = metrics[rule];
    console.log(
      `  ${rule}  |     ${m.evaluable.toString().padStart(2)}    |    ${m.unknown.toString().padStart(2)}   | ${m.TN.toString().padStart(2)} | ${m.FP.toString().padStart(2)} |   ${m.specificity.padStart(7)}   | ${m.false_positive_rate.padStart(6)}`
    );
  }
  const comb = metrics['COMBINED_OR'];
  console.log(`---------------------------------------------------------------`);
  console.log(
    ` OR  |     ${comb.evaluable.toString().padStart(2)}    |    ${comb.unknown.toString().padStart(2)}   | ${comb.TN.toString().padStart(2)} | ${comb.FP.toString().padStart(2)} |   ${comb.specificity.padStart(7)}   | ${comb.false_positive_rate.padStart(6)}`
  );

  const report = {
    timestamp: new Date().toISOString(),
    contract: 'Strict Frozen Contract Semantics (pilot_backtest_v2.ts)',
    rules_definition: {
      A: 'p === PRESENT && b === ABSENT && c === ABSENT',
      C: 'w === PRESENT && b === ABSENT',
      E: 'p === PRESENT && e === PRESENT && b === ABSENT && c === ABSENT'
    },
    failure_semantics: 'crawl_status !== SUCCESS -> all signals UNKNOWN -> rule UNKNOWN',
    ground_truth: 'ALL 15 samples NOT_FIT (label = 0)',
    zero_mutation: 'Verified (0 DB tables touched)',
    summary: metrics,
    details: parsed.map(s => ({
      business_id: s.id,
      name: s.name,
      crawl_status: s.crawl_status,
      signals: { p: s.p, e: s.e, w: s.w, b: s.b, c: s.c },
      rule_A: evalA(s),
      rule_C: evalC(s),
      rule_E: evalE(s)
    }))
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReport successfully saved to: ${OUTPUT_FILE}`);
}

main();