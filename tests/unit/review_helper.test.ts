import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import {
  parseCsv,
  serializeCsv,
  loadCsvRows,
  saveCsvRows,
  isRowReviewed,
  createReviewServer,
  BLINDED_CSV_HEADER,
  type ReviewRow,
} from '../../scripts/audit/review-helper.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_CSV = path.join(__dirname, 'test_tmp_review.csv');

describe('review-helper unit tests', () => {
  const sampleRows: ReviewRow[] = [
    {
      observation_id: '11111111-1111-1111-1111-111111111111',
      business_name: 'Dr. Smile, Clinic',
      domain: 'drsmile.com',
      website_url: 'https://drsmile.com',
      is_appointment_based: '',
      digital_booking_path_present: '',
      business_state_evidence: '',
      notes: '',
    },
    {
      observation_id: '22222222-2222-2222-2222-222222222222',
      business_name: 'Walk-in Dental',
      domain: 'walkin.com',
      website_url: 'https://walkin.com',
      is_appointment_based: 'TRUE',
      digital_booking_path_present: 'FALSE',
      business_state_evidence: 'Phone only',
      notes: 'Reviewed',
    },
  ];

  beforeEach(() => {
    saveCsvRows(TMP_CSV, sampleRows);
  });

  afterEach(() => {
    if (fs.existsSync(TMP_CSV)) {
      fs.unlinkSync(TMP_CSV);
    }
  });

  it('correctly parses and serializes CSV with RFC-4180 escaping', () => {
    const loaded = loadCsvRows(TMP_CSV);
    expect(loaded.length).toBe(2);
    expect(loaded[0].business_name).toBe('Dr. Smile, Clinic');
    expect(isRowReviewed(loaded[0])).toBe(false);
    expect(isRowReviewed(loaded[1])).toBe(true);

    const serialized = serializeCsv(loaded);
    expect(serialized).toContain('"Dr. Smile, Clinic"');
    const reloaded = parseCsv(serialized);
    expect(reloaded.length).toBe(3); // header + 2 rows
    expect(reloaded[1][1]).toBe('Dr. Smile, Clinic');
  });

  it('serves /api/data and handles /api/save', async () => {
    const { server, rows, getStats } = createReviewServer(TMP_CSV);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as { port: number };
    const port = address.port;

    try {
      // 1. GET /api/data
      const dataRes = await fetch(`http://127.0.0.1:${port}/api/data`);
      expect(dataRes.status).toBe(200);
      const data = await dataRes.json();
      expect(data.stats.total).toBe(2);
      expect(data.stats.reviewed).toBe(1);
      expect(data.stats.remaining).toBe(1);
      expect(data.firstUnreviewedIndex).toBe(0);

      // 2. POST /api/save row 0
      const saveRes = await fetch(`http://127.0.0.1:${port}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          index: 0,
          observation_id: '11111111-1111-1111-1111-111111111111',
          is_appointment_based: 'TRUE',
          digital_booking_path_present: 'FALSE',
          business_state_evidence: 'Phone/contact info only; no online booking path',
          notes: 'Tested in vitest',
        }),
      });

      expect(saveRes.status).toBe(200);
      const saveJson = await saveRes.json();
      expect(saveJson.success).toBe(true);
      expect(saveJson.stats.reviewed).toBe(2);
      expect(saveJson.stats.remaining).toBe(0);

      // Verify file on disk was updated
      const diskRows = loadCsvRows(TMP_CSV);
      expect(diskRows[0].is_appointment_based).toBe('TRUE');
      expect(diskRows[0].digital_booking_path_present).toBe('FALSE');
      expect(diskRows[0].business_state_evidence).toBe(
        'Phone/contact info only; no online booking path'
      );
      expect(diskRows[0].notes).toBe('Tested in vitest');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
