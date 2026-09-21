import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  
  for (const p of [envPath, envLocalPath]) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          process.env[key] = value;
        }
      });
    }
  }
}

loadEnv();

const VALIDATION_DATASET = process.env.VALIDATION_DATASET;
if (!VALIDATION_DATASET) {
  console.error("ERROR: VALIDATION_DATASET environment variable is required.");
  console.error("Example: VALIDATION_DATASET=phase-8b-v1 npm run generate-reference");
  process.exit(1);
}

const DATASET_DIR = path.resolve(process.cwd(), `scripts/validate/datasets/${VALIDATION_DATASET}`);

if (fs.existsSync(DATASET_DIR)) {
  console.error(`ERROR: Dataset directory ${DATASET_DIR} already exists.`);
  console.error(`To prevent overwriting an existing baseline, please use a new VALIDATION_DATASET version.`);
  process.exit(1);
}

fs.mkdirSync(path.join(DATASET_DIR, 'snapshots'), { recursive: true });
fs.mkdirSync(path.join(DATASET_DIR, 'references'), { recursive: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
// Validation harness is a server-side internal tool — use service_role to bypass RLS.
// NEVER expose this key in frontend code.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not found in env vars.');
  console.error('Add SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key> to your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function selectLeads() {
  console.log(`[select-leads] Selecting leads using basic heuristics (has website, rating, reviews)...`);
  
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, website, rating, reviews')
    .not('website', 'is', null)
    .gt('rating', 0)
    .gt('reviews', 0)
    .limit(20); 

  if (error) {
    console.error('[select-leads] Error fetching businesses:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error('[select-leads] No valid businesses found in DB meeting criteria.');
    process.exit(1);
  }

  const shuffled = data.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 20);

  if (selected.length < 20) {
    console.warn(`[select-leads] Only found ${selected.length} valid businesses (requested 20). Proceeding anyway.`);
  }

  const leadsFilePath = path.join(DATASET_DIR, 'leads.json');
  fs.writeFileSync(leadsFilePath, JSON.stringify(selected, null, 2));

  console.log(`[select-leads] Saved ${selected.length} frozen metadata leads to ${leadsFilePath}`);
}

selectLeads();
