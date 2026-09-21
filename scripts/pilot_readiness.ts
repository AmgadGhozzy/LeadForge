import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkReadiness() {
  console.log("=== DB Readiness Check ===");
  console.log(`Connected to: ${supabaseUrl}`);

  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, website')
      .limit(1);

    if (error) {
      console.error("❌ Failed to query 'businesses' table:", error.message);
      return;
    }
    
    console.log("✅ 'businesses' table is accessible");
    console.log("✅ Required columns (id, name, website) are present");

    const { count, error: countError } = await supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .not('website', 'is', null)
      .neq('website', '');

    if (countError) {
      console.error("❌ Failed to count businesses:", countError.message);
      return;
    }

    console.log(`✅ Total businesses with valid websites: ${count}`);
    
    if (count !== null && count >= 50) {
      console.log("🚀 Readiness Check PASSED: Enough data for 50-sample pilot.");
    } else {
      console.warn("⚠️ Not enough data for a 50-sample pilot.");
    }

  } catch (err: any) {
    console.error("❌ Unexpected error:", err.message);
  }
}

checkReadiness();
