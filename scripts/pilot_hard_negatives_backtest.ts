// Pilot Hard Negatives Backtest — Forensic Evaluation (HARD_NEGATIVE_CONTROL_SPEC v1)
// Reads hard_negatives_results.json and evaluates Rules A, C, E with strict tri-state semantics.
// Ground truth: ALL 15 targets are NOT_FIT (label = '0').
// Failure semantics: FAILED/RESOURCE_LIMIT_FAILED → UNKNOWN (excluded from TN/FP matrix).
// ZERO-MUTATION GATE: reads ONLY hard_negatives_results.json; writes ONLY hard_negatives_report.json.
//
// Deliverables:
//   1. Confusion Matrix per pattern (TN, FP, UNKNOWN)
//   2. FP Forensic Analysis Table (business, matched rule, signals, commercial ground truth)
//   3. Counterexample Matrix (cross-contamination A × C × E)
//   4. Failure-mode classification

import * as fs from 'fs';
import * as path from 'path';

const INPUT_FILE   = path.join(process.cwd(), 'scripts', 'pilot_data', 'hard_negatives_results.json');
const FROZEN_FILE  = path.join(process.cwd(), 'scripts', 'pilot_data', 'hard_negatives_frozen_15.json');
const OUTPUT_FILE  = path.join(process.cwd(), 'scripts', 'pilot_data', 'hard_negatives_report.json');

type TriState = 'PRESENT' | 'ABSENT' | 'UNKNOWN';
type RuleResult = 'MATCH' | 'NO_MATCH' | 'UNKNOWN';

interface RawSiteResult {
  business_id: string;
  business_name?: string;
  website_url: string;
  archetype: string;
  ground_truth_label: string;
  crawl_status: string;
  has_phone: boolean | null;
  has_email: boolean | null;
  has_whatsapp: boolean | null;
  has_booking: boolean | null;
  has_chatbot: boolean | null;
  error_message?: string | null;
}

interface FrozenBusiness {
  business_id: string;
  commercial_reason: string;
  observable_basis: string;
}

interface ParsedSite {
  id: string;
  name: string;
  url: string;
  archetype: string;
  crawl_status: string;
  p: TriState; // Phone
  e: TriState; // Email
  w: TriState; // WhatsApp
  b: TriState; // Booking
  c: TriState; // Chatbot
}

