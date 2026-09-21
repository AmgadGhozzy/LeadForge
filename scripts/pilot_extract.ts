import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function escapeCSV(val: string | null) {
  if (!val) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function runExtraction() {
  console.log("Fetching data from DB...");
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, website')
    .not('website', 'is', null)
    .neq('website', '');

  if (error || !data) {
    console.error("Failed to fetch:", error?.message);
    process.exit(1);
  }

  // Shuffle array (Fisher-Yates)
  for (let i = data.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [data[i], data[j]] = [data[j], data[i]];
  }

  const sample = data.slice(0, 50);
  console.log(`Selected random sample of ${sample.length} businesses.`);

  // Create snapshot
  const snapshotLines = ['business_id,business_name,website_url'];
  const reviewerLines = ['business_id,business_name,website_url,label,notes'];

  for (const b of sample) {
    const id = escapeCSV(b.id);
    const name = escapeCSV(b.name);
    const website = escapeCSV(b.website);

    snapshotLines.push(`${id},${name},${website}`);
    reviewerLines.push(`${id},${name},${website},,`);
  }

  const outputDir = path.resolve(process.cwd(), 'scripts', 'pilot_data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const snapshotPath = path.join(outputDir, 'pilot_sample_snapshot.csv');
  const revAPath = path.join(outputDir, 'pilot_reviewer_a.csv');
  const revBPath = path.join(outputDir, 'pilot_reviewer_b.csv');

  fs.writeFileSync(snapshotPath, snapshotLines.join('\n'));
  fs.writeFileSync(revAPath, reviewerLines.join('\n'));
  fs.writeFileSync(revBPath, reviewerLines.join('\n'));

  console.log(`✅ Snapshot saved to: ${snapshotPath}`);
  console.log(`✅ Reviewer A file saved to: ${revAPath}`);
  console.log(`✅ Reviewer B file saved to: ${revBPath}`);
}

runExtraction();
