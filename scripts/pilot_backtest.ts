// Pilot Backtest Script — Candidates A–F
// Compares heuristic candidate predictions vs llm_reference_labels.csv
// INDEPENDENT: does not import Evidence Engine or Opportunity Engine
// U stays U — not converted to 0 or TN

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LABELS_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'llm_reference_labels.csv');
const SNAPSHOT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_sample_snapshot.csv');
const OUTPUT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'backtest_results.json');

// ─── CSV Parser ──────────────────────────────────────────────────────────────
function parseCSV(file: string): Record<string, string>[] {
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter(Boolean).map(line => {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    const cols = line.split(regex).map(s => s.replace(/^"|"$/g, '').trim());
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']));
  });
}

// ─── Candidate Definitions ───────────────────────────────────────────────────
// Each candidate takes a business row from Supabase and predicts FIT (1) or NOT_FIT (0).
// These are the heuristic rules we are backtesting against the LLM reference labels.
// No Opportunity Engine code is imported.

type Prediction = '1' | '0';
type Candidate = {
  name: string;
  description: string;
  predict: (b: any, evidenceRow: any) => Prediction;
};

// Evidence fields we'll fetch from website_pages and detection signals stored in DB
// All candidates use only fields available from the businesses table and enrichment

const CANDIDATES: Candidate[] = [
  {
    name: 'Candidate A — Website Exists',
    description: 'Predicts FIT if the business has a non-null website field.',
    predict: (b) => (b.website && b.website.trim() !== '') ? '1' : '0',
  },
  {
    name: 'Candidate B — Has Phone Contact',
    description: 'Predicts FIT if the business has at least one PHONE contact recorded.',
    predict: (b) => (b.contacts && b.contacts.some((c: any) => c.type === 'PHONE')) ? '1' : '0',
  },
  {
    name: 'Candidate C — Has Rating (>=3.5)',
    description: 'Predicts FIT if Google rating is >= 3.5 (indicates active, live business).',
    predict: (b) => (b.rating && parseFloat(b.rating) >= 3.5) ? '1' : '0',
  },
  {
    name: 'Candidate D — Has Reviews (>=10)',
    description: 'Predicts FIT if review count >= 10 (indicates real customer volume).',
    predict: (b) => (b.reviews && parseInt(b.reviews) >= 10) ? '1' : '0',
  },
  {
    name: 'Candidate E — Rating + Reviews Combined',
    description: 'Predicts FIT if rating >= 3.5 AND reviews >= 10.',
    predict: (b) => (
      b.rating && parseFloat(b.rating) >= 3.5 &&
      b.reviews && parseInt(b.reviews) >= 10
    ) ? '1' : '0',
  },
  {
    name: 'Candidate F — Website + Phone + Reviews',
    description: 'Predicts FIT if business has website AND phone contact AND >= 10 reviews.',
    predict: (b) => (
      b.website && b.website.trim() !== '' &&
      b.contacts && b.contacts.some((c: any) => c.type === 'PHONE') &&
      b.reviews && parseInt(b.reviews) >= 10
    ) ? '1' : '0',
  },
];

// ─── Evaluation ──────────────────────────────────────────────────────────────
function evaluate(groundTruth: string, predictions: { id: string; pred: Prediction }[], labelMap: Map<string, string>) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  let unknown_truth = 0, unknown_match = 0;

  for (const { id, pred } of predictions) {
    const truth = labelMap.get(id);
    if (!truth) continue;

    if (truth === 'U') {
      unknown_truth++;
      // A candidate predicts '0' for unknown = unknown_match (system didn't falsely fire)
      if (pred === '0') unknown_match++;
      continue;
    }

    if (truth === '1' && pred === '1') tp++;
    else if (truth === '0' && pred === '1') fp++;
    else if (truth === '1' && pred === '0') fn++;
    else if (truth === '0' && pred === '0') tn++;
  }

  const precision = (tp + fp) > 0 ? tp / (tp + fp) : null;
  const recall    = (tp + fn) > 0 ? tp / (tp + fn) : null;
  const f1        = (precision !== null && recall !== null && (precision + recall) > 0)
                      ? 2 * (precision * recall) / (precision + recall) : null;
  const evaluable_total = tp + fp + fn + tn;
  const total = evaluable_total + unknown_truth;
  const coverage = total > 0 ? evaluable_total / total : 0;
  const evaluable_coverage = evaluable_total;

  return { TP: tp, FP: fp, FN: fn, TN: tn, UNKNOWN_TRUTH: unknown_truth, UNKNOWN_MATCH: unknown_match,
    Precision: precision, Recall: recall, F1: f1, Coverage: parseFloat(coverage.toFixed(4)), Evaluable_N: evaluable_coverage };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Pilot Backtest: Candidates A–F ===\n');

  const labels = parseCSV(LABELS_FILE);
  const snapshot = parseCSV(SNAPSHOT_FILE);
  const ids = snapshot.map(r => r.business_id);

  // Label map: business_id → label (1/0/U)
  const labelMap = new Map(labels.map(r => [r.business_id, r.label]));

  console.log(`Total in snapshot: ${ids.length}`);
  console.log(`Total with labels: ${labelMap.size}`);
  console.log(`Label distribution: 1=${[...labelMap.values()].filter(v => v==='1').length}, 0=${[...labelMap.values()].filter(v => v==='0').length}, U=${[...labelMap.values()].filter(v => v==='U').length}\n`);

  // Fetch business data for all 50 IDs
  const { data: businesses, error } = await sb
    .from('businesses')
    .select('id, name, website, rating, reviews, contacts(type, value)')
    .in('id', ids);

  if (error) { console.error('DB Error:', error); process.exit(1); }
  if (!businesses || businesses.length === 0) { console.error('No business data returned'); process.exit(1); }
  console.log(`Fetched ${businesses.length} business records from DB.\n`);

  const businessMap = new Map(businesses.map(b => [b.id, b]));

  const results: any[] = [];

  for (const candidate of CANDIDATES) {
    console.log(`--- ${candidate.name} ---`);
    console.log(`    ${candidate.description}`);

    const predictions = ids.map(id => {
      const b = businessMap.get(id);
      if (!b) return { id, pred: '0' as Prediction }; // Missing = predict NOT_FIT
      return { id, pred: candidate.predict(b, null) };
    });

    const metrics = evaluate(candidate.name, predictions, labelMap);

    console.log(`    TP=${metrics.TP} FP=${metrics.FP} FN=${metrics.FN} TN=${metrics.TN} U=${metrics.UNKNOWN_TRUTH} U_match=${metrics.UNKNOWN_MATCH}`);
    console.log(`    Precision=${metrics.Precision !== null ? metrics.Precision.toFixed(4) : 'N/A (no 0s in truth)'}`);
    console.log(`    Recall=${metrics.Recall !== null ? metrics.Recall.toFixed(4) : 'N/A'}`);
    console.log(`    F1=${metrics.F1 !== null ? metrics.F1.toFixed(4) : 'N/A'}`);
    console.log(`    Coverage(evaluable/total)=${(metrics.Coverage * 100).toFixed(1)}%  (Evaluable N=${metrics.Evaluable_N})`);
    console.log();

    results.push({ candidate: candidate.name, description: candidate.description, ...metrics });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ 
    run_at: new Date().toISOString(),
    note: "Exploratory Reference — NOT Ground Truth. U stays U — not converted to TN/FP.",
    results 
  }, null, 2));

  console.log(`\nResults saved to: ${OUTPUT_FILE}`);
}

main();