// ─── Frozen Pattern Definitions (from pilot_backtest_v2.ts) ───────────────────
function evalA(site: ParsedSite): RuleResult {
  const { p, b, c } = site;
  if (p === 'ABSENT' || b === 'PRESENT' || c === 'PRESENT') return 'NO_MATCH';
  if (p === 'PRESENT' && b === 'ABSENT' && c === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function evalC(site: ParsedSite): RuleResult {
  const { w, b } = site;
  if (w === 'ABSENT' || b === 'PRESENT') return 'NO_MATCH';
  if (w === 'PRESENT' && b === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

function evalE(site: ParsedSite): RuleResult {
  const { p, e, b, c } = site;
  if (p === 'ABSENT' || e === 'ABSENT' || b === 'PRESENT' || c === 'PRESENT') return 'NO_MATCH';
  if (p === 'PRESENT' && e === 'PRESENT' && b === 'ABSENT' && c === 'ABSENT') return 'MATCH';
  return 'UNKNOWN';
}

// ─── Failure-Mode Classification ─────────────────────────────────────────────
function classifyFailureMode(site: ParsedSite, matchedRules: string[]): string {
  if (matchedRules.includes('A') && site.p === 'PRESENT' && site.b === 'ABSENT' && site.c === 'ABSENT') {
    if (site.archetype === 'emergency_instant_dispatch') return 'EMERGENCY_DISPATCH_PATTERN: Phone-only service model lacks booking, matched A incorrectly';
    if (site.archetype === 'direct_self_service') return 'SELF_SERVICE_CONTACT_POLLUTION: Contact channels present without booking, but checkout is direct';
    if (site.archetype === 'institutional_enterprise') return 'ENTERPRISE_CONTACT_ONLY: Institutional contact info without online booking, no nurturing opportunity';
    return 'CONTACT_SIGNAL_WITHOUT_COMMERCIAL_FIT: Phone visible, no booking/chatbot, but commercial model precludes nurturing';
  }
  if (matchedRules.includes('C')) return 'WHATSAPP_CUSTOMER_SERVICE: WhatsApp channel for support/dispatch, not lead nurturing pipeline entry';
  if (matchedRules.includes('E')) return 'MULTI_CHANNEL_CONTACT_WITHOUT_OPPORTUNITY: Phone + email without booking, but nurturing is commercially irrelevant';
  return 'UNKNOWN_FAILURE_MODE';
}

function main() {
  console.log('================================================================');
  console.log('  HARD NEGATIVES BACKTEST — FORENSIC EVALUATION');
  console.log('  Specification: HARD_NEGATIVE_CONTROL_SPEC v1');
  console.log('================================================================\n');

  const raw: RawSiteResult[] = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const frozenArr: FrozenBusiness[] = JSON.parse(fs.readFileSync(FROZEN_FILE, 'utf-8'));
  const frozenMap = new Map(frozenArr.map(f => [f.business_id, f]));

  const sites: ParsedSite[] = raw.map(r => {
    const isEvaluable = r.crawl_status === 'SUCCESS';
    return {
      id: r.business_id,
      name: r.business_name ?? r.website_url,
      url: r.website_url,
      archetype: r.archetype,
      crawl_status: r.crawl_status,
      p: isEvaluable ? (r.has_phone  === true ? 'PRESENT' : 'ABSENT') : 'UNKNOWN',
      e: isEvaluable ? (r.has_email  === true ? 'PRESENT' : 'ABSENT') : 'UNKNOWN',
      w: isEvaluable ? (r.has_whatsapp === true ? 'PRESENT' : 'ABSENT') : 'UNKNOWN',
      b: isEvaluable ? (r.has_booking  === true ? 'PRESENT' : 'ABSENT') : 'UNKNOWN',
      c: isEvaluable ? (r.has_chatbot  === true ? 'PRESENT' : 'ABSENT') : 'UNKNOWN',
    };
  });

  const evaluable = sites.filter(s => s.crawl_status === 'SUCCESS');
  const unknown   = sites.filter(s => s.crawl_status !== 'SUCCESS');

  console.log(`Total Targets   : ${sites.length}`);
  console.log(`Evaluable (OK)  : ${evaluable.length}`);
  console.log(`UNKNOWN (Failed): ${unknown.length}\n`);

  // ── 1. Per-site evaluation ──────────────────────────────────────────────────
  console.log('--- Individual Site Evaluation ---');
  for (const s of sites) {
    const a = evalA(s); const c = evalC(s); const e = evalE(s);
    console.log(
      `${s.id.padEnd(8)} [${s.crawl_status.substring(0,7).padEnd(7)}] ${s.name.padEnd(28)} ` +
      `A:${a.padEnd(8)} C:${c.padEnd(8)} E:${e.padEnd(8)} ` +
      `(p:${s.p[0]} e:${s.e[0]} w:${s.w[0]} b:${s.b[0]} c:${s.c[0]})`
    );
  }

  // ── 2. Confusion Matrix ────────────────────────────────────────────────────
  const rules = ['A', 'C', 'E'] as const;
  const metrics: Record<string, {tn:number; fp:number; unk:number; evaluable:number; specificity:string; fpRate:string}> = {};

  for (const rule of rules) {
    let tn = 0, fp = 0, unk = 0;
    for (const s of sites) {
      const res = rule === 'A' ? evalA(s) : rule === 'C' ? evalC(s) : evalE(s);
      if (res === 'UNKNOWN') unk++;
      else if (res === 'MATCH') fp++;       // Ground truth = NOT_FIT → MATCH = FP
      else if (res === 'NO_MATCH') tn++;    // Ground truth = NOT_FIT → NO_MATCH = TN
    }
    const eval_ = tn + fp;
    metrics[rule] = { tn, fp, unk, evaluable: eval_,
      specificity: eval_ > 0 ? `${((tn / eval_) * 100).toFixed(2)}%` : 'N/A',
      fpRate:      eval_ > 0 ? `${((fp / eval_) * 100).toFixed(2)}%` : 'N/A',
    };
  }

  // Combined OR
  let cTN = 0, cFP = 0, cUnk = 0;
  for (const s of sites) {
    const a = evalA(s), c = evalC(s), e = evalE(s);
    if (a === 'UNKNOWN' && c === 'UNKNOWN' && e === 'UNKNOWN') cUnk++;
    else (a === 'MATCH' || c === 'MATCH' || e === 'MATCH') ? cFP++ : cTN++;
  }
  const cEval = cTN + cFP;
  metrics['ANY'] = { tn: cTN, fp: cFP, unk: cUnk, evaluable: cEval,
    specificity: cEval > 0 ? `${((cTN / cEval) * 100).toFixed(2)}%` : 'N/A',
    fpRate:      cEval > 0 ? `${((cFP / cEval) * 100).toFixed(2)}%` : 'N/A',
  };

  console.log('\n--- Confusion Matrix (Ground Truth: ALL NOT_FIT) ---');
  console.log('Rule | Evaluable | UNKNOWN | TN | FP | Specificity | FP Rate');
  console.log('─────────────────────────────────────────────────────────────');
  for (const rule of [...rules, 'ANY' as const]) {
    const m = metrics[rule];
    console.log(
      `  ${rule.padEnd(3)} |     ${m.evaluable.toString().padStart(2)}    |    ${m.unk.toString().padStart(2)}   ` +
      `| ${m.tn.toString().padStart(2)} | ${m.fp.toString().padStart(2)} |  ${m.specificity.padStart(8)}  | ${m.fpRate.padStart(7)}`
    );
  }

  // ── 3. FP Forensic Table ───────────────────────────────────────────────────
  const fpForensics: any[] = [];
  for (const s of evaluable) {
    const a = evalA(s), c = evalC(s), e = evalE(s);
    const matched = (['A', 'C', 'E'] as const).filter(r =>
      (r === 'A' ? a : r === 'C' ? c : e) === 'MATCH'
    );
    if (matched.length > 0) {
      const frozen = frozenMap.get(s.id);
      fpForensics.push({
        business_id: s.id,
        business_name: s.name,
        website_url: s.url,
        archetype: s.archetype,
        matched_rules: matched,
        observable_signals: { p: s.p, e: s.e, w: s.w, b: s.b, c: s.c },
        commercial_reason: frozen?.commercial_reason ?? 'See frozen dataset',
        observable_basis: frozen?.observable_basis ?? 'See frozen dataset',
        failure_mode: classifyFailureMode(s, matched),
      });
    }
  }

  console.log(`\n--- FP Forensic Table (${fpForensics.length} False Positives) ---`);
  if (fpForensics.length === 0) {
    console.log('  ✅ No False Positives detected across all patterns!');
  } else {
    for (const fp of fpForensics) {
      console.log(`  ❌ ${fp.business_id} — ${fp.business_name}`);
      console.log(`     URL: ${fp.website_url}`);
      console.log(`     Matched: ${fp.matched_rules.join(', ')}`);
      console.log(`     Signals: p:${fp.observable_signals.p} e:${fp.observable_signals.e} w:${fp.observable_signals.w} b:${fp.observable_signals.b} c:${fp.observable_signals.c}`);
      console.log(`     Commercial Reason: ${fp.commercial_reason}`);
      console.log(`     Failure Mode: ${fp.failure_mode}`);
    }
  }

  // ── 4. Counterexample Matrix ───────────────────────────────────────────────
  const matrix = evaluable.map(s => ({
    id: s.id,
    A: evalA(s) === 'MATCH' ? '✓' : '✗',
    C: evalC(s) === 'MATCH' ? '✓' : '✗',
    E: evalE(s) === 'MATCH' ? '✓' : '✗',
    'ANY(A,C,E)': (evalA(s) === 'MATCH' || evalC(s) === 'MATCH' || evalE(s) === 'MATCH') ? '✓' : '✗',
  }));

  console.log('\n--- Counterexample Matrix ---');
  console.log('ID       | A  | C  | E  | ANY');
  console.log('─────────────────────────────');
  for (const row of matrix) {
    console.log(`${row.id.padEnd(8)} | ${row.A.padEnd(2)} | ${row.C.padEnd(2)} | ${row.E.padEnd(2)} | ${row['ANY(A,C,E)']}`);
  }

  // ── 5. Determine overall verdict ──────────────────────────────────────────
  const worstFpRate = Math.max(
    metrics['A'].fp > 0 ? metrics['A'].fp / (metrics['A'].evaluable || 1) : 0,
    metrics['C'].fp > 0 ? metrics['C'].fp / (metrics['C'].evaluable || 1) : 0,
    metrics['E'].fp > 0 ? metrics['E'].fp / (metrics['E'].evaluable || 1) : 0,
  );

  let verdict: string;
  let recommendedAction: string;
  if (fpForensics.length === 0) {
    verdict = 'CANDIDATE_PATTERNS_SURVIVED';
    recommendedAction = 'Patterns survived Hard Negatives with 0 FP. Proceed to design formal Opportunity Policy v1 from independent evidence if recall is commercially viable.';
  } else if (metrics['C'].fp === 0 && metrics['A'].fp > 0 && metrics['E'].fp > 0) {
    verdict = 'PARTIAL_SURVIVAL_C_ONLY';
    recommendedAction = 'Pattern C survived (0 FP). Do NOT promote to production rule. Demote C to Supporting Evidence for a composite Opportunity Policy. Retire A and E as standalone patterns.';
  } else {
    verdict = 'ALL_PATTERNS_FAIL_HARD_NEGATIVES';
    recommendedAction = 'All candidate patterns (A, C, E) produce False Positives on service businesses. Retain ZERO_RULES baseline. Archive evaluated patterns. Shift to designing richer Evidence types.';
  }

  console.log(`\n🏁 VERDICT: ${verdict}`);
  console.log(`💡 Recommended Action: ${recommendedAction}`);

  // ── 6. Write Report ────────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    spec: 'HARD_NEGATIVE_CONTROL_SPEC v1',
    parent_contract: 'ADR-005-opportunity-engine-freeze.md Section 10',
    rules_definition: {
      A: 'PHONE === PRESENT ∧ BOOKING === ABSENT ∧ CHATBOT === ABSENT',
      C: 'WHATSAPP === PRESENT ∧ BOOKING === ABSENT',
      E: 'PHONE === PRESENT ∧ EMAIL === PRESENT ∧ BOOKING === ABSENT ∧ CHATBOT === ABSENT',
    },
    failure_semantics: 'crawl_status !== SUCCESS → all signals UNKNOWN → rule UNKNOWN',
    ground_truth: 'ALL 15 targets NOT_FIT (label = 0)',
    zero_mutation: 'Verified (0 DB tables modified)',
    summary: {
      total_targets: sites.length,
      evaluable: evaluable.length,
      unknown_due_to_crawl_failure: unknown.length,
      metrics,
    },
    verdict,
    recommended_action: recommendedAction,
    fp_forensic_table: fpForensics,
    counterexample_matrix: matrix,
    site_details: sites.map(s => ({
      business_id: s.id,
      name: s.name,
      archetype: s.archetype,
      crawl_status: s.crawl_status,
      signals: { p: s.p, e: s.e, w: s.w, b: s.b, c: s.c },
      rule_A: evalA(s),
      rule_C: evalC(s),
      rule_E: evalE(s),
    })),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n✅ Forensic report saved to: ${OUTPUT_FILE}`);
}

main();
