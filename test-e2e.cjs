const fs = require('fs');

let envStr = '';
try {
  envStr = fs.readFileSync('.env', 'utf8');
} catch (e) {
  envStr = fs.readFileSync('.env.example', 'utf8');
}

let serviceKey = '';
for (const line of envStr.split('\n')) {
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    serviceKey = line.split('=')[1].trim();
  }
}

const PROJECT_ID = "03d459e8-5e6f-4bbe-9dca-0e347f68716f";
const API_URL = "https://ohezamzljdmvtgyciqxg.supabase.co";

async function run() {
  if (!serviceKey) return console.error("No service key");
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  
  // 1. Get Business
  console.log("1. Fetching a business...");
  const bRes = await fetch(`${API_URL}/rest/v1/businesses?project_id=eq.${PROJECT_ID}&website=not.is.null&select=id,name,website&limit=1`, { headers });
  const bData = await bRes.json();
  if (!bData.length) return console.log("No businesses found.");
  const b = bData[0];
  console.log(`Found: ${b.name} (${b.website}) [ID: ${b.id}]`);
  
  // 2. Enrich
  console.log("\n2. Running Enrichment...");
  const eRes = await fetch(`${API_URL}/functions/v1/enrich-business`, { method: "POST", headers, body: JSON.stringify({ business_id: b.id }) });
  console.log("Enrich Result:", await eRes.json());
  
  const capRes = await fetch(`${API_URL}/rest/v1/business_capabilities?business_id=eq.${b.id}&select=type`, { headers });
  console.log("Capabilities in DB:", (await capRes.json()).map(c => c.type));

  // 3. Analyze
  console.log("\n3. Running Analysis...");
  const aRes = await fetch(`${API_URL}/functions/v1/analyze-business`, { method: "POST", headers, body: JSON.stringify({ business_id: b.id }) });
  console.log("Analyze Result:", await aRes.json());
  
  const aDbRes = await fetch(`${API_URL}/rest/v1/website_analyses?business_id=eq.${b.id}&select=lead_score,sales_readiness,priority_score,priority_tier`, { headers });
  console.log("Analysis in DB:", await aDbRes.json());

  // 4. Generate Sales
  console.log("\n4. Running Sales Generation...");
  const sRes = await fetch(`${API_URL}/functions/v1/generate-sales`, { method: "POST", headers, body: JSON.stringify({ business_id: b.id, language: "ar" }) });
  console.log("Sales Result:", await sRes.json());
  
  const sDbRes = await fetch(`${API_URL}/rest/v1/generated_messages?business_id=eq.${b.id}&select=selected_offer_id,selection_reason,language`, { headers });
  console.log("Sales in DB:", await sDbRes.json());
}

run();
