/**
 * GATE-005.13: Local Blinded Review Helper for C0 Adjudication
 *
 * STRICT BLINDING & SECURITY RULES:
 * - Reads ONLY ./artifacts/c0_blinded_review.csv
 * - NEVER connects to or reads ./artifacts/census_db or observation_records!
 * - Zero remote Supabase connections.
 * - Saves updates atomically back to ./artifacts/c0_blinded_review.csv with RFC-4180 compliance.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_CSV_PATH = path.join(REPO_ROOT, 'artifacts/c0_blinded_review.csv');

const PORT = parseInt(process.env.PORT || '4321', 10);
const HOST = '127.0.0.1';

export const BLINDED_CSV_HEADER =
  'observation_id,business_name,domain,website_url,is_appointment_based,digital_booking_path_present,business_state_evidence,notes';

export interface ReviewRow {
  observation_id: string;
  business_name: string;
  domain: string;
  website_url: string;
  is_appointment_based: string;
  digital_booking_path_present: string;
  business_state_evidence: string;
  notes: string;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      cur.push(field);
      field = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      cur.push(field);
      field = '';
      rows.push(cur);
      cur = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((row) => !(row.length === 1 && row[0] === ''));
}

export function escapeCsvField(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function serializeCsv(rows: ReviewRow[]): string {
  const lines: string[] = [BLINDED_CSV_HEADER];
  for (const r of rows) {
    const cols = [
      r.observation_id,
      r.business_name,
      r.domain,
      r.website_url,
      r.is_appointment_based,
      r.digital_booking_path_present,
      r.business_state_evidence,
      r.notes,
    ];
    lines.push(cols.map(escapeCsvField).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function loadCsvRows(csvPath: string): ReviewRow[] {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at: ${csvPath}`);
  }
  const text = fs.readFileSync(csvPath, 'utf8');
  const parsed = parseCsv(text);
  if (parsed.length === 0) {
    throw new Error(`CSV file is empty: ${csvPath}`);
  }
  const header = parsed[0].map((h) => h.trim());
  if (header.join(',') !== BLINDED_CSV_HEADER) {
    throw new Error(`Invalid CSV header in ${csvPath}. Expected: ${BLINDED_CSV_HEADER}`);
  }

  const rows: ReviewRow[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const p = parsed[i];
    rows.push({
      observation_id: p[0] ?? '',
      business_name: p[1] ?? '',
      domain: p[2] ?? '',
      website_url: p[3] ?? '',
      is_appointment_based: p[4] ?? '',
      digital_booking_path_present: p[5] ?? '',
      business_state_evidence: p[6] ?? '',
      notes: p[7] ?? '',
    });
  }
  return rows;
}

export function saveCsvRows(csvPath: string, rows: ReviewRow[]): void {
  const content = serializeCsv(rows);
  const tempPath = `${csvPath}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, csvPath);
}

export function isRowReviewed(r: ReviewRow): boolean {
  return (
    r.is_appointment_based.trim() !== '' &&
    r.digital_booking_path_present.trim() !== '' &&
    r.business_state_evidence.trim() !== ''
  );
}

function openBrowser(url: string) {
  const startCmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(startCmd, () => {});
}

export function createReviewServer(csvPath: string = DEFAULT_CSV_PATH) {
  let rows = loadCsvRows(csvPath);

  const getStats = () => {
    let reviewedCount = 0;
    let borderlineCount = 0;
    for (const r of rows) {
      if (isRowReviewed(r)) reviewedCount++;
      if (r.notes && r.notes.includes('[NEEDS_HUMAN_CHECK]')) borderlineCount++;
    }
    return {
      total: rows.length,
      reviewed: reviewedCount,
      remaining: rows.length - reviewedCount,
      borderline: borderlineCount,
      pct: rows.length > 0 ? Math.round((reviewedCount / rows.length) * 100) : 0,
    };
  };

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHtmlApp());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/data') {
      const stats = getStats();
      const firstUnreviewed = rows.findIndex((r) => !isRowReviewed(r));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          stats,
          firstUnreviewedIndex: firstUnreviewed >= 0 ? firstUnreviewed : 0,
          rows: rows.map((r, idx) => ({
            index: idx,
            observation_id: r.observation_id,
            business_name: r.business_name,
            domain: r.domain,
            website_url: r.website_url,
            is_appointment_based: r.is_appointment_based,
            digital_booking_path_present: r.digital_booking_path_present,
            business_state_evidence: r.business_state_evidence,
            notes: r.notes,
            is_reviewed: isRowReviewed(r),
          })),
        })
      );
      return;
    }

    if (req.method === 'POST' && pathname === '/api/save') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const index = Number(data.index);
          if (isNaN(index) || index < 0 || index >= rows.length) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Invalid row index: ${data.index}` }));
            return;
          }

          // Strict validation of statuses
          const validStatuses = ['TRUE', 'FALSE', 'UNKNOWN'];
          const isAppt = String(data.is_appointment_based || '').trim().toUpperCase();
          const digBooking = String(data.digital_booking_path_present || '').trim().toUpperCase();
          const evidence = String(data.business_state_evidence || '').trim();
          const notes = String(data.notes || '').trim();

          if (!validStatuses.includes(isAppt)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `is_appointment_based must be one of TRUE, FALSE, UNKNOWN` }));
            return;
          }
          if (!validStatuses.includes(digBooking)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `digital_booking_path_present must be one of TRUE, FALSE, UNKNOWN` }));
            return;
          }
          if (!evidence) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `business_state_evidence cannot be empty` }));
            return;
          }

          // Update in-memory
          rows[index].is_appointment_based = isAppt;
          rows[index].digital_booking_path_present = digBooking;
          rows[index].business_state_evidence = evidence;
          rows[index].notes = notes;

          // Save to CSV atomically
          saveCsvRows(csvPath, rows);

          const stats = getStats();
          const nextUnreviewed = rows.findIndex((r, idx) => idx > index && !isRowReviewed(r));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              stats,
              updatedRow: rows[index],
              nextUnreviewedIndex:
                nextUnreviewed >= 0 ? nextUnreviewed : rows.findIndex((r) => !isRowReviewed(r)),
            })
          );
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Failed to save review row' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return { server, rows, getStats };
}

function renderHtmlApp(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LeadForge C0 Blinded Review Helper</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 28, 45, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.25);
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.15);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.15);
      --purple: #a855f7;
      --purple-bg: rgba(168, 85, 247, 0.15);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.15);
      --radius: 12px;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: radial-gradient(circle at 50% 0%, #1e293b 0%, #090d16 80%);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px 80px 16px;
    }

    .container {
      width: 100%;
      max-width: 900px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Header & Progress Bar */
    .header {
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      padding: 20px 24px;
      border-radius: var(--radius);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .title-group h1 {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .title-group p {
      font-size: 0.82rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .stats-badge {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .stat-pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .stat-pill strong { color: var(--accent); }

    .progress-bar-wrap {
      width: 100%;
      height: 10px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 9999px;
      overflow: hidden;
      position: relative;
    }

    .progress-bar-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #38bdf8 0%, #818cf8 50%, #10b981 100%);
      box-shadow: 0 0 16px var(--accent-glow);
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Main Card */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      padding: 28px;
      border-radius: var(--radius);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
      display: flex;
      flex-direction: column;
      gap: 24px;
      position: relative;
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .meta-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.78rem;
      font-family: var(--font-mono);
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.04);
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .status-tag {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 12px;
      border-radius: 9999px;
    }
    .status-tag.reviewed {
      background: var(--success-bg);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-tag.pending {
      background: var(--warning-bg);
      color: var(--warning);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .business-heading {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .business-title {
      font-size: 1.6rem;
      font-weight: 700;
      color: #fff;
      line-height: 1.25;
    }

    .business-domain {
      font-family: var(--font-mono);
      font-size: 0.95rem;
      color: var(--accent);
    }

    .website-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
      color: #fff;
      text-decoration: none;
      padding: 12px 20px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.95rem;
      transition: all 0.2s ease;
      box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.15);
      align-self: flex-start;
      cursor: pointer;
    }
    .website-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(2, 132, 199, 0.5);
    }
    .website-btn kbd {
      background: rgba(0, 0, 0, 0.3);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: var(--font-mono);
    }

    /* Presets Section */
    .section-title {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .preset-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .preset-btn {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 14px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 6px;
      text-align: left;
      transition: all 0.2s ease;
      position: relative;
    }

    .preset-btn:hover {
      background: rgba(255, 255, 255, 0.07);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }

    .preset-btn.selected {
      border-color: var(--accent);
      background: rgba(56, 189, 248, 0.08);
      box-shadow: 0 0 12px var(--accent-glow);
    }

    .preset-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .preset-badge {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    .preset-label {
      font-size: 0.9rem;
      font-weight: 600;
      color: #fff;
      line-height: 1.25;
    }

    .preset-sub {
      font-size: 0.75rem;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }

    .preset-btn.preset-1 .preset-sub { color: #38bdf8; }
    .preset-btn.preset-2 .preset-sub { color: #10b981; }
    .preset-btn.preset-3 .preset-sub { color: #f59e0b; }
    .preset-btn.preset-4 .preset-sub { color: #94a3b8; }

    /* Form Fields */
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .chips-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 6px;
    }

    .chip-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: #cbd5e1;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 0.78rem;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: normal;
      text-align: left;
    }

    .chip-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.25);
    }

    textarea, input[type="text"], select {
      width: 100%;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px 14px;
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.2s ease;
    }

    textarea:focus, input[type="text"]:focus, select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-glow);
    }

    .fields-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    /* Action Nav Bar */
    .action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding-top: 10px;
      border-top: 1px solid var(--card-border);
    }

    .nav-buttons {
      display: flex;
      gap: 10px;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: #cbd5e1;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 0.88rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    .btn-primary {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      padding: 12px 28px;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45);
    }

    /* Jump Selector */
    .jump-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .jump-select {
      max-width: 280px;
      font-size: 0.82rem;
      padding: 8px 10px;
    }

    /* Shortcuts Footer */
    .shortcuts-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(9, 13, 22, 0.92);
      border-top: 1px solid var(--card-border);
      backdrop-filter: blur(12px);
      padding: 10px 20px;
      display: flex;
      justify-content: center;
      gap: 20px;
      font-size: 0.78rem;
      color: var(--text-muted);
      z-index: 100;
      flex-wrap: wrap;
    }

    .shortcut-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .shortcut-item kbd {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      padding: 2px 6px;
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: #fff;
    }

    /* Toast */
    .toast {
      position: fixed;
      top: 24px;
      right: 24px;
      background: rgba(16, 185, 129, 0.95);
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.88rem;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      transform: translateY(-50px);
      opacity: 0;
      transition: all 0.3s ease;
      z-index: 999;
    }
    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }
    .toast.error {
      background: rgba(239, 68, 68, 0.95);
    }
  </style>
