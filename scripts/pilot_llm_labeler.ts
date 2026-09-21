import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { chromium, Page } from 'playwright';
import { GoogleGenAI, Type } from '@google/genai';

const gcpKeyPath = path.join(process.cwd(), 'gcp-key.json');
if (!fs.existsSync(gcpKeyPath)) {
  console.error("Missing GCP credentials: gcp-key.json not found in root. This script requires Vertex AI credentials.");
  process.exit(1);
}
process.env.GOOGLE_APPLICATION_CREDENTIALS = gcpKeyPath;

const ai = new GoogleGenAI({
  vertexai: {
    project: 'gen-lang-client-0841388254',
    location: 'us-central1'
  }
});
const SNAPSHOT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'pilot_sample_snapshot.csv');
const OUTPUT_FILE = path.join(process.cwd(), 'scripts', 'pilot_data', 'llm_reference_labels.csv');
const PROMPT_VERSION = 'v1.2-observable-fit';
const MODEL = 'gemini-2.5-flash';

const PROMPT_TEMPLATE = `You are an independent evaluator classifying a business website based ONLY on observable information present in the provided website text.

Your task is NOT to evaluate whether the business has a lead-management problem and NOT to recommend any service.

Determine whether the business has observable commercial characteristics that fit the following definition:

"Potential Fit" means the business appears to sell a service or offering that normally requires customer interaction, consultation, quotation, or appointment before the transaction is completed, and the website provides observable contact, consultation, quotation, or booking calls-to-action.

Labels:

"1" (FIT)
Use only when the website provides sufficient observable evidence that:
- the business sells a service or offering requiring interaction, consultation, quotation, or appointment before purchase;
- the website contains a relevant contact, consultation, quotation, or booking CTA;
- there is no clear evidence that the business operates entirely through direct checkout.

"0" (NOT_FIT)
Use only when the website provides sufficient observable evidence that:
- the business is primarily a direct-checkout e-commerce business; OR
- the website is purely informational/content-only with no relevant commercial service interaction; OR
- the business clearly does not offer a service/offering requiring customer interaction before purchase.

"U" (UNKNOWN)
Use when:
- the website content is unavailable, broken, or insufficient;
- the business type cannot be determined reliably;
- the available evidence is ambiguous;
- the evidence does not clearly support either 1 or 0.

Rules:
- Use ONLY observable evidence in the provided website text.
- Do NOT infer lead volume.
- Do NOT infer internal staff workload or bottlenecks.
- Do NOT infer response speed.
- Do NOT infer CRM usage or lack of CRM.
- Do NOT infer lost leads.
- Do NOT use detector results, database fields, heuristics, scores, or Opportunity Engine logic.
- Do NOT assume that the absence of a booking system means the business needs lead nurturing.
- Do NOT force a 1 or 0 when the evidence is insufficient.
- Prefer U over an unsupported conclusion.

Website Text:
{{TEXT}}
`;

async function extractText(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => document.body?.innerText || '');
    const links = await page.evaluate(() => 
      Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(href => href.startsWith('http'))
    );
    return { text, links, success: true };
  } catch (err: any) {
    return { text: '', links: [], success: false };
  }
}

function getPriorityLinks(rootUrl: string, allLinks: string[]) {
  try {
    const rootDomain = new URL(rootUrl).hostname;
    const uniqueLinks = Array.from(new Set(allLinks)).filter(url => {
      try {
        return new URL(url).hostname === rootDomain;
      } catch { return false; }
    });

    const keywords = ['service', 'contact', 'book', 'appointment', 'pricing', 'shop', 'product'];
    const priority = uniqueLinks.filter(url => 
      keywords.some(kw => url.toLowerCase().includes(kw))
    );
    
    // Return up to 4 unique priority links (plus home makes 5 pages max)
    return Array.from(new Set(priority)).slice(0, 4);
  } catch {
    return [];
  }
}

