// Golden Fixtures Contract Test Suite (ADR-006 Gate 2)
// Tests the Evidence layer independently against declared contracts.
// Contract test on public Evidence interface, NOT private implementation internals.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  GOLDEN_FIXTURES_CONTRACT,
  GoldenFixtureContract,
} from '../fixtures/evidence_golden/contract_expectations';
import { GoldenEvidenceEvaluator } from '../../src/domain/evidence/golden-evidence-evaluator';

const FIXTURES_DIR = path.join(__dirname, '../fixtures/evidence_golden');
const evaluator = new GoldenEvidenceEvaluator();

describe('ADR-006 Gate 2: Golden Fixtures Benchmark Suite (9/9)', () => {
  GOLDEN_FIXTURES_CONTRACT.forEach((fixture: GoldenFixtureContract) => {
    describe(`Fixture [${fixture.id}]: ${fixture.name}`, () => {
      const htmlPath = path.join(FIXTURES_DIR, fixture.html_file);
      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

      const evaluation = evaluator.evaluate({
        html: htmlContent,
        observability_sufficient: fixture.observability_sufficient,
        pages_observed: fixture.pages_observed,
      });

      // ────────────────────────────────────────────────────────────────────────
      // Test Phase 1: Level 1 Atomic Website Evidence
      // ────────────────────────────────────────────────────────────────────────
      it(`[Phase 1 Atomic] Extracts expected Level 1 evidence atoms`, () => {
        const expected = fixture.expected_atomic;
        const actual = evaluation.atomic;

        expect(actual.DIRECT_CHECKOUT, `${fixture.id} DIRECT_CHECKOUT mismatch`).toBe(expected.DIRECT_CHECKOUT);
        expect(actual.QUOTE_CTA, `${fixture.id} QUOTE_CTA mismatch`).toBe(expected.QUOTE_CTA);
        expect(actual.CONSULTATION_CTA, `${fixture.id} CONSULTATION_CTA mismatch`).toBe(expected.CONSULTATION_CTA);
        expect(actual.APPLICATION_CTA, `${fixture.id} APPLICATION_CTA mismatch`).toBe(expected.APPLICATION_CTA);
        expect(actual.ACQUISITION_CTA, `${fixture.id} ACQUISITION_CTA mismatch`).toBe(expected.ACQUISITION_CTA);
        expect(actual.SUPPORT_CTA, `${fixture.id} SUPPORT_CTA mismatch`).toBe(expected.SUPPORT_CTA);
        expect(actual.WHATSAPP, `${fixture.id} WHATSAPP mismatch`).toBe(expected.WHATSAPP);
        expect(actual.SELF_SERVICE_PORTAL, `${fixture.id} SELF_SERVICE_PORTAL mismatch`).toBe(expected.SELF_SERVICE_PORTAL);
        expect(actual.ONLINE_MEMBERSHIP, `${fixture.id} ONLINE_MEMBERSHIP mismatch`).toBe(expected.ONLINE_MEMBERSHIP);
        expect(actual.APP_BASED_SERVICE, `${fixture.id} APP_BASED_SERVICE mismatch`).toBe(expected.APP_BASED_SERVICE);

        // CTA_CONTEXT assertions
        if (expected.CTA_CONTEXT) {
          expect(actual.CTA_CONTEXT, `${fixture.id} CTA_CONTEXT should be defined`).toBeDefined();
          expect(actual.CTA_CONTEXT?.classified_intent, `${fixture.id} classified_intent mismatch`)
            .toBe(expected.CTA_CONTEXT.classified_intent);

          if (expected.CTA_CONTEXT.cta_label_contains) {
            expect(actual.CTA_CONTEXT?.cta_label_contains, `${fixture.id} cta_label should contain expected text`)
              .toContain(expected.CTA_CONTEXT.cta_label_contains);
          }
        }

        // Multi-Stage Journey assertions
        if (expected.CUSTOMER_JOURNEY_STAGES) {
          expect(actual.CUSTOMER_JOURNEY_STAGES?.stages_declared, `${fixture.id} stages_declared mismatch`)
            .toBe(expected.CUSTOMER_JOURNEY_STAGES.stages_declared);
          expect(actual.CUSTOMER_JOURNEY_STAGES?.expected_stage_count, `${fixture.id} stage_count mismatch`)
            .toBe(expected.CUSTOMER_JOURNEY_STAGES.expected_stage_count);
        }
      });

      // ────────────────────────────────────────────────────────────────────────
      // Test Phase 2: Level 2 Derived Commercial Signals
      // ────────────────────────────────────────────────────────────────────────
      it(`[Phase 2 Derived] Deterministically derives Level 2 commercial signals`, () => {
        const expected = fixture.expected_derived;
        const actual = evaluation.derived;

        expect(actual.HAS_ACQUISITION_PATH, `${fixture.id} HAS_ACQUISITION_PATH mismatch`)
          .toBe(expected.HAS_ACQUISITION_PATH);
        expect(actual.HAS_SELF_SERVICE_PATH, `${fixture.id} HAS_SELF_SERVICE_PATH mismatch`)
          .toBe(expected.HAS_SELF_SERVICE_PATH);
        expect(actual.REQUIRES_HUMAN_INTERACTION, `${fixture.id} REQUIRES_HUMAN_INTERACTION mismatch`)
          .toBe(expected.REQUIRES_HUMAN_INTERACTION);
        expect(actual.HAS_MULTI_STAGE_JOURNEY, `${fixture.id} HAS_MULTI_STAGE_JOURNEY mismatch`)
          .toBe(expected.HAS_MULTI_STAGE_JOURNEY);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Comparative Pair Tests (GF-004 vs GF-005): WhatsApp != Acquisition
  // ────────────────────────────────────────────────────────────────────────────
  describe('Comparative Pair: WhatsApp Context Disambiguation', () => {
    it('GF-004 (Support) and GF-005 (Acquisition) prove that WhatsApp channel presence alone does not imply Acquisition', () => {
      const gf004Html = fs.readFileSync(path.join(FIXTURES_DIR, 'GF-004-support-only-whatsapp.html'), 'utf-8');
      const gf005Html = fs.readFileSync(path.join(FIXTURES_DIR, 'GF-005-acquisition-whatsapp.html'), 'utf-8');

      const ev004 = evaluator.evaluate({ html: gf004Html, observability_sufficient: true });
      const ev005 = evaluator.evaluate({ html: gf005Html, observability_sufficient: true });

      // Both have WhatsApp
      expect(ev004.atomic.WHATSAPP).toBe('PRESENT');
      expect(ev005.atomic.WHATSAPP).toBe('PRESENT');

      // Intent differs based on context
      expect(ev004.atomic.CTA_CONTEXT?.classified_intent).toBe('SUPPORT');
      expect(ev005.atomic.CTA_CONTEXT?.classified_intent).toBe('ACQUISITION');

      // GF-004 must NOT have acquisition path
      expect(ev004.derived.HAS_ACQUISITION_PATH).toBe('ABSENT');
      // GF-005 MUST have acquisition path
      expect(ev005.derived.HAS_ACQUISITION_PATH).toBe('PRESENT');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Evidence Sufficiency Guard (GF-009)
  // ────────────────────────────────────────────────────────────────────────────
  describe('Coverage Guard: Evidence Sufficiency for Absence', () => {
    it('GF-009 returns UNKNOWN for unobserved routes, never defaulting to ABSENT', () => {
      const gf009Html = fs.readFileSync(path.join(FIXTURES_DIR, 'GF-009-insufficient-observability.html'), 'utf-8');
      const ev009 = evaluator.evaluate({ html: gf009Html, observability_sufficient: false });

      expect(ev009.atomic.DIRECT_CHECKOUT).toBe('UNKNOWN');
      expect(ev009.atomic.QUOTE_CTA).toBe('UNKNOWN');
      expect(ev009.atomic.CONSULTATION_CTA).toBe('UNKNOWN');
      expect(ev009.derived.HAS_SELF_SERVICE_PATH).toBe('UNKNOWN');
      expect(ev009.derived.REQUIRES_HUMAN_INTERACTION).toBe('UNKNOWN');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Architectural Integrity: Zero Opportunity Rules Guarantee
  // ────────────────────────────────────────────────────────────────────────────
  describe('Architectural Integrity: ZERO_RULES Baseline', () => {
    it('OPPORTUNITY_RULES remains strictly empty (frozen) during Gate 2', async () => {
      const enginePath = path.join(process.cwd(), 'supabase/functions/_shared/intelligence/opportunity/engine.ts');
      const content = fs.readFileSync(enginePath, 'utf-8');
      expect(content).toContain('const OPPORTUNITY_RULES: readonly OpportunityRule[] = [];');
    });
  });
});
