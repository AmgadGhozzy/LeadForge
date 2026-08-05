import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL!;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY!;

async function run() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // We need to bypass RLS. If anon key is used, we might not get anything.
  // Wait, let's just fetch from generated_messages to see what it has
  const { data: msgs, error: err1 } = await supabase.from('generated_messages').select('*').limit(10);
  console.log('generated_messages:', msgs, err1);

  const { data: analyses, error: err2 } = await supabase.from('website_analyses').select('*').limit(10);
  console.log('website_analyses:', analyses, err2);
}

run();