function escapeCSV(val: string) {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function run() {
  const isDryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(SNAPSHOT_FILE)) {
    console.error("Snapshot file not found");
    process.exit(1);
  }

  const lines = fs.readFileSync(SNAPSHOT_FILE, 'utf-8').trim().split('\n');
  let rows = lines.slice(1);
  
  if (isDryRun) {
    console.log("--- DRY RUN MODE (3 sites only) ---");
    rows = rows.slice(0, 3);
  }

  const browser = await chromium.launch({ headless: true });
  
  let existingIds = new Set<string>();
  if (fs.existsSync(OUTPUT_FILE)) {
    const existingLines = fs.readFileSync(OUTPUT_FILE, 'utf-8').trim().split('\n').slice(1);
    for (const line of existingLines) {
      if (!line) continue;
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const cols = line.split(regex).map(s => s.replace(/^"|"$/g, ''));
      if (cols.length > 0) existingIds.add(cols[0]);
    }
  } else {
    fs.writeFileSync(OUTPUT_FILE, 'business_id,label,notes,model,prompt_version,snapshot_hash,pages_analyzed,crawl_status,timestamp\n');
  }

  for (const row of rows) {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    const cols = row.split(regex).map(s => s.replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    
    const [business_id, business_name, rawWebsite] = cols;
    if (existingIds.has(business_id)) {
      console.log(`\nSkipping (already labeled): ${business_name}`);
      continue;
    }

    let website_url = rawWebsite.trim();
    if (!website_url.startsWith('http')) website_url = 'https://' + website_url;

    console.log(`\nProcessing: ${business_name} (${website_url})`);
    
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    
    let combinedText = '';
    let pagesAnalyzed = 0;
    let crawlSuccess = false;
    let hasFailures = false;

    console.log(`  Crawling Home: ${website_url}`);
    const homeResult = await extractText(page, website_url);
    if (homeResult.success) {
      combinedText += `\n--- URL: ${website_url} ---\n${homeResult.text}`;
      pagesAnalyzed++;
      crawlSuccess = true;
      
      const nextUrls = getPriorityLinks(website_url, homeResult.links);
      for (const nextUrl of nextUrls) {
         if (nextUrl === website_url || nextUrl.endsWith('/')) continue;
         console.log(`  Crawling Internal: ${nextUrl}`);
         const res = await extractText(page, nextUrl);
         if (res.success) {
           combinedText += `\n--- URL: ${nextUrl} ---\n${res.text}`;
           pagesAnalyzed++;
         } else {
           hasFailures = true;
         }
      }
    } else {
      hasFailures = true;
    }
    await context.close();

    let crawl_status = crawlSuccess ? (hasFailures ? 'partial_success' : 'success') : 'failed';
    const snapshot_hash = crypto.createHash('sha256').update(combinedText).digest('hex').slice(0, 16);

    let finalLabel = 'U';
    let rationale = 'Crawl failed entirely.';

    if (crawlSuccess && combinedText.length > 50) {
      if (combinedText.length > 40000) combinedText = combinedText.substring(0, 40000);
      
      const prompt = PROMPT_TEMPLATE.replace('{{TEXT}}', combinedText);
      
      try {
        console.log(`  Calling LLM...`);
        const response = await ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, enum: ['1', '0', 'U'] },
                rationale: { type: Type.STRING }
              },
              required: ['label', 'rationale']
            }
          }
        });
        
        const resultText = response.text;
        if (resultText) {
          const parsed = JSON.parse(resultText);
          finalLabel = parsed.label;
          rationale = parsed.rationale;
        }
      } catch (err: any) {
        console.error("  LLM Error:", err.message);
        finalLabel = 'U';
        rationale = `LLM error: ${err.message}`;
      }
    } else if (crawlSuccess) {
       rationale = 'Crawl succeeded but no text extracted.';
    }

    console.log(`  Result: [${finalLabel}] - ${rationale}`);
    
    const outRow = [
      escapeCSV(business_id),
      escapeCSV(finalLabel),
      escapeCSV(rationale),
      escapeCSV(MODEL),
      escapeCSV(PROMPT_VERSION),
      escapeCSV(snapshot_hash),
      pagesAnalyzed.toString(),
      escapeCSV(crawl_status),
      new Date().toISOString()
    ];
    
    fs.appendFileSync(OUTPUT_FILE, outRow.join(',') + '\n');
  }
  
  await browser.close();
  console.log("\nDone.");
}

run();
