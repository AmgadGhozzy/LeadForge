// ──────────────────────────────────────────────
// TechStack Detector
// Replaces _shared/scraper/detectors/tech-detector.ts
// ──────────────────────────────────────────────

import {
  Detector, DetectionResult, EvidenceSignal,
  DetectionMethod, scoreToLevel,
} from '../types.ts';

interface TechCheck {
  type: string;
  category: string;
  selector: string;
  patterns: string[];
  source: DetectionMethod;
}

const TECH_CHECKS: TechCheck[] = [
  // ─── CMS ──────────────────────────────────
  {
    type: 'wordpress', category: 'CMS',
    selector: 'meta[generator*=WordPress] | /wp-content/ | /wp-json/',
    patterns: ['wp-content', 'wp-includes', 'wp-json', 'wordpress'],
    source: DetectionMethod.META_TAG,
  },
  {
    type: 'wix', category: 'CMS',
    selector: 'meta[generator*=Wix] | static.wixstatic.com',
    patterns: ['wixstatic.com', 'wix.com', '_wixPerformanceMeasure'],
    source: DetectionMethod.HTML_SCAN,
  },
  {
    type: 'squarespace', category: 'CMS',
    selector: 'meta[generator*=Squarespace] | static.squarespace.com',
    patterns: ['squarespace.com', 'squarespace-cdn.com', 'static1.squarespace.com'],
    source: DetectionMethod.HTML_SCAN,
  },
  {
    type: 'webflow', category: 'CMS',
    selector: 'meta[generator*=Webflow] | assets.website-files.com',
    patterns: ['webflow.io', 'assets.website-files.com', 'webflow'],
    source: DetectionMethod.HTML_SCAN,
  },
  {
    type: 'joomla', category: 'CMS',
    selector: 'meta[generator*=Joomla] | /media/jui/',
    patterns: ['joomla', '/media/jui/', '/components/com_'],
    source: DetectionMethod.META_TAG,
  },
  {
    type: 'drupal', category: 'CMS',
    selector: 'meta[generator*=Drupal] | /sites/default/files/',
    patterns: ['drupal', '/sites/default/files/', 'drupal.settings'],
    source: DetectionMethod.META_TAG,
  },
  // ─── eCommerce ────────────────────────────
  {
    type: 'shopify', category: 'eCommerce',
    selector: 'script[src*=cdn.shopify.com]',
    patterns: ['cdn.shopify.com', 'shopify.com/s/', 'Shopify.theme'],
    source: DetectionMethod.SCRIPT_SCAN,
  },
  {
    type: 'woocommerce', category: 'eCommerce',
    selector: 'body.woocommerce | /wc-ajax/',
    patterns: ['woocommerce', 'wc-ajax', '/cart/'],
    source: DetectionMethod.HTML_SCAN,
  },
  {
    type: 'magento', category: 'eCommerce',
    selector: 'script[type=text/x-magento-init]',
    patterns: ['magento', 'mage/', 'x-magento-init'],
    source: DetectionMethod.HTML_SCAN,
  },
  // ─── Frameworks ───────────────────────────
  {
    type: 'nextjs', category: 'Framework',
    selector: 'script[id=__NEXT_DATA__] | /_next/',
    patterns: ['__next_data__', '/_next/', 'next.js'],
    source: DetectionMethod.HTML_SCAN,
  },
  {
    type: 'nuxtjs', category: 'Framework',
    selector: 'window.__nuxt | /_nuxt/',
    patterns: ['__nuxt', '/_nuxt/', 'nuxt.js'],
    source: DetectionMethod.HTML_SCAN,
  },
  {
    type: 'react', category: 'Framework',
    selector: 'data-reactroot | window.__REACT',
    patterns: ['data-reactroot', 'react-dom', '__react'],
    source: DetectionMethod.HTML_SCAN,
  },
  {
    type: 'vue', category: 'Framework',
    selector: 'data-v- attributes | vue.js',
    patterns: ['vue.js', 'vue.min.js', 'data-v-'],
    source: DetectionMethod.HTML_SCAN,
  },
  {
    type: 'angular', category: 'Framework',
    selector: 'ng-version attribute | angular.js',
    patterns: ['ng-version', 'angular.js', 'angular.min.js'],
    source: DetectionMethod.HTML_SCAN,
  },
];

export interface DetectedTechItem {
  category: string;
  name: string;
  version: string | null;
}

export class TechStackDetector implements Detector {
  // Expose for backward compat with enrichment-service
  detectedItems: DetectedTechItem[] = [];

  detect(html: string): DetectionResult {
    const htmlLower = html.toLowerCase();
    const positive: EvidenceSignal[] = [];
    const negative: EvidenceSignal[] = [];
    this.detectedItems = [];

    // Extract meta generator once
    const metaGen = (htmlLower.match(/meta[^>]*name=["']generator["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '';

    for (const check of TECH_CHECKS) {
      const found = check.patterns.some(p => {
        const pl = p.toLowerCase();
        return htmlLower.includes(pl) || metaGen.includes(pl);
      });

      if (found) {
        const matchedPattern = check.patterns.find(p => htmlLower.includes(p.toLowerCase()) || metaGen.includes(p.toLowerCase()));
        positive.push({
          type: check.type,
          source: check.source,
          selector: check.selector,
          value: matchedPattern!,
        });
        this.detectedItems.push({ category: check.category, name: check.type, version: null });
      } else {
        negative.push({
          type: check.type,
          source: check.source,
          selector: check.selector,
          value: null,
        });
      }
    }

    const detected = positive.length > 0;
    const score = detected ? Math.min(95, 70 + positive.length * 8) : 85;

    const reason = detected
      ? `Tech stack detected: ${positive.map(s => s.type).join(', ')}.`
      : `No known CMS, framework, or eCommerce platform detected in scanned pages.`;

    return {
      detected,
      confidence: { score, reason },
      evidence_level: detected ? scoreToLevel(score) : 'STRONG',
      positive_signals: positive,
      negative_signals: negative,
      method: DetectionMethod.HTML_SCAN,
      metadata: { platforms_found: positive.length },
    };
  }
}
