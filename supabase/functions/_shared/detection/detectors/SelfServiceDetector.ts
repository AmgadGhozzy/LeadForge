// ──────────────────────────────────────────────
// Self-Service Detector — ADR-006 §3.1 Capability atoms + §3.3 journey stages.
//
// Emits: SELF_SERVICE_PORTAL
// Also supplies CUSTOMER_JOURNEY_STAGES (explicitly declared pipeline stages),
// which is observable Level-1 §3.3 item 4 data (never a "complexity" opinion).
// ──────────────────────────────────────────────

import type { AtomDetector, AtomResults, CustomerJourneyEvidence } from '../atomic-evidence-types.ts';

interface Pattern {
  name: string;
  re: RegExp;
}

// SELF_SERVICE_PORTAL ground truth (§3.1): "Customer Portal", "Client Login",
// "Dashboard" — authenticated access, NOT an acquisition path by itself.
const PORTAL_PATTERNS: Pattern[] = [
  { name: 'member login', re: /member login/i },
  { name: 'client login', re: /client login/i },
  { name: 'customer/client portal', re: /customer portal|client portal|member portal/i },
  { name: 'access dashboard', re: /access dashboard|nav-portal/i },
  { name: 'portal login route', re: /(?:href|action)=["'][^"']*\/portal\/login["']/i },
];

const JOURNEY_SECTION = /(?:our|the)?\s*(\d+)\s*(?:step|stage|phase)\s*(?:engagement\s*)?(?:methodology|journey|process|roadmap)/i;
const STEP_MARKER = /<(?:span|div|li|h\d)[^>]*class=["'][^"']*step[^"']*["'][^>]*>[\s\S]{0,80}?\b(?:step|phase|stage)\b\s*[:\s-]*(\d+)/gi;

export class SelfServiceDetector implements AtomDetector {
  detect(html: string): AtomResults {
    const results: AtomResults = {};

    for (const p of PORTAL_PATTERNS) {
      const m = html.match(p.re);
      if (m) {
        results.SELF_SERVICE_PORTAL = { present: true, anchor_text: `${p.name}: ${m[0].slice(0, 120)}` };
        break;
      }
    }

    return results;
  }

  /** Extracts explicitly declared journey stages (stable: count only real markers). */
  extractJourneyStages(html: string): CustomerJourneyEvidence | undefined {
    const declaredMatch = html.match(JOURNEY_SECTION);
    const declaredCount = declaredMatch ? Number(declaredMatch[1]) : 0;

    let stepCount = 0;
    let m: RegExpExecArray | null;
    const markers = new Set<string>();
    STEP_MARKER.lastIndex = 0;
    while ((m = STEP_MARKER.exec(html)) !== null) {
      markers.add(m[1]);
      stepCount++;
    }

    const count = Math.max(declaredCount, stepCount);
    if (count < 2) return undefined;

    return {
      stages_declared: 'PRESENT',
      expected_stage_count: count,
    };
  }
}