// Freeze Candidate Inputs — One-time extraction from Remote DB
// Output: scripts/pilot_data/pilot_candidate_inputs.csv
// FROZEN after this run. Do not re-run unless methodology changes.
// Fields: business_id, has_website, has_phone, rating, reviews

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SNAPSHOT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_sample_snapshot.csv');
const OUTPUT_FILE   = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_candidate_inputs.csv');

function parseCSV(file: string): Record<string, string>[] {
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter(Boolean).map(line => {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    const cols = line.split(regex).map(s => s.replace(/^"|"$/g, '').trim());
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? '']));
  });
}

function escapeCSV(val: string | number | null | undefined): string {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  if (fs.existsSync(OUTPUT_FILE)) {
    console.error(`ERROR: ${OUTPUT_FILE} already exists. It is frozen — do not re-run.`);
    process.exit(1);
  }

  const snapshot = parseCSV(SNAPSHOT_FILE);
  const ids = snapshot.map(r => r.business_id);
  console.log(`Snapshot IDs loaded: ${ids.length}`);

  // Fetch core business fields
  const { data: businesses, error: bizErr } = await sb
    .from('businesses')
    .select('id, website, rating, reviews')
    .in('id', ids);

  if (bizErr || !businesses) {
    console.error('DB Error (businesses):', bizErr);
    process.exit(1);
  }
  console.log(`Fetched ${businesses.length} business records.`);

  // Fetch phone contacts
  const { data: contacts, error: cntErr } = await sb
    .from('contacts')
    .select('business_id, type')
    .in('business_id', ids)
    .eq('type', 'PHONE');

  if (cntErr) {
    console.error('DB Error (contacts):', cntErr);
    process.exit(1);
  }
  const phoneSet = new Set((contacts ?? []).map(c => c.business_id));
  console.log(`Businesses with PHONE contact: ${phoneSet.size}`);

  // Build frozen map
  const bizMap = new Map(businesses.map(b => [b.id, b]));

  const header = 'business_id,has_website,has_phone,rating,reviews,extracted_at';
  const extractedAt = new Date().toISOString();
  const rows: string[] = [header];

  for (const { business_id } of snapshot) {
    const b = bizMap.get(business_id);
    const has_website = b?.website && b.website.trim() !== '' ? 'true' : 'false';
    const has_phone   = phoneSet.has(business_id) ? 'true' : 'false';
    const rating      = b?.rating  != null ? String(b.rating)  : '';
    const reviews     = b?.reviews != null ? String(b.reviews) : '';

    rows.push([
      escapeCSV(business_id),
      has_website,
      has_phone,
      escapeCSV(rating),
      escapeCSV(reviews),
      extractedAt
    ].join(','));
  }

  fs.writeFileSync(OUTPUT_FILE, rows.join('\n') + '\n');
  console.log(`\n✅ Frozen: ${OUTPUT_FILE}`);
  console.log(`   Rows: ${rows.length - 1} (+ header)`);

  // Summary
  const data = rows.slice(1).map(r => {
    const [, hw, hp, rat, rev] = r.split(',');
    return { hw, hp, rat, rev };
  });
  console.log(`\nSummary:`);
  console.log(`  has_website=true : ${data.filter(d => d.hw === 'true').length}`);
  console.log(`  has_phone=true   : ${data.filter(d => d.hp === 'true').length}`);
  console.log(`  rating present   : ${data.filter(d => d.rat !== '').length}`);
  console.log(`  reviews present  : ${data.filter(d => d.rev !== '').length}`);
}

main();