</head>
<body>

<div class="toast" id="toast">Saved successfully</div>

<div class="container">
  <!-- Header with Live Stats & Progress -->
  <header class="header">
    <div class="header-top">
      <div class="title-group">
        <h1>LeadForge C0 Blinded Review Helper</h1>
        <p>Independent Human Adjudication (193 sample rows) — Zero Gate Leaks</p>
      </div>
      <div class="stats-badge">
        <div class="stat-pill">
          Reviewed <strong id="reviewedCount">0</strong> / <span id="totalCount">193</span> (<span id="pctCount">0%</span>)
        </div>
        <div class="stat-pill">
          Remaining <strong id="remainingCount" style="color: #f59e0b;">193</strong>
        </div>
        <div class="stat-pill">
          Borderline <strong id="borderlineCount" style="color: #ef4444;">0</strong>
        </div>
      </div>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" id="progressBar"></div>
    </div>
  </header>

  <!-- Review Card -->
  <main class="card" id="mainCard">
    <div class="card-top">
      <div class="meta-badge">
        <span id="rowPosition">Row 1 of 193</span>
        <span>•</span>
        <span id="obsId">obs-id</span>
      </div>
      <div id="statusTag" class="status-tag pending">PENDING</div>
    </div>

    <div class="business-heading">
      <h2 class="business-title" id="businessName">Loading Business...</h2>
      <div class="business-domain" id="domainText">example.com</div>
    </div>

    <div>
      <button class="website-btn" id="openWebsiteBtn">
        <span>Open Website in New Tab</span>
        <kbd>O</kbd>
        <span style="font-size: 1.1rem; line-height: 1;">↗</span>
      </button>
    </div>

    <!-- 1-Click Presets -->
    <div>
      <div class="section-title">
        <span>One-Click Presets</span>
        <span style="font-size: 0.75rem; font-weight: normal; text-transform: none;">Keys: 1, 2, 3, 4</span>
      </div>
      <div class="preset-grid">
        <button type="button" class="preset-btn preset-1" id="preset1" onclick="applyPreset(1)">
          <div class="preset-top">
            <span class="preset-badge">Key 1</span>
          </div>
          <div class="preset-label">Clinic: NO Digital Booking</div>
          <div class="preset-sub">Appt: TRUE / Booking: FALSE</div>
        </button>

        <button type="button" class="preset-btn preset-2" id="preset2" onclick="applyPreset(2)">
          <div class="preset-top">
            <span class="preset-badge">Key 2</span>
          </div>
          <div class="preset-label">Clinic: HAS Digital Booking</div>
          <div class="preset-sub">Appt: TRUE / Booking: TRUE</div>
        </button>

        <button type="button" class="preset-btn preset-3" id="preset3" onclick="applyPreset(3)">
          <div class="preset-top">
            <span class="preset-badge">Key 3</span>
          </div>
          <div class="preset-label">Not Appointment Based</div>
          <div class="preset-sub">Appt: FALSE / Booking: FALSE</div>
        </button>

        <button type="button" class="preset-btn preset-4" id="preset4" onclick="applyPreset(4)">
          <div class="preset-top">
            <span class="preset-badge">Key 4</span>
          </div>
          <div class="preset-label">Unreachable / Can't Verify</div>
          <div class="preset-sub">Appt: UNKNOWN / Booking: UNKNOWN</div>
        </button>
      </div>
    </div>

    <!-- Review Form Fields -->
    <div class="fields-row">
      <div class="form-group">
        <label class="section-title" for="isApptSelect">is_appointment_based</label>
        <select id="isApptSelect" onchange="syncPresetState()">
          <option value="">-- Select Status --</option>
          <option value="TRUE">TRUE (Appointment Clinic)</option>
          <option value="FALSE">FALSE (Walk-in / Retail)</option>
          <option value="UNKNOWN">UNKNOWN (Unreachable / Inconclusive)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="section-title" for="digitalBookingSelect">digital_booking_path_present</label>
        <select id="digitalBookingSelect" onchange="syncPresetState()">
          <option value="">-- Select Status --</option>
          <option value="TRUE">TRUE (Digital Booking Present)</option>
          <option value="FALSE">FALSE (No Online Booking)</option>
          <option value="UNKNOWN">UNKNOWN (Unable to Verify)</option>
        </select>
      </div>
    </div>

    <!-- Quick Evidence Chips -->
    <div class="form-group">
      <label class="section-title">Evidence Quick Chips (Click to fill)</label>
      <div class="chips-wrap">
        <button type="button" class="chip-btn" onclick="fillEvidence('Phone/contact info only; no online booking path')">
          📞 Phone only; no online booking
        </button>
        <button type="button" class="chip-btn" onclick="fillEvidence('WhatsApp/phone only; no booking widget or intake')">
          💬 WhatsApp/phone only; no booking widget
        </button>
        <button type="button" class="chip-btn" onclick="fillEvidence('Online booking widget/portal present on site')">
          📅 Online booking portal present
        </button>
        <button type="button" class="chip-btn" onclick="fillEvidence('Appointment request form present on site')">
          📝 Appointment request form present
        </button>
        <button type="button" class="chip-btn" onclick="fillEvidence('Walk-in/retail only; no appointment booking workflow')">
          🚶 Walk-in/retail only; not appointment-based
        </button>
        <button type="button" class="chip-btn" onclick="fillEvidence('Website unreachable, parked, or domain expired during review')">
          🚫 Site unreachable or parked
        </button>
      </div>
      <textarea id="evidenceInput" rows="2" placeholder="Describe factual website observation (required)..."></textarea>
    </div>

    <div class="form-group">
      <label class="section-title" for="notesInput">Notes (Optional)</label>
      <input type="text" id="notesInput" placeholder="Optional audit notes...">
    </div>

    <!-- Navigation & Save Bar -->
    <div class="action-bar">
      <div class="nav-buttons">
        <button class="btn-secondary" onclick="prevRow()" title="Previous (Key P or ←)">
          <span>← Prev</span>
          <kbd style="opacity:0.6;font-size:0.75rem;">P</kbd>
        </button>
        <button class="btn-secondary" onclick="nextRow()" title="Next (Key N or →)">
          <span>Next →</span>
          <kbd style="opacity:0.6;font-size:0.75rem;">N</kbd>
        </button>
        <button class="btn-secondary" onclick="jumpToNextUnreviewed()" title="Jump to next pending (Key U)">
          <span>⚡ Next Pending</span>
          <kbd style="opacity:0.6;font-size:0.75rem;">U</kbd>
        </button>
        <button class="btn-secondary" id="btnBorderline" onclick="jumpToNextBorderline()" title="Jump to next borderline (Key B)">
          <span>⚠️ Next Borderline</span>
          <kbd style="opacity:0.6;font-size:0.75rem;">B</kbd>
        </button>
      </div>

      <div class="jump-group">
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--text-muted);cursor:pointer;">
          <input type="checkbox" id="filterBorderlineCheckbox" onchange="toggleBorderlineFilter(this.checked)" style="cursor:pointer;">
          <span>Show only Borderline</span>
        </label>
        <select class="jump-select" id="rowSelector" onchange="jumpToIndex(parseInt(this.value, 10))">
        </select>
        <button class="btn-primary" id="saveBtn" onclick="saveCurrentRow()">
          <span>Save & Next</span>
          <kbd style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:4px;font-size:0.75rem;">Enter</kbd>
        </button>
      </div>
    </div>
  </main>
