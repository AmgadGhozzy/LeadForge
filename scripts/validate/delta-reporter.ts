import * as fs from 'fs';
import * as path from 'path';
import { EvidenceEngine } from '../../supabase/functions/_shared/intelligence/evidence/engine.ts';
import { buildCanonicalProfile } from './comparator.ts';

const DATASET_DIR = path.resolve(process.cwd(), process.env.VALIDATION_DATASET ? `scripts/validate/datasets/${process.env.VALIDATION_DATASET}` : 'scripts/validate/datasets/phase-8b-v2');
const SNAPSHOTS_DIR = path.join(DATASET_DIR, 'snapshots');
const REFS_V1_DIR = path.join(DATASET_DIR, 'references');
const REFS_V2_DIR = path.join(DATASET_DIR, 'references-v2');
const LEADS_FILE = path.join(DATASET_DIR, 'leads.json');

async function run() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    console.error(`ERROR: Snapshots directory not found at ${SNAPSHOTS_DIR}`);
    process.exit(1);
  }

  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  const engine = new EvidenceEngine();

  const report = {
    total: leads.length,
    v1: {
      FA: 0,
      FP: 0,
      Present: 0,
      Unknown: 0
    },
    v2: {
      FA: 0,
      FP: 0,
      Present: 0,
      Unknown: 0
    },
    refChanges: [] as string[],
    detectorChanges: [] as string[]
  };

  console.log(`[Delta] Running Delta Comparison for ${leads.length} leads...`);

  // To simulate V1 engine, we could just read the old run, but since we didn't save the old run outputs,
  // we will compare Reference V1 -> Engine V2 vs Reference V2 -> Engine V2
  // Wait, the instruction said: "same frozen snapshot, Engine V1 vs Engine V2".
  // Since we already overwrote BookingDetector for v2, we don't have Engine V1 in code anymore.
  // But we can compare the old `report.json` if it exists.
  
  const oldReportPath = path.join(DATASET_DIR, 'report.json');
  let oldReportData = null;
  if (fs.existsSync(oldReportPath)) {
    oldReportData = JSON.parse(fs.readFileSync(oldReportPath, 'utf8'));
    console.log(`[Delta] Loaded old report.json for Engine V1 data.`);
  }

  for (const lead of leads) {
    const snapFile = path.join(SNAPSHOTS_DIR, `${lead.id}.snapshot.json`);
    const refV1File = path.join(REFS_V1_DIR, `${lead.id}.reference.json`);
    const refV2File = path.join(REFS_V2_DIR, `${lead.id}.reference.json`);

    if (!fs.existsSync(snapFile) || !fs.existsSync(refV1File) || !fs.existsSync(refV2File)) continue;

    const snapshot = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
    const refV1 = JSON.parse(fs.readFileSync(refV1File, 'utf8')).reference.BOOKING;
    const refV2 = JSON.parse(fs.readFileSync(refV2File, 'utf8')).reference.BOOKING;

    // Build profile and run Engine V2
    const profile = buildCanonicalProfile(snapshot, lead);
    const v2Evidence = await engine.extractEvidence(profile, 'delta_run');
    const v2Booking = v2Evidence.find(e => e.type === 'BOOKING');
    const engineV2Polarity = v2Booking ? v2Booking.polarity : 'UNKNOWN';

    // Get Engine V1 polarity from old report
    let engineV1Polarity = 'UNKNOWN';
    if (oldReportData && oldReportData.leads) {
      const oldLeadData = oldReportData.leads.find((l: any) => l.lead_id === lead.id);
      if (oldLeadData) {
        const oldEv = oldLeadData.evidence.find((e: any) => e.type === 'BOOKING');
        engineV1Polarity = oldEv ? oldEv.polarity : 'UNKNOWN';
      }
    }

    // Reference Changes
    if (refV1.truth !== refV2.truth) {
      report.refChanges.push(`${lead.name || lead.id}: ${refV1.truth} -> ${refV2.truth}`);
    }

    // Detector Changes
    if (engineV1Polarity !== engineV2Polarity) {
      report.detectorChanges.push(`${lead.name || lead.id}: ${engineV1Polarity} -> ${engineV2Polarity}`);
    }

    // Metrics V1
    if (engineV1Polarity === 'PRESENT') report.v1.Present++;
    if (engineV1Polarity === 'UNKNOWN') report.v1.Unknown++;
    if (refV1.truth === 'YES' && engineV1Polarity === 'ABSENT') report.v1.FA++;
    if (refV1.truth === 'NO' && engineV1Polarity === 'PRESENT') report.v1.FP++;

    // Metrics V2
    if (engineV2Polarity === 'PRESENT') report.v2.Present++;
    if (engineV2Polarity === 'UNKNOWN') report.v2.Unknown++;
    if (refV2.truth === 'YES' && engineV2Polarity === 'ABSENT') report.v2.FA++;
    if (refV2.truth === 'NO' && engineV2Polarity === 'PRESENT') report.v2.FP++;
  }

  console.log('\n========================================');
  console.log('       BOOKING V1 → V2 DELTA REPORT     ');
  console.log('========================================\n');

  console.log(`False Absents:   ${report.v1.FA} → ${report.v2.FA}`);
  console.log(`False Positives: ${report.v1.FP} → ${report.v2.FP}`);
  console.log(`UNKNOWN:         ${report.v1.Unknown} → ${report.v2.Unknown}`);
  console.log(`Present:         ${report.v1.Present} → ${report.v2.Present}\n`);

  console.log('Reference changes:');
  report.refChanges.forEach(c => console.log(` - ${c}`));
  if (report.refChanges.length === 0) console.log(' - (none)');
  
  console.log('\nDetector changes (V1 → V2):');
  report.detectorChanges.forEach(c => console.log(` - ${c}`));
  if (report.detectorChanges.length === 0) console.log(' - (none)');
  
  console.log('\n========================================');
}

run().catch(console.error);
