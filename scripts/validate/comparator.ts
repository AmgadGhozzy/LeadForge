import * as fs from 'fs';
import * as path from 'path';
import { EvidenceEngine } from '../../supabase/functions/_shared/intelligence/evidence/engine.ts';
import { CanonicalBusinessProfile } from '../../supabase/functions/_shared/types/canonical.ts';
import { EvidenceType } from '../../supabase/functions/_shared/intelligence/evidence/types.ts';
import { reporter } from './reporter.ts'; // We will create this next

const VALIDATION_DATASET = process.env.VALIDATION_DATASET;
if (!VALIDATION_DATASET) {
  console.error("ERROR: VALIDATION_DATASET environment variable is required.");
  process.exit(1);
}

const DATASET_DIR = path.resolve(process.cwd(), `scripts/validate/datasets/${VALIDATION_DATASET}`);
const SNAPSHOTS_DIR = path.join(DATASET_DIR, 'snapshots');
const REFERENCES_DIR = path.join(DATASET_DIR, 'references');
const LEADS_FILE = path.join(DATASET_DIR, 'leads.json');

// --- STRICT NETWORK ISOLATION GUARD ---
// Mock global fetch to throw immediately
globalThis.fetch = () => {
  throw new Error("STRICT NETWORK ISOLATION GUARD: Network request attempted during validation!");
};

// --------------------------------------

const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
const leadsMap = new Map(leads.map((l: any) => [l.id, l]));

export function buildCanonicalProfile(snapshot: any, leadMetadata: any): CanonicalBusinessProfile {
  return {
    identity: {
      id: snapshot.lead_id,
      name: leadMetadata.name || "Unknown",
      website: snapshot.root_url,
      categories: [],
      location: { city: "Unknown", country: "Unknown" }
    },
    reputation: {
      rating: leadMetadata.rating || null,
      reviews: leadMetadata.reviews || 0,
      health_score: 0
    },
    digitalPresence: {
      pagesScraped: snapshot.pages_scraped,
      pages: snapshot.pages.map((p: any) => ({
        url: p.url,
        pageType: p.route.toUpperCase() === 'HOME' ? 'HOME' 
                : p.route.toUpperCase() === 'CONTACT' ? 'CONTACT'
                : p.route.toUpperCase() === 'SERVICES' ? 'SERVICES'
                : p.route.toUpperCase() === 'BOOKING' ? 'BOOKING' : 'UNKNOWN',
        content: p.html, // Engine uses combinedHtml
        textContent: p.visible_text,
        links: p.links || []
      })),
      socialLinks: []
    }
  };
}

export async function runValidation() {
  console.log(`[comparator] Starting validation on dataset ${VALIDATION_DATASET}...`);
  
  const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.snapshot.json'));
  
  const results = [];
  const engine = new EvidenceEngine();

  for (const file of files) {
    const snapshotPath = path.join(SNAPSHOTS_DIR, file);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    
    const refPath = path.join(REFERENCES_DIR, `${snapshot.lead_id}.reference.json`);
    if (!fs.existsSync(refPath)) {
      console.warn(`[comparator] Missing reference for ${snapshot.lead_id}`);
      continue;
    }
    const refDoc = JSON.parse(fs.readFileSync(refPath, 'utf8'));
    const leadMetadata = leadsMap.get(snapshot.lead_id) || {};

    // Build profile from frozen state
    const profile = buildCanonicalProfile(snapshot, leadMetadata);

    // Run Engine (isolated)
    // pass dummy scanId
    const evidenceList = await engine.extractEvidence(profile, `scan-val-${snapshot.lead_id}`);

    const engineMap = new Map(evidenceList.map(e => [e.type, e]));

    // Compare
    const types: EvidenceType[] = ['BOOKING', 'WHATSAPP', 'CHATBOT', 'SOCIAL', 'PHONE'];
    
    const leadComparison = {
      lead_id: snapshot.lead_id,
      pages_scraped: snapshot.pages_scraped,
      pages_discovered: snapshot.pages_discovered,
      comparisons: {} as Record<string, any>
    };

    for (const t of types) {
      const ref = refDoc.reference[t] || { truth: 'UNKNOWN', confidence: 0 };
      const eng = engineMap.get(t);
      const engTruth = eng ? eng.polarity : 'UNKNOWN';

      leadComparison.comparisons[t] = {
        reference: ref.truth,
        reference_confidence: ref.confidence,
        engine: engTruth,
        engine_confidence: eng ? eng.confidence : 0,
        coverage_score: eng ? eng.coverage_score : null
      };
    }
    
    results.push(leadComparison);
  }

  return results;
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidation().then(res => {
    // Pass to reporter if run standalone
    import('./reporter.ts').then(r => r.generateReport(res));
  });
}