</div>

<!-- Shortcuts Bar -->
<footer class="shortcuts-footer">
  <div class="shortcut-item"><kbd>1-4</kbd> Apply Presets</div>
  <div class="shortcut-item"><kbd>O</kbd> Open Website</div>
  <div class="shortcut-item"><kbd>Enter</kbd> Save & Advance</div>
  <div class="shortcut-item"><kbd>←</kbd> / <kbd>P</kbd> Prev</div>
  <div class="shortcut-item"><kbd>→</kbd> / <kbd>N</kbd> Next</div>
  <div class="shortcut-item"><kbd>U</kbd> Next Pending</div>
  <div class="shortcut-item"><kbd>B</kbd> Next Borderline</div>
</footer>

<script>
  let allRows = [];
  let currentIndex = 0;
  let activePreset = null;

  async function init() {
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      allRows = data.rows;
      currentIndex = data.firstUnreviewedIndex || 0;
      updateStats(data.stats);
      populateSelector();
      renderCurrentRow();
    } catch (err) {
      showToast('Error loading data: ' + err.message, true);
    }
  }

  let showOnlyBorderline = false;

  function updateStats(stats) {
    document.getElementById('reviewedCount').innerText = stats.reviewed;
    document.getElementById('totalCount').innerText = stats.total;
    document.getElementById('remainingCount').innerText = stats.remaining;
    if (document.getElementById('borderlineCount')) {
      document.getElementById('borderlineCount').innerText = stats.borderline || 0;
    }
    document.getElementById('pctCount').innerText = stats.pct + '%';
    document.getElementById('progressBar').style.width = stats.pct + '%';
  }

  function populateSelector() {
    const sel = document.getElementById('rowSelector');
    sel.innerHTML = '';
    allRows.forEach((r, idx) => {
      const isBorderline = r.notes && r.notes.includes('[NEEDS_HUMAN_CHECK]');
      if (showOnlyBorderline && !isBorderline) return;
      const opt = document.createElement('option');
      opt.value = idx;
      const statusIcon = isBorderline ? '⚠️' : (r.is_reviewed ? '✅' : '⏳');
      opt.text = \`\${statusIcon} #\${idx + 1}: \${r.business_name.slice(0, 24)}\`;
      sel.appendChild(opt);
    });
  }

  function renderCurrentRow() {
    if (!allRows.length) return;
    const r = allRows[currentIndex];
    document.getElementById('rowPosition').innerText = \`Row \${currentIndex + 1} of \${allRows.length}\`;
    document.getElementById('obsId').innerText = r.observation_id.slice(0, 8) + '...';
    document.getElementById('businessName').innerText = r.business_name;
    document.getElementById('domainText').innerText = r.domain;

    const isReviewed = r.is_reviewed;
    const statusTag = document.getElementById('statusTag');
    if (isReviewed) {
      statusTag.className = 'status-tag reviewed';
      statusTag.innerText = 'REVIEWED';
    } else {
      statusTag.className = 'status-tag pending';
      statusTag.innerText = 'PENDING';
    }

    document.getElementById('openWebsiteBtn').onclick = () => {
      if (r.website_url) window.open(r.website_url, '_blank');
    };

    document.getElementById('isApptSelect').value = r.is_appointment_based || '';
    document.getElementById('digitalBookingSelect').value = r.digital_booking_path_present || '';
    document.getElementById('evidenceInput').value = r.business_state_evidence || '';
    document.getElementById('notesInput').value = r.notes || '';

    document.getElementById('rowSelector').value = currentIndex;
    syncPresetState();
  }

  function applyPreset(num) {
    activePreset = num;
    const isAppt = document.getElementById('isApptSelect');
    const digBooking = document.getElementById('digitalBookingSelect');
    const evInput = document.getElementById('evidenceInput');

    if (num === 1) {
      isAppt.value = 'TRUE';
      digBooking.value = 'FALSE';
      if (!evInput.value.trim() || isKnownDefaultEvidence(evInput.value)) {
        evInput.value = 'Phone/contact info only; no online booking path';
      }
    } else if (num === 2) {
      isAppt.value = 'TRUE';
      digBooking.value = 'TRUE';
      if (!evInput.value.trim() || isKnownDefaultEvidence(evInput.value)) {
        evInput.value = 'Online booking widget/portal present on site';
      }
    } else if (num === 3) {
      isAppt.value = 'FALSE';
      digBooking.value = 'FALSE';
      if (!evInput.value.trim() || isKnownDefaultEvidence(evInput.value)) {
        evInput.value = 'Walk-in/retail only; no appointment booking workflow';
      }
    } else if (num === 4) {
      isAppt.value = 'UNKNOWN';
      digBooking.value = 'UNKNOWN';
      if (!evInput.value.trim() || isKnownDefaultEvidence(evInput.value)) {
        evInput.value = 'Website unreachable, parked, or domain expired during review';
      }
    }
    syncPresetState();
  }

  function isKnownDefaultEvidence(val) {
    const defaults = [
      'Phone/contact info only; no online booking path',
      'Online booking widget/portal present on site',
      'Walk-in/retail only; no appointment booking workflow',
      'Website unreachable, parked, or domain expired during review'
    ];
    return defaults.includes(val.trim());
  }

  function syncPresetState() {
    const appt = document.getElementById('isApptSelect').value;
    const booking = document.getElementById('digitalBookingSelect').value;
    for (let i = 1; i <= 4; i++) {
      document.getElementById('preset' + i).classList.remove('selected');
    }
    if (appt === 'TRUE' && booking === 'FALSE') {
      document.getElementById('preset1').classList.add('selected');
      activePreset = 1;
    } else if (appt === 'TRUE' && booking === 'TRUE') {
      document.getElementById('preset2').classList.add('selected');
      activePreset = 2;
    } else if (appt === 'FALSE' && booking === 'FALSE') {
      document.getElementById('preset3').classList.add('selected');
      activePreset = 3;
    } else if (appt === 'UNKNOWN' && booking === 'UNKNOWN') {
      document.getElementById('preset4').classList.add('selected');
      activePreset = 4;
    } else {
      activePreset = null;
    }
  }

  function fillEvidence(text) {
    document.getElementById('evidenceInput').value = text;
  }

  async function saveCurrentRow() {
    const isAppt = document.getElementById('isApptSelect').value;
    const booking = document.getElementById('digitalBookingSelect').value;
    const evidence = document.getElementById('evidenceInput').value.trim();
    const notes = document.getElementById('notesInput').value.trim();

    if (!isAppt) {
      showToast('Please select is_appointment_based or click a preset!', true);
      return;
    }
    if (!booking) {
      showToast('Please select digital_booking_path_present or click a preset!', true);
      return;
    }
    if (!evidence) {
      showToast('Please provide factual business_state_evidence!', true);
      return;
    }

    try {
      const payload = {
        index: currentIndex,
        observation_id: allRows[currentIndex].observation_id,
        is_appointment_based: isAppt,
        digital_booking_path_present: booking,
        business_state_evidence: evidence,
        notes: notes,
      };

      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        showToast('Save failed: ' + (data.error || 'Server error'), true);
        return;
      }

      allRows[currentIndex].is_appointment_based = isAppt;
      allRows[currentIndex].digital_booking_path_present = booking;
      allRows[currentIndex].business_state_evidence = evidence;
      allRows[currentIndex].notes = notes;
      allRows[currentIndex].is_reviewed = true;

      updateStats(data.stats);
      populateSelector();
      showToast('Saved #' + (currentIndex + 1) + ' — Progress saved to CSV');

      // Auto advance to next unreviewed row if available, otherwise next row
      if (data.nextUnreviewedIndex !== -1 && data.nextUnreviewedIndex !== currentIndex) {
        currentIndex = data.nextUnreviewedIndex;
      } else if (currentIndex < allRows.length - 1) {
        currentIndex++;
      }
      renderCurrentRow();
    } catch (err) {
      showToast('Network error: ' + err.message, true);
    }
  }

  function prevRow() {
    if (currentIndex > 0) {
      currentIndex--;
      renderCurrentRow();
    }
  }

  function nextRow() {
    if (currentIndex < allRows.length - 1) {
      currentIndex++;
      renderCurrentRow();
    }
  }

  function jumpToIndex(idx) {
    if (idx >= 0 && idx < allRows.length) {
      currentIndex = idx;
      renderCurrentRow();
    }
  }

  function jumpToNextUnreviewed() {
    const nextUnreviewed = allRows.findIndex((r, idx) => idx > currentIndex && !r.is_reviewed);
    if (nextUnreviewed !== -1) {
      currentIndex = nextUnreviewed;
    } else {
      const firstUnreviewed = allRows.findIndex((r) => !r.is_reviewed);
      if (firstUnreviewed !== -1) {
        currentIndex = firstUnreviewed;
      } else {
        showToast('All 193 rows have been reviewed! 🎉');
        return;
      }
    }
    renderCurrentRow();
  }

  function toggleBorderlineFilter(checked) {
    showOnlyBorderline = !!checked;
    populateSelector();
    if (showOnlyBorderline) {
      const isCurrentBorderline = allRows[currentIndex]?.notes?.includes('[NEEDS_HUMAN_CHECK]');
      if (!isCurrentBorderline) {
        jumpToNextBorderline();
      }
    }
  }

  function jumpToNextBorderline() {
    const nextBorderline = allRows.findIndex((r, idx) => idx > currentIndex && r.notes && r.notes.includes('[NEEDS_HUMAN_CHECK]'));
    if (nextBorderline !== -1) {
      currentIndex = nextBorderline;
    } else {
      const firstBorderline = allRows.findIndex((r) => r.notes && r.notes.includes('[NEEDS_HUMAN_CHECK]'));
      if (firstBorderline !== -1) {
        currentIndex = firstBorderline;
      } else {
        showToast('No borderline rows ([NEEDS_HUMAN_CHECK]) found.');
        return;
      }
    }
    renderCurrentRow();
  }

  function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => {
      toast.className = 'toast';
    }, 2500);
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If active element is a text input or textarea, let user type unless Enter without Shift
    const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isTextInput = tag === 'input' || tag === 'textarea';

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveCurrentRow();
      return;
    }

    if (isTextInput) return;

    if (e.key === '1') {
      e.preventDefault();
      applyPreset(1);
    } else if (e.key === '2') {
      e.preventDefault();
      applyPreset(2);
    } else if (e.key === '3') {
      e.preventDefault();
      applyPreset(3);
    } else if (e.key === '4') {
      e.preventDefault();
      applyPreset(4);
    } else if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      const r = allRows[currentIndex];
      if (r && r.website_url) window.open(r.website_url, '_blank');
    } else if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      prevRow();
    } else if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      nextRow();
    } else if (e.key === 'u' || e.key === 'U') {
      e.preventDefault();
      jumpToNextUnreviewed();
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      jumpToNextBorderline();
    }
  });

  window.addEventListener('DOMContentLoaded', init);
</script>
</body>
</html>
`;
}

export function startHelper(csvPath: string = DEFAULT_CSV_PATH) {
  const { server, rows, getStats } = createReviewServer(csvPath);

  server.listen(PORT, HOST, () => {
    const stats = getStats();
    console.log('============================================================');
    console.log('LEADFORGE C0 BLINDED REVIEW HELPER RUNNING');
    console.log('============================================================');
    console.log(`URL:               http://${HOST}:${PORT}`);
    console.log(`Blinded CSV:       ${csvPath}`);
    console.log(`Total Rows:        ${stats.total}`);
    console.log(`Already Reviewed:  ${stats.reviewed} (${stats.pct}%)`);
    console.log(`Remaining to Do:   ${stats.remaining}`);
    console.log('------------------------------------------------------------');
    console.log('KEYBOARD SHORTCUTS IN BROWSER UI:');
    console.log('  [1] Preset: Clinic — NO Digital Booking (TRUE / FALSE)');
    console.log('  [2] Preset: Clinic — HAS Digital Booking (TRUE / TRUE)');
    console.log('  [3] Preset: Not Appointment-Based (FALSE / FALSE)');
    console.log('  [4] Preset: Site Unreachable / Inconclusive (UNKNOWN / UNKNOWN)');
    console.log('  [O] Open current business website in new tab');
    console.log('  [Enter] Save current row & auto-advance');
    console.log('  [P / ArrowLeft]  Previous row');
    console.log('  [N / ArrowRight] Next row');
    console.log('  [U] Jump to next pending row');
    console.log('------------------------------------------------------------');
    console.log('Press Ctrl+C to terminate the review server.');
    console.log('============================================================');

    // Attempt to automatically open browser
    openBrowser(`http://${HOST}:${PORT}`);
  });

  return server;
}

// Direct invocation
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const customCsv = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV_PATH;
  startHelper(customCsv);
}
