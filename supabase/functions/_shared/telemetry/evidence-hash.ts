// ──────────────────────────────────────────────
// Gate 5.13-P1-A: Deep-Canonical Web Crypto Evidence Hash
// Shared by the live path and the zero-LLM batch runner.
// Contract: docs/contracts/GATE-005.13-P1-A-design-contract.md §4.3
// ──────────────────────────────────────────────

export interface StoredRuleInputs {
  readonly atoms: Record<string, string>;
  readonly journey: Record<string, unknown>;
  readonly observability: {
    readonly observability_sufficient: boolean;
    readonly pages_observed: readonly string[];
  };
  readonly external_state?: Record<string, unknown> | null;
}

const VOLATILE_KEYS = new Set([
  'timestamp', 'scraped_at', 'evaluated_at', 'created_at',
  'scan_id', 'run_id', 'request_id', 'session_id',
  'duration_ms', 'tokens_consumed', 'latency'
]);

/**
 * Deeply canonicalizes objects and arrays:
 * - Recursively sorts object keys and strips volatile fields
 * - Sorts arrays of primitives
 * - Sorts arrays of objects by their canonical JSON representation
 */
export function deepCanonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    const canonicalizedList = value.map(item => deepCanonicalize(item));
    if (canonicalizedList.every(item => typeof item === 'string' || typeof item === 'number')) {
      // Numbers sort numerically; everything else by strict code-unit comparison —
      // locale-independent and identical across every platform/runtime
      // (unlike the default sort or localeCompare).
      return [...canonicalizedList].sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        const sa = String(a);
        const sb = String(b);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      });
    }
    // Deterministic sorting of arrays of objects by canonical JSON string,
    // compared with strict code-unit comparison (locale-independent).
    return [...canonicalizedList].sort((a, b) => {
      const sa = JSON.stringify(a);
      const sb = JSON.stringify(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
  }

  const sortedKeys = Object.keys(value as Record<string, unknown>)
    .filter(key => !VOLATILE_KEYS.has(key))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const val = (value as Record<string, unknown>)[key];
    if (val !== undefined) {
      result[key] = deepCanonicalize(val);
    }
  }

  return result;
}

/**
 * Computes deterministic SHA-256 fingerprint using Web Crypto API.
 */
export async function computeEvidenceSnapshotHash(ruleInputs: StoredRuleInputs): Promise<string> {
  const canonicalData = deepCanonicalize(ruleInputs);
  const jsonString = JSON.stringify(canonicalData);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
