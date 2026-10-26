import { it as test } from 'vitest';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { EvidenceEngine } from '../../../../supabase/functions/_shared/intelligence/evidence/engine.ts';
import { CanonicalBusinessProfile } from '../../../../supabase/functions/_shared/types/canonical.ts';
import { Evidence } from '../../../../supabase/functions/_shared/intelligence/evidence/types.ts';

const DATASET_DIR = path.resolve(process.cwd(), 'scripts/validate/datasets/phase-8b-v2');

function buildProfile(snapshot: any): CanonicalBusinessProfile {
  return {
    identity: {
      id: snapshot.lead_id,
      name: "Fixture",
      website: snapshot.root_url,
      categories: [],
      location: { city: "Unknown", country: "Unknown" }
    },
    reputation: { rating: null, reviews: 0, health_score: 0 },
    digitalPresence: {
      pagesScraped: snapshot.pages_scraped,
      pages: snapshot.pages.map((p: any) => ({
        url: p.url,
        pageType: p.route.toUpperCase() === 'HOME' ? 'HOME' 
                : p.route.toUpperCase() === 'CONTACT' ? 'CONTACT'
                : p.route.toUpperCase() === 'SERVICES' ? 'SERVICES'
                : p.route.toUpperCase() === 'BOOKING' ? 'BOOKING' : 'UNKNOWN',
        content: p.html,
        textContent: p.visible_text,
        links: p.links || []
      })),
      socialLinks: []
    }
  };
}

async function runEngine(snapshotId: string): Promise<Evidence | undefined> {
  const snapPath = path.join(DATASET_DIR, `snapshots/${snapshotId}.snapshot.json`);
  const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  const profile = buildProfile(snapshot);
  const engine = new EvidenceEngine();
  const evidenceList = await engine.extractEvidence(profile, 'fixture');
  return evidenceList.find(e => e.type === 'BOOKING');
}

test('Marvel Dental -> PRESENT (Corroborated)', async () => {
  const e = await runEngine('c1120887-fa0e-4758-bd7e-e6d93f1fc29b');
  assert.ok(e !== undefined);
  assert.strictEqual(e.polarity, 'PRESENT');
  assert.ok(e.confidence > 0.7);
});

test('Smile World -> UNKNOWN (Uncorroborated /Appointment.html)', async () => {
  const e = await runEngine('419d0b44-918a-45f9-8e59-740bfd64742d');
  assert.ok(e !== undefined);
  assert.strictEqual(e.polarity, 'UNKNOWN');
});

test('Designer Clinic -> UNKNOWN (Uncorroborated Arabic CTA)', async () => {
  const e = await runEngine('122cf960-b743-43b1-8460-b9d697881132');
  assert.ok(e !== undefined);
  assert.strictEqual(e.polarity, 'UNKNOWN');
});

test('Barsoum -> UNKNOWN (Uncorroborated wpcf7/appointment text)', async () => {
  const e = await runEngine('09fe04c5-583e-4606-94d7-9f6e534a4506');
  assert.ok(e !== undefined);
  assert.strictEqual(e.polarity, 'UNKNOWN');
});

// Synthetic NO test
test('Synthetic Generic Contact -> ABSENT', async () => {
  const snapshot = {
    lead_id: 'synthetic-no',
    root_url: 'http://example.com',
    pages_scraped: 2,
    pages_discovered: 2,
    crawl_blocked: false,
    pages: [
      {
        url: 'http://example.com/',
        route: 'home',
        html: '<html><body>Welcome to generic clinic.</body></html>',
        visible_text: 'Welcome to generic clinic.',
        links: ['http://example.com/contact']
      },
      {
        url: 'http://example.com/contact',
        route: 'contact',
        html: '<html><body><form><input type="text" name="name"></form>Contact us for any medical queries.</body></html>',
        visible_text: 'Contact us for any medical queries.',
        links: []
      }
    ]
  };
  const profile = buildProfile(snapshot);
  const engine = new EvidenceEngine();
  const evidenceList = await engine.extractEvidence(profile, 'fixture');
  const e = evidenceList.find(e => e.type === 'BOOKING');
  
  assert.ok(e !== undefined);
  assert.strictEqual(e.polarity, 'ABSENT');
});
