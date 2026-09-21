/**
 * analyze-detector-disagreements.ts
 *
 * Reads the 25 UNSUPPORTED_POSITIVE disagreements from detector_audit_results.json
 * and for each one:
 *   1. Re-runs the exact WhatsAppDetector checks manually against the raw snapshot HTML.
 *   2. Identifies WHICH check(s) triggered YES.
 *   3. Extracts ~200 chars of context around each match.
 *   4. Classifies the match quality (strong/incidental/script/style).
 *
 * Output:
 *   - detector_disagreements.md   (human-readable taxonomy)
 *   - detector_disagreements.json (machine-readable)
 *
 * READ-ONLY. No production code is modified.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildSnapshotProjection } from '../../src/domain/whatsapp/whatsapp-llm-extractor.js';

const SNAPSHOT_DATASET = 'phase-8b-v4-combined';
const SNAPSHOTS_DIR    = path.resolve(process.cwd(), `scripts/validate/datasets/${SNAPSHOT_DATASET}/snapshots`);
const AUDIT_JSON       = path.resolve(process.cwd(), 'detector_audit_results.json');
const OUT_MD           = path.resolve(process.cwd(), 'detector_disagreements.md');
const OUT_JSON         = path.resolve(process.cwd(), 'detector_disagreements.json');

// Exactly mirrors WhatsAppDetector WHATSAPP_CHECKS
const CHECKS = [
  { type: 'wa_me_link',        pattern: 'wa.me/'           },
  { type: 'whatsapp_api_link', pattern: 'api.whatsapp.com' },
  { type: 'whatsapp_widget',   pattern: 'whatsapp-widget'  },
  { type: 'whatsapp_keyword',  pattern: 'whatsapp'         },
  { type: 'wa_chat_plugin',    pattern: 'elfsight'         },
] as const;

type CheckType = typeof CHECKS[number]['type'];

interface MatchDetail {
  check:   CheckType;
  pattern: string;
  context: string;      // ~200 chars around first match
  location: 'html_attr' | 'script_body' | 'style_body' | 'visible_text' | 'meta' | 'link_href' | 'unknown';
  pageRoute: string;
  inProjection: boolean;
  projectionLocation: string | null;
}

function classifyLocation(html: string, matchIdx: number): MatchDetail['location'] {
  // Look at 500 chars before the match to infer context
  const before = html.substring(Math.max(0, matchIdx - 500), matchIdx).toLowerCase();

  // Is it inside a <script> tag?
  const lastScriptOpen  = before.lastIndexOf('<script');
  const lastScriptClose = before.lastIndexOf('</script');
  if (lastScriptOpen > lastScriptClose) return 'script_body';

  // Inside <style>?
  const lastStyleOpen  = before.lastIndexOf('<style');
  const lastStyleClose = before.lastIndexOf('</style');
  if (lastStyleOpen > lastStyleClose) return 'style_body';

  // Inside href attribute?
  const nearBefore = html.substring(Math.max(0, matchIdx - 80), matchIdx).toLowerCase();
  if (nearBefore.includes('href=')) return 'link_href';

  // Inside <meta>?
  const nearLine = html.substring(Math.max(0, matchIdx - 200), matchIdx + 200).toLowerCase();
  if (nearLine.includes('<meta')) return 'meta';

  // HTML attribute (class/id/data-*)
  if (nearBefore.match(/class=|id=|data-/)) return 'html_attr';

  return 'visible_text';
}

function findMatches(combinedHtml: string, pages: any[], projection: string): MatchDetail[] {
  const htmlLower = combinedHtml.toLowerCase();
  const projLower = projection.toLowerCase();
  const matches: MatchDetail[] = [];

  for (const check of CHECKS) {
    let searchFrom = 0;
    // Find ALL occurrences, not just first
    while (true) {
      const idx = htmlLower.indexOf(check.pattern, searchFrom);
      if (idx === -1) break;

      const context = combinedHtml.substring(
        Math.max(0, idx - 100),
        Math.min(combinedHtml.length, idx + 150)
      ).replace(/\n+/g, ' ').trim();

      const location = classifyLocation(combinedHtml, idx);

      // Identify which page this match belongs to by finding the nearest PAGE comment
      const before = combinedHtml.substring(0, idx);
      const pageMatch = [...before.matchAll(/<!-- PAGE: ([^\s>]+)/g)];
      const pageRoute = pageMatch.length > 0 ? pageMatch[pageMatch.length - 1][1] : 'unknown';

      // Check in projection
      const projIdx = projLower.indexOf(check.pattern);
      const inProjection = projIdx !== -1;
      let projectionLocation = null;
      if (inProjection) {
         const projContext = projLower.substring(Math.max(0, projIdx - 50), projIdx);
         if (projContext.includes('links:')) projectionLocation = 'LINKS';
         else if (projContext.includes('iframes:')) projectionLocation = 'IFRAMES';
         else if (projContext.includes('html excerpt:')) projectionLocation = 'HTML_EXCERPT';
         else if (projContext.includes('visible text:')) projectionLocation = 'VISIBLE_TEXT';
         else projectionLocation = 'OTHER';
      }

      matches.push({ check: check.type, pattern: check.pattern, context, location, pageRoute, inProjection, projectionLocation });

      // Only record first 3 matches per check to avoid flooding
      if (matches.filter(m => m.check === check.type).length >= 3) break;
      searchFrom = idx + 1;
    }
  }

  return matches;
}

function categorizeTrigger(matches: MatchDetail[]): string {
  const types = new Set(matches.map(m => m.check));
  const locs  = new Set(matches.map(m => m.location));

  if (types.has('wa_me_link'))        return 'STRONG: wa.me link';
  if (types.has('whatsapp_api_link')) return 'STRONG: api.whatsapp.com link';
  if (types.has('whatsapp_widget'))   return 'STRONG: whatsapp-widget script';
  if (types.has('wa_chat_plugin'))    return 'MEDIUM: elfsight plugin';

  // whatsapp_keyword — look at location quality
  const kwMatches = matches.filter(m => m.check === 'whatsapp_keyword');
  if (kwMatches.every(m => m.location === 'script_body')) return 'INCIDENTAL: "whatsapp" only in <script>';
  if (kwMatches.every(m => m.location === 'style_body'))  return 'INCIDENTAL: "whatsapp" only in <style>';
  if (kwMatches.every(m => m.location === 'html_attr'))   return 'INCIDENTAL: "whatsapp" only in HTML attr/class';
  if (kwMatches.every(m => m.location === 'meta'))        return 'AMBIGUOUS: "whatsapp" in <meta>';
  if (kwMatches.some(m  => m.location === 'visible_text'))return 'KEYWORD: "whatsapp" in visible text';
  if (kwMatches.some(m  => m.location === 'link_href'))   return 'KEYWORD: "whatsapp" in link href';
  return 'KEYWORD: "whatsapp" (unknown location)';
}

async function main() {
  if (!fs.existsSync(AUDIT_JSON)) {
    console.error('detector_audit_results.json not found — run evaluate-whatsapp-detector.ts first');
    process.exit(1);
  }

  const audit = JSON.parse(fs.readFileSync(AUDIT_JSON, 'utf8'));
  const disagreements: any[] = audit.disagreements.filter(
    (d: any) => d.classification === 'UNSUPPORTED_POSITIVE'
  );

  console.log(`Analyzing ${disagreements.length} UNSUPPORTED_POSITIVE disagreements...\n`);

  const results: any[] = [];
  const triggerCounts: Record<string, number> = {};

  for (const d of disagreements) {
    const snapPath = path.join(SNAPSHOTS_DIR, `${d.lead_id}.snapshot.json`);
    if (!fs.existsSync(snapPath)) {
      console.error(`Snapshot not found: ${d.lead_id}`);
      continue;
    }

    const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    const combinedHtml = (snapshot.pages || [])
      .map((p: any) => `<!-- PAGE: ${p.route || p.url} -->\n${p.html || ''}`)
      .join('\n');

    const projection = buildSnapshotProjection(snapshot).text;

    const matches = findMatches(combinedHtml, snapshot.pages || [], projection);
    const trigger  = categorizeTrigger(matches);

    triggerCounts[trigger] = (triggerCounts[trigger] || 0) + 1;

    results.push({
      lead_id:        d.lead_id,
      url:            d.snapshot_url,
      trigger,
      matches,
      reference: {
        decision:        d.reference.decision,
        positiveSignals: d.reference.positiveSignals,
        negativeSignals: d.reference.negativeSignals,
      },
    });

    console.log(`[${d.lead_id.substring(0,8)}] ${trigger}`);
  }

  // Sort by trigger category
  results.sort((a, b) => a.trigger.localeCompare(b.trigger));

  // ── Trigger summary ─────────────────────────────────────────────────────────
  console.log('\n=== TRIGGER SUMMARY ===');
  const sorted = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) console.log(`  ${v.toString().padStart(3)}  ${k}`);
  console.log('');

  // ── Markdown report ─────────────────────────────────────────────────────────
  const md = `# Detector Disagreement Analysis — UNSUPPORTED_POSITIVE (${disagreements.length} cases)

> **Goal**: Understand WHY the Detector said YES when the Reference Oracle said UNKNOWN.
> This is a diagnostic report, not a prescription to change the Detector.

---

## Trigger Summary

| Trigger Category | Count |
|---|---:|
${sorted.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}
| **Total** | **${disagreements.length}** |

---

## Taxonomy Key

| Category | Meaning |
|---|---|
| STRONG: wa.me link | Direct actionable WhatsApp link — almost certainly genuine |
| STRONG: api.whatsapp.com | WhatsApp Business API link — very strong signal |
| STRONG: whatsapp-widget | Dedicated widget script — strong signal |
| MEDIUM: elfsight plugin | Third-party plugin — may include WhatsApp widget |
| KEYWORD: "whatsapp" in visible text | Word appears in rendered text — could be contact info or just a mention |
| KEYWORD: "whatsapp" in link href | Appears in a href — likely genuine but needs inspection |
| AMBIGUOUS: "whatsapp" in <meta> | In page metadata — may be SEO description, not a real contact channel |
| INCIDENTAL: "whatsapp" only in <script> | Script body only — could be SDK init, analytics, social sharing, or genuine widget |
| INCIDENTAL: "whatsapp" only in <style> | Style only — class name, probably no genuine contact use |
| INCIDENTAL: "whatsapp" only in HTML attr/class | CSS class or data attribute — decorative or layout-related |

---

## Case-by-Case Analysis

${results.map((r, i) => {
  
  let classification = 'AMBIGUOUS';
  const hasStrong = r.trigger.includes('STRONG');
  const hasProj = r.matches.some((m: MatchDetail) => m.inProjection);
  
  if (hasStrong && hasProj) classification = 'REFERENCE_MISS';
  else if (hasStrong && !hasProj) classification = 'PROJECTION_OMISSION (or DETECTOR_OVERMATCH)';
  else if (!hasStrong && hasProj) classification = 'DETECTOR_OVERMATCH';
  
  return `### ${i + 1}. \`${r.lead_id.substring(0,8)}\` — ${r.trigger}
**URL**: ${r.url || 'N/A'}
**Classification**: ${classification}

**Detector trigger**:
${r.matches.map((m: MatchDetail) => `  pattern: \`${m.pattern}\` (${m.check})
  page/route: ${m.pageRoute}
  exact matched URL/text context: \`${m.context.replace(/`/g, "'").substring(0, 200)}\`
`).join('\n')}

**Projection**:
${r.matches.map((m: MatchDetail) => `  Pattern \`${m.pattern}\` in projection? ${m.inProjection ? 'YES' : 'NO'}
  Where? ${m.projectionLocation || 'N/A'}`).join('\n')}

**Reference**:
- Positive: ${(r.reference.positiveSignals || []).map((s: any) => `\`${s.type}\` (${s.strength}) — "${s.evidence}"`).join('; ') || '(none)'}
- Negative: ${(r.reference.negativeSignals || []).map((s: any) => `\`${s.type}\` (${s.strength}) — "${s.evidence}"`).join('; ') || '(none)'}
- Decision: ${r.reference.decision}`;
}).join('\n\n---\n\n')}
`;

  fs.writeFileSync(OUT_MD, md);
  fs.writeFileSync(OUT_JSON, JSON.stringify({ triggerSummary: Object.fromEntries(sorted), cases: results }, null, 2));

  console.log(`\nReports written:`);
  console.log(`  ${OUT_MD}`);
  console.log(`  ${OUT_JSON}`);
}

main().catch(e => { console.error(e); process.exit(1); });
