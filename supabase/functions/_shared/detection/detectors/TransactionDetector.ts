// ──────────────────────────────────────────────
// Transaction Detector — ADR-006 §3.1 Transaction Capability atoms.
//
// Emits: DIRECT_CHECKOUT, ONLINE_MEMBERSHIP, APP_BASED_SERVICE
// Positive-evidence driven. Absence is asserted by the AtomicEvidenceEvaluator
// only under the Evidence Sufficiency Guard (§6.1) — never as a raw substring.
// ──────────────────────────────────────────────

import type { AtomDetector, AtomResults } from '../atomic-evidence-types.ts';

interface Pattern {
  name: string;
  re: RegExp;
}

// DIRECT_CHECKOUT ground truth (§3.1): e-commerce cart, Stripe Elements,
// Shopify/WooCommerce checkout. Anchored on UI/payment markers, NOT bare
// "/checkout" substrings — a membership-plan checkout URL must not fire this.
const DIRECT_CHECKOUT_PATTERNS: Pattern[] = [
  { name: 'checkout form', re: /id=["']checkout-form["']/i },
  { name: 'checkout button', re: /(?:id|class)=["'][^"']*checkout-btn/i },
  { name: 'proceed to checkout', re: /proceed to checkout/i },
  { name: 'stripe elements', re: /stripe-elements|js\.stripe\.com/i },
  { name: 'shopify checkout', re: /checkout\.shopify\.com|shopify\.com\/checkout/i },
  { name: 'payment form action', re: /<form[^>]+action=["'][^"']*(?:\/pay|\/checkout)\b[^"']*["'][^>]*>/i },
  { name: 'cart-to-checkout widget', re: /<(?:button|a)\b[^>]*class=["'][^"']*\b(?:single_add_to_cart_button|add_to_cart_button)\b[^>]*>|<button\b[^>]*>[^<]*\badd to cart\b|<form\b[^>]*class=["'][^"']*\bcart\b[^>]*action=["'][^"']*(?:cart|checkout)/i },
];

// ONLINE_MEMBERSHIP ground truth (§3.1): recurring-plan checkout — Join Now,
// Select Membership Plan, Subscribe.
const MEMBERSHIP_PATTERNS: Pattern[] = [
  { name: 'membership plan', re: /membership plan|select membership|instant access memberships|recurring membership/i },
  { name: 'join now', re: /join now/i },
  { name: 'membership checkout url', re: /\/checkout\/membership/i },
  { name: 'recurring subscription', re: /\b(subscribe|subscription|recurring)\b.*?\b(plan|tier|pass|monthly|annual|billing)\b|\b(monthly|annual)\s+(plan|pass|subscription)/i },
];

// APP_BASED_SERVICE ground truth (§3.1): dominant links to app stores.
const APP_STORE_PATTERNS: Pattern[] = [
  { name: 'app store link', re: /apps\.apple\.com|play\.google\.com/i },
];

export class TransactionDetector implements AtomDetector {
  detect(html: string): AtomResults {
    const results: AtomResults = {};

    const firstMatch = (patterns: Pattern[]) => {
      for (const p of patterns) {
        const m = html.match(p.re);
        if (m) return { source: p.name, raw: m[0].slice(0, 120), index: m.index ?? 0 };
      }
      return null;
    };

    const checkout = firstMatch(DIRECT_CHECKOUT_PATTERNS);
    if (checkout) {
      results.DIRECT_CHECKOUT = { present: true, anchor_text: `${checkout.source}: ${checkout.raw}` };
    }

    const membership = firstMatch(MEMBERSHIP_PATTERNS);
    if (membership && !this.isNewsletterContext(html, membership.index)) {
      results.ONLINE_MEMBERSHIP = { present: true, anchor_text: `${membership.source}: ${membership.raw}` };
    }

    const app = firstMatch(APP_STORE_PATTERNS);
    if (app) {
      results.APP_BASED_SERVICE = { present: true, anchor_text: `${app.source}: ${app.raw}` };
    }

    return results;
  }

  /** Snippet-window context around a match index — scopes structural exclusions. */
  private extractSnippet(html: string, matchIndex: number, radius = 400): string {
    return html.slice(Math.max(0, matchIndex - radius), matchIndex + radius);
  }

  /** Gate 4.3 §1: free content-marketing (newsletter/blog) must NOT emit ONLINE_MEMBERSHIP. */
  private isNewsletterContext(html: string, matchIndex: number): boolean {
    return /newsletter|email updates?|blog subscri/i.test(this.extractSnippet(html, matchIndex));
  }
}