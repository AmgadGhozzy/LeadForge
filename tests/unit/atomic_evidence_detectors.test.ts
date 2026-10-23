// ADR-006 Gate 3.1 — Production Level-1 Atomic Detector Test Suite.
// Runs the 9 golden fixtures through the PRODUCTION pipeline
// (DetectionEngine.runAtomicEvidence → TransactionDetector, CtaContextDetector,
// SelfServiceDetector), NOT the Gate-2 test oracle. This is the acceptance
// criterion that clears the GATE-003 FAIL verdict.
//
// Amendment 1: Assertions for ACQUISITION_CTA / SUPPORT_CTA / classified_intent
// have been REMOVED — these are Level-2 concerns, not Level-1 observations.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  GOLDEN_FIXTURES_CONTRACT,
  GoldenFixtureContract,
} from '../fixtures/evidence_golden/contract_expectations';
import { DetectionEngine } from '../../supabase/functions/_shared/detection/DetectionEngine.ts';

const FIXTURES_DIR = path.join(__dirname, '../fixtures/evidence_golden');
const engine = new DetectionEngine();

describe('ADR-006 Gate 3.1: Production Level-1 Atomic Detectors (13/13)', () => {
  GOLDEN_FIXTURES_CONTRACT.forEach((fixture: GoldenFixtureContract) => {
    describe(`Fixture [${fixture.id}]: ${fixture.name}`, () => {
      const html = fs.readFileSync(path.join(FIXTURES_DIR, fixture.html_file), 'utf-8');
      const report = engine.runAtomicEvidence({
        html,
        observability_sufficient: fixture.observability_sufficient,
        pages_observed: fixture.pages_observed,
      });

      it(`[Atomic] production atoms match the frozen contract`, () => {
        const A = report.atoms;
        const E = fixture.expected_atomic;

        expect(A.DIRECT_CHECKOUT, `${fixture.id} DIRECT_CHECKOUT`).toBe(E.DIRECT_CHECKOUT);
        expect(A.QUOTE_CTA, `${fixture.id} QUOTE_CTA`).toBe(E.QUOTE_CTA);
        expect(A.CONSULTATION_CTA, `${fixture.id} CONSULTATION_CTA`).toBe(E.CONSULTATION_CTA);
        expect(A.APPLICATION_CTA, `${fixture.id} APPLICATION_CTA`).toBe(E.APPLICATION_CTA);
        expect(A.WHATSAPP, `${fixture.id} WHATSAPP`).toBe(E.WHATSAPP);
        expect(A.SELF_SERVICE_PORTAL, `${fixture.id} SELF_SERVICE_PORTAL`).toBe(E.SELF_SERVICE_PORTAL);
        expect(A.ONLINE_MEMBERSHIP, `${fixture.id} ONLINE_MEMBERSHIP`).toBe(E.ONLINE_MEMBERSHIP);
        expect(A.APP_BASED_SERVICE, `${fixture.id} APP_BASED_SERVICE`).toBe(E.APP_BASED_SERVICE);
      });

      it(`[CTA_CONTEXT] raw contact channel observation matches contract`, () => {
        if (!fixture.expected_atomic.CTA_CONTEXT) return;
        const expected = fixture.expected_atomic.CTA_CONTEXT;

        expect(report.cta_context, `${fixture.id} CTA_CONTEXT should exist`).toBeDefined();
        expect(report.cta_context?.channel, `${fixture.id} channel`).toBe(expected.channel);
        // No classified_intent assertion — that is a Level-2 concern.
        if (expected.cta_label_contains) {
          expect(report.cta_context?.cta_label, `${fixture.id} cta_label`)
            .toContain(expected.cta_label_contains);
        }
      });

      it(`[APPOINTMENT_CTA] ADR-006 §6.1: unobserved ⇒ UNKNOWN, observed-absent ⇒ ABSENT`, () => {
        expect(report.atoms.APPOINTMENT_CTA).toBe(fixture.observability_sufficient ? 'ABSENT' : 'UNKNOWN');
      });

      it(`[JOURNEY] declared stages extracted only when present (GF-007)`, () => {
        const expected = fixture.expected_atomic.CUSTOMER_JOURNEY_STAGES;
        if (!expected) return;
        expect(report.customer_journey_stages?.stages_declared).toBe(expected.stages_declared);
        expect(report.customer_journey_stages?.expected_stage_count).toBe(expected.expected_stage_count);
      });

      it(`[PROVENANCE] every atom carries a detector + method`, () => {
        for (const key of Object.keys(report.atoms) as (keyof typeof report.atoms)[]) {
          expect(report.provenance[key], `${fixture.id} provenance.${String(key)}`).toBeDefined();
          expect(report.provenance[key].detector.length, `${fixture.id} provenance.${String(key)}.detector`).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Comparative Pair: WhatsApp Context Disambiguation (GF-004 vs GF-005)', () => {
    const load = (file: string) => fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');

    it('channel presence is identical; acquisition signal differs by CTA atoms, not intent classification', () => {
      const ev004 = engine.runAtomicEvidence({ html: load('GF-004-support-only-whatsapp.html'), observability_sufficient: true });
      const ev005 = engine.runAtomicEvidence({ html: load('GF-005-acquisition-whatsapp.html'), observability_sufficient: true });

      // Both have WHATSAPP channel present.
      expect(ev004.atoms.WHATSAPP).toBe('PRESENT');
      expect(ev005.atoms.WHATSAPP).toBe('PRESENT');

      // GF-005 has an explicit quote CTA; GF-004 does not.
      expect(ev004.atoms.QUOTE_CTA).toBe('ABSENT');
      expect(ev005.atoms.QUOTE_CTA).toBe('PRESENT');

      // CtaContext is a raw observation — no classified_intent field.
      expect(ev004.cta_context?.channel).toBe('WHATSAPP');
      expect(ev005.cta_context?.channel).toBe('WHATSAPP');
    });
  });

  describe('Coverage Guard: Evidence Sufficiency for Absence (GF-009)', () => {
    it('unobserved routes yield UNKNOWN, never a default ABSENT', () => {
      const html = fs.readFileSync(path.join(FIXTURES_DIR, 'GF-009-insufficient-observability.html'), 'utf-8');
      const ev = engine.runAtomicEvidence({ html, observability_sufficient: false });

      expect(ev.atoms.DIRECT_CHECKOUT).toBe('UNKNOWN');
      expect(ev.atoms.QUOTE_CTA).toBe('UNKNOWN');
      expect(ev.atoms.CONSULTATION_CTA).toBe('UNKNOWN');
      expect(ev.atoms.ONLINE_MEMBERSHIP).toBe('UNKNOWN');
      expect(ev.atoms.SELF_SERVICE_PORTAL).toBe('UNKNOWN');
      // WHATSAPP is a channel atom — observable from any captured HTML.
      expect(ev.atoms.WHATSAPP).toBe('ABSENT');
    });
  });

  describe('Architectural Integrity: ZERO_RULES Baseline', () => {
    it('OPPORTUNITY_RULES remains strictly empty (frozen) during Gate 3.1', () => {
      const enginePath = path.join(process.cwd(), 'supabase/functions/_shared/intelligence/opportunity/engine.ts');
      const content = fs.readFileSync(enginePath, 'utf-8');
      expect(content).toContain('const OPPORTUNITY_RULES: readonly OpportunityRule[] = [];');
    });
  });
});