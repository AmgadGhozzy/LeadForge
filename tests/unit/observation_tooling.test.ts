import { describe, it, expect } from 'vitest';
import { samplePopulation, deduplicateByLatestDomain } from '../../scripts/audit/sampler.js';
import {
  classifyAdjudication,
  buildConfusionMatrix,
  computeRuleHealth,
  buildAssessmentReportArtifact,
  FROZEN_THRESHOLDS,
} from '../../scripts/audit/calculator.js';
import { adaptProductionObservationRow } from '../../scripts/audit/adapter.js';
import type { ProductionObservationRow } from '../../scripts/audit/adapter.js';
import { createMulberry32, createDeterministicSeed, sha256 } from '../../scripts/audit/prng.js';
import { ObservationRecord, AuditRecord, AdjudicatedItem } from '../../scripts/audit/types.js';

describe('GATE-005.12: Observation Tooling Unit Tests', () => {
  // Mock fixtures generator
  function makeMockObservation(
    id: string,
    domain: string,
    output: 'OPPORTUNITY_DETECTED' | 'NO_OPPORTUNITY' | 'SUPPRESSED' | 'NOT_APPLICABLE' | 'UNKNOWN' | 'EVALUATION_SKIPPED',
    rule: 'digital-booking' | 'quote-intake' = 'digital-booking',
    date = '2026-09-01T10:00:00Z'
  ): ObservationRecord {
    return {
      observation_id: id,
      source_run_id: `run-${id}`,
      window_id: '2026-W01',
      rule_slug: rule,
      rule_version: '1.0.0',
      domain,
      evaluated_at: date,
      rule_output: output,
      reason: `Rule evaluated ${domain}`,
      level1_atoms: { has_booking_path: output === 'NO_OPPORTUNITY' },
      derived_atoms: { booking_confidence: 0.85 },
      evidence_snapshot_hash: sha256(`snapshot-${domain}`),
    };
  }

  function makeMockAudit(
    auditId: string,
    obsId: string,
    domain: string,
    status: 'CONFIRMED' | 'NOT_CONFIRMED' | 'UNABLE_TO_VERIFY',
    cohort: 'DETECTED' | 'NON_DETECTED',
    rule: 'digital-booking' | 'quote-intake' = 'digital-booking'
  ): AuditRecord {
    return {
      audit_id: auditId,
      observation_id: obsId,
      domain,
      rule_slug: rule,
      cohort,
      independent_status: status,
      business_state_evidence: `Verified at https://${domain}`,
      verification_source: 'MANUAL_INSPECTION',
      auditor_id: 'auditor-001',
      adjudicated_at: '2026-09-02T12:00:00Z',
      notes: 'Independent check completed',
    };
  }

  describe('Criterion 6 & 7: Deterministic Sampling & PRNG Reproducibility', () => {
    it('Mulberry32 produces identical sequence for same seed', () => {
      const prng1 = createMulberry32(123456789);
      const prng2 = createMulberry32(123456789);

      const seq1 = Array.from({ length: 5 }, () => prng1());
      const seq2 = Array.from({ length: 5 }, () => prng2());

      expect(seq1).toEqual(seq2);
    });

    it('samplePopulation produces identical Cohort A and Cohort B across runs', () => {
      const observations: ObservationRecord[] = [];
      for (let i = 0; i < 70; i++) {
        observations.push(makeMockObservation(`obs-det-${i}`, `detected-${i}.com`, 'OPPORTUNITY_DETECTED'));
      }
      for (let i = 0; i < 150; i++) {
        observations.push(makeMockObservation(`obs-nondet-${i}`, `nondet-${i}.com`, 'NO_OPPORTUNITY'));
      }

      const run1 = samplePopulation(observations, '2026-W01', 'digital-booking', 50, 100);
      const run2 = samplePopulation(observations, '2026-W01', 'digital-booking', 50, 100);

      expect(run1.manifest.manifest_hash).toBe(run2.manifest.manifest_hash);
      expect(run1.manifest.population_hash).toBe(run2.manifest.population_hash);
      expect(run1.manifest.sampling_seed).toBe(run2.manifest.sampling_seed);

      expect(run1.cohortA.map((r) => r.observation_id)).toEqual(run2.cohortA.map((r) => r.observation_id));
      expect(run1.cohortB.map((r) => r.observation_id)).toEqual(run2.cohortB.map((r) => r.observation_id));
      expect(run1.cohortA.length).toBe(50);
      expect(run1.cohortB.length).toBe(100);
    });

    it('deduplicates multiple evaluations of the same domain, keeping the latest', () => {
      const obsOld = makeMockObservation('obs-old', 'clinic.com', 'NO_OPPORTUNITY', 'digital-booking', '2026-09-01T10:00:00Z');
      const obsNew = makeMockObservation('obs-new', 'clinic.com', 'OPPORTUNITY_DETECTED', 'digital-booking', '2026-09-05T10:00:00Z');

      const deduplicated = deduplicateByLatestDomain([obsOld, obsNew]);
      expect(deduplicated.length).toBe(1);
      expect(deduplicated[0].observation_id).toBe('obs-new');
      expect(deduplicated[0].rule_output).toBe('OPPORTUNITY_DETECTED');
    });
  });

  describe('Criterion 10, 11 & 12: Outcome Adjudication & UNABLE_TO_VERIFY Isolation', () => {
    it('classifies TP, FP, FN, TN deterministically', () => {
      const obsDet = makeMockObservation('obs-1', 'a.com', 'OPPORTUNITY_DETECTED');
      const obsNonDet = makeMockObservation('obs-2', 'b.com', 'NO_OPPORTUNITY');

      const auditConfirm = makeMockAudit('aud-1', 'obs-1', 'a.com', 'CONFIRMED', 'DETECTED');
      const auditReject = makeMockAudit('aud-2', 'obs-1', 'a.com', 'NOT_CONFIRMED', 'DETECTED');

      expect(classifyAdjudication(obsDet, auditConfirm)).toBe('TP');
      expect(classifyAdjudication(obsDet, auditReject)).toBe('FP');

      const auditFn = makeMockAudit('aud-3', 'obs-2', 'b.com', 'CONFIRMED', 'NON_DETECTED');
      const auditTn = makeMockAudit('aud-4', 'obs-2', 'b.com', 'NOT_CONFIRMED', 'NON_DETECTED');

      expect(classifyAdjudication(obsNonDet, auditFn)).toBe('FN');
      expect(classifyAdjudication(obsNonDet, auditTn)).toBe('TN');
    });

    it('strictly isolates UNABLE_TO_VERIFY and does not convert it to TN or FN', () => {
      const obsDet = makeMockObservation('obs-1', 'a.com', 'OPPORTUNITY_DETECTED');
      const obsNonDet = makeMockObservation('obs-2', 'b.com', 'NO_OPPORTUNITY');

      const auditInconclusive1 = makeMockAudit('aud-1', 'obs-1', 'a.com', 'UNABLE_TO_VERIFY', 'DETECTED');
      const auditInconclusive2 = makeMockAudit('aud-2', 'obs-2', 'b.com', 'UNABLE_TO_VERIFY', 'NON_DETECTED');

      expect(classifyAdjudication(obsDet, auditInconclusive1)).toBe('INCONCLUSIVE');
      expect(classifyAdjudication(obsNonDet, auditInconclusive2)).toBe('INCONCLUSIVE');

      const items: AdjudicatedItem[] = [
        { observation_id: '1', domain: 'a.com', rule_slug: 'digital-booking', rule_output: 'OPPORTUNITY_DETECTED', audit_status: 'UNABLE_TO_VERIFY', classification: 'INCONCLUSIVE' },
      ];
      const matrix = buildConfusionMatrix(items);
      expect(matrix.inconclusive).toBe(1);
      expect(matrix.tp).toBe(0);
      expect(matrix.fp).toBe(0);
      expect(matrix.fn).toBe(0);
      expect(matrix.tn).toBe(0);
      expect(matrix.effective_sample_size).toBe(0);
    });
  });

  describe('Criterion 13 & 14: Pre-declared Thresholds & Sample Size Gate', () => {
    it('declares INSUFFICIENT_SAMPLE if n < 50, even if precision is 100%', () => {
      const observations: ObservationRecord[] = [];
      const audits: AuditRecord[] = [];

      // Only 10 detected observations, all 10 confirmed (100% precision)
      for (let i = 0; i < 10; i++) {
        const id = `obs-${i}`;
        observations.push(makeMockObservation(id, `domain-${i}.com`, 'OPPORTUNITY_DETECTED'));
        audits.push(makeMockAudit(`aud-${i}`, id, `domain-${i}.com`, 'CONFIRMED', 'DETECTED'));
      }

      const health = computeRuleHealth('digital-booking', '2026-W01', observations, audits);

      expect(health.precision).toBe(1.0);
      expect(health.threshold_compliance.sample_size_pass).toBe(false);
      expect(health.verdict).toBe('INSUFFICIENT_SAMPLE'); // NOT HEALTHY
    });

    it('declares HEALTHY when sample >= 50 and all pre-declared thresholds are met', () => {
      const observations: ObservationRecord[] = [];
      const audits: AuditRecord[] = [];

      // 60 detected: 50 TP, 10 FP (Precision = 50/60 = 0.833 >= 0.70, FP rate = 0.167 <= 0.30)
      for (let i = 0; i < 50; i++) {
        const id = `obs-tp-${i}`;
        observations.push(makeMockObservation(id, `tp-${i}.com`, 'OPPORTUNITY_DETECTED'));
        audits.push(makeMockAudit(`aud-tp-${i}`, id, `tp-${i}.com`, 'CONFIRMED', 'DETECTED'));
      }
      for (let i = 0; i < 10; i++) {
        const id = `obs-fp-${i}`;
        observations.push(makeMockObservation(id, `fp-${i}.com`, 'OPPORTUNITY_DETECTED'));
        audits.push(makeMockAudit(`aud-fp-${i}`, id, `fp-${i}.com`, 'NOT_CONFIRMED', 'DETECTED'));
      }

      // Non-detected: 10 FN, 90 TN (Recall = 50 / (50 + 10) = 50/60 = 0.833 >= 0.60)
      for (let i = 0; i < 10; i++) {
        const id = `obs-fn-${i}`;
        observations.push(makeMockObservation(id, `fn-${i}.com`, 'NO_OPPORTUNITY'));
        audits.push(makeMockAudit(`aud-fn-${i}`, id, `fn-${i}.com`, 'CONFIRMED', 'NON_DETECTED'));
      }
      for (let i = 0; i < 90; i++) {
        const id = `obs-tn-${i}`;
        observations.push(makeMockObservation(id, `tn-${i}.com`, 'NO_OPPORTUNITY'));
        audits.push(makeMockAudit(`aud-tn-${i}`, id, `tn-${i}.com`, 'NOT_CONFIRMED', 'NON_DETECTED'));
      }

      const health = computeRuleHealth('digital-booking', '2026-W01', observations, audits);

      expect(health.threshold_compliance.sample_size_pass).toBe(true);
      expect(health.threshold_compliance.precision_pass).toBe(true);
      expect(health.threshold_compliance.recall_pass).toBe(true);
      expect(health.threshold_compliance.fp_rate_pass).toBe(true);
      expect(health.verdict).toBe('HEALTHY');
      expect(health.rollback_triggered).toBe(false);
    });

    it('triggers rollback when FP rate exceeds 0.30 in 2 consecutive windows', () => {
      const observations: ObservationRecord[] = [];
      const audits: AuditRecord[] = [];

      // 50 detected: 30 TP, 20 FP (Precision = 30/50 = 0.60, FP Rate = 20/50 = 0.40 > 0.30)
      for (let i = 0; i < 30; i++) {
        const id = `obs-tp-${i}`;
        observations.push(makeMockObservation(id, `tp-${i}.com`, 'OPPORTUNITY_DETECTED'));
        audits.push(makeMockAudit(`aud-tp-${i}`, id, `tp-${i}.com`, 'CONFIRMED', 'DETECTED'));
      }
      for (let i = 0; i < 20; i++) {
        const id = `obs-fp-${i}`;
        observations.push(makeMockObservation(id, `fp-${i}.com`, 'OPPORTUNITY_DETECTED'));
        audits.push(makeMockAudit(`aud-fp-${i}`, id, `fp-${i}.com`, 'NOT_CONFIRMED', 'DETECTED'));
      }

      // First window violation
      const window1 = computeRuleHealth('digital-booking', '2026-W01', observations, audits, 0);
      expect(healthFailed(window1)).toBe(true);
      expect(window1.consecutive_window_violations).toBe(1);
      expect(window1.rollback_triggered).toBe(false);

      // Second consecutive window violation
      const window2 = computeRuleHealth('digital-booking', '2026-W02', observations, audits, window1.consecutive_window_violations);
      expect(window2.consecutive_window_violations).toBe(2);
      expect(window2.rollback_triggered).toBe(true);
    });
  });

  describe('Criterion 1, 3, 4 & 15: Architectural Boundaries & Provenance', () => {
    it('buildAssessmentReportArtifact aggregates both active rules correctly', () => {
      const dbpgAssessment = computeRuleHealth('digital-booking', '2026-W01', [], []);
      const qigAssessment = computeRuleHealth('quote-intake', '2026-W01', [], []);

      const report = buildAssessmentReportArtifact('2026-W01', 'pop-hash-1', 'manifest-hash-1', {
        'digital-booking': dbpgAssessment,
        'quote-intake': qigAssessment,
      });

      expect(report.window_id).toBe('2026-W01');
      expect(report.population_hash).toBe('pop-hash-1');
      expect(report.overall_engine_status).toBe('INSUFFICIENT_SAMPLE');
      expect(report.assessments['digital-booking']).toBeDefined();
      expect(report.assessments['quote-intake']).toBeDefined();
      // WAPG must not exist in assessments
      expect((report.assessments as Record<string, unknown>)['website-acquisition']).toBeUndefined();
    });
  });

  describe('GATE-005.13-P1-A §6.5: Tooling Type Amendment (D5-rev Companion)', () => {
    it('(a) D6 census path: returns ALL non-detected records when nonDetectedTarget covers the pool (incl. SUPPRESSED and NOT_APPLICABLE)', () => {
      const records: ObservationRecord[] = [];
      records.push(makeMockObservation('obs-det', 'detected.com', 'OPPORTUNITY_DETECTED'));
      records.push(makeMockObservation('obs-nogap', 'a-nogap.com', 'NO_OPPORTUNITY'));
      records.push(makeMockObservation('obs-supp', 'b-supp.com', 'SUPPRESSED'));
      records.push(makeMockObservation('obs-unk', 'c-unk.com', 'UNKNOWN'));
      records.push(makeMockObservation('obs-na', 'd-na.com', 'NOT_APPLICABLE'));

      const result = samplePopulation(records, '2026-W01', 'digital-booking', 50, 100);
      expect(result.cohortB.length).toBe(4); // full census — D6 short-circuit (target 100 >= pool 4)
      const ids = result.cohortB.map((r) => r.observation_id).sort();
      expect(ids).toEqual(['obs-na', 'obs-nogap', 'obs-supp', 'obs-unk']);
      // Full-census short-circuit returns the sorted pool in domain order
      expect(result.cohortB.map((r) => r.domain)).toEqual(result.cohortB.map((r) => r.domain).sort());
    });

    it('(b) EVALUATION_SKIPPED is excluded from Cohort B (outside the outcome vocabulary)', () => {
      const records: ObservationRecord[] = [
        makeMockObservation('obs-det', 'detected.com', 'OPPORTUNITY_DETECTED'),
        makeMockObservation('obs-nogap', 'nogap.com', 'NO_OPPORTUNITY'),
        makeMockObservation('obs-skipped', 'skipped.com', 'EVALUATION_SKIPPED'),
      ];

      const result = samplePopulation(records, '2026-W01', 'digital-booking', 50, 100);
      expect(result.cohortB.length).toBe(1);
      expect(result.cohortB[0].observation_id).toBe('obs-nogap');
      expect(result.cohortB.map((r) => r.observation_id)).not.toContain('obs-skipped');
    });

    it('(c) SUPPRESSED and NOT_APPLICABLE classify identically to NO_OPPORTUNITY (CONFIRMED -> FN, NOT_CONFIRMED -> TN)', () => {
      const auditConfirmed = (id: string) => makeMockAudit(`aud-${id}`, id, 'x.com', 'CONFIRMED', 'NON_DETECTED');
      const auditDenied = (id: string) => makeMockAudit(`aud-${id}`, id, 'x.com', 'NOT_CONFIRMED', 'NON_DETECTED');

      expect(classifyAdjudication(makeMockObservation('s1', 'x.com', 'SUPPRESSED'), auditConfirmed('s1'))).toBe('FN');
      expect(classifyAdjudication(makeMockObservation('s2', 'x.com', 'SUPPRESSED'), auditDenied('s2'))).toBe('TN');
      expect(classifyAdjudication(makeMockObservation('n1', 'x.com', 'NOT_APPLICABLE'), auditConfirmed('n1'))).toBe('FN');
      expect(classifyAdjudication(makeMockObservation('n2', 'x.com', 'NOT_APPLICABLE'), auditDenied('n2'))).toBe('TN');

      // Full matrix roll-up: 2 SUPPRESSED/NOT_APPLICABLE FN + 2 TN, no unknown impact
      const items: AdjudicatedItem[] = [
        { observation_id: 's1', domain: 'x.com', rule_slug: 'digital-booking', rule_output: 'SUPPRESSED', audit_status: 'CONFIRMED', classification: 'FN' },
        { observation_id: 's2', domain: 'x.com', rule_slug: 'digital-booking', rule_output: 'SUPPRESSED', audit_status: 'NOT_CONFIRMED', classification: 'TN' },
        { observation_id: 'n1', domain: 'x.com', rule_slug: 'digital-booking', rule_output: 'NOT_APPLICABLE', audit_status: 'CONFIRMED', classification: 'FN' },
        { observation_id: 'n2', domain: 'x.com', rule_slug: 'digital-booking', rule_output: 'NOT_APPLICABLE', audit_status: 'NOT_CONFIRMED', classification: 'TN' },
      ];
      const matrix = buildConfusionMatrix(items);
      expect(matrix.fn).toBe(2);
      expect(matrix.tn).toBe(2);
      expect(matrix.tp).toBe(0);
      expect(matrix.fp).toBe(0);
    });

    it('(d) unknownCount increments only on UNKNOWN regardless of pool widening', () => {
      const records: ObservationRecord[] = [
        makeMockObservation('k-unk-1', 'u1.com', 'UNKNOWN'),
        makeMockObservation('k-unk-2', 'u2.com', 'UNKNOWN'),
        makeMockObservation('k-supp', 's.com', 'SUPPRESSED'),
        makeMockObservation('k-na', 'n.com', 'NOT_APPLICABLE'),
        makeMockObservation('k-nogap', 'g.com', 'NO_OPPORTUNITY'),
      ];
      const audits: AuditRecord[] = [
        makeMockAudit('aud-u1', 'k-unk-1', 'u1.com', 'CONFIRMED', 'NON_DETECTED'),
        makeMockAudit('aud-u2', 'k-unk-2', 'u2.com', 'NOT_CONFIRMED', 'NON_DETECTED'),
        makeMockAudit('aud-s', 'k-supp', 's.com', 'CONFIRMED', 'NON_DETECTED'),
        makeMockAudit('aud-n', 'k-na', 'n.com', 'NOT_CONFIRMED', 'NON_DETECTED'),
        makeMockAudit('aud-g', 'k-nogap', 'g.com', 'NOT_CONFIRMED', 'NON_DETECTED'),
      ];

      const health = computeRuleHealth('digital-booking', '2026-W01', records, audits);
      expect(health.unknown_rate).toBeCloseTo(2 / 5); // only the 2 UNKNOWN rows
      expect(health.matrix.fn).toBe(2); // unk-1, supp confirmed
      expect(health.matrix.tn).toBe(3); // unk-2, na, nogap NOT_CONFIRMED
      // unknownRate is the separate flag computed from rule_output === 'UNKNOWN' (§7 OQ-2)
    });
  });

  describe('GATE-005.13-P1-A §5.1: Production-to-Tooling Row Adapter', () => {
    function baseRow(overrides: Partial<ProductionObservationRow> = {}): ProductionObservationRow {
      return {
        id: '0ea3f000-0000-0000-0000-000000000001',
        source_run_id: 'run-abc-123',
        batch_window_id: null,
        rule_slug: 'digital_booking_path_gap',
        rule_version: '1.0.0',
        domain: 'clinic.example.com',
        evaluated_at: '2026-10-01T12:00:00Z',
        rule_output: 'NO_GAP',
        audit_trail: 'Booking capability check complete.',
        verification_strength: 'UNVERIFIED_EXTERNAL_STATE',
        code_sha: 'abc123def',
        confidence_signals: ['intent:CONSULTATION_CTA', 'absent:APPOINTMENT_CTA'],
        level1_atoms: { CONSULTATION_CTA: 'PRESENT', APPOINTMENT_CTA: 'ABSENT' },
        evidence_snapshot_hash: 'f' + '0'.repeat(63),
        ...overrides,
      };
    }

    it('maps slugs, statuses (NO_GAP -> NO_OPPORTUNITY), window_id, confidence_signals, and rule_version accurately', () => {
      const record = adaptProductionObservationRow(baseRow());
      expect(record.rule_slug).toBe('digital-booking');
      expect(record.rule_output).toBe('NO_OPPORTUNITY');
      expect(record.window_id).toBe('live-2026-10'); // batch_window_id ?? 'live-' + evaluated_at.slice(0, 7)
      expect(record.reason).toBe('Booking capability check complete.');
      expect(record.rule_version).toBe('1.0.0');
      expect(record.source_run_id).toBe('run-abc-123');
      expect(record.confidence_signals).toEqual(['intent:CONSULTATION_CTA', 'absent:APPOINTMENT_CTA']);
      expect(record.observation_id).toBe('0ea3f000-0000-0000-0000-000000000001');
    });

    it('maps census batch windows, QIG slug, SUPPRESSED/NOT_APPLICABLE identity pass-through, and null fields', () => {
      const census = adaptProductionObservationRow(baseRow({ batch_window_id: 'census-2026-c0' }));
      expect(census.window_id).toBe('census-2026-c0');

      expect(adaptProductionObservationRow(baseRow({ rule_slug: 'quote_consultation_intake_gap' })).rule_slug).toBe('quote-intake');
      expect(adaptProductionObservationRow(baseRow({ rule_output: 'SUPPRESSED' })).rule_output).toBe('SUPPRESSED');
      expect(adaptProductionObservationRow(baseRow({ rule_output: 'NOT_APPLICABLE' })).rule_output).toBe('NOT_APPLICABLE');
      expect(adaptProductionObservationRow(baseRow({ rule_output: 'OPPORTUNITY_DETECTED' })).rule_output).toBe('OPPORTUNITY_DETECTED');
      expect(adaptProductionObservationRow(baseRow({ rule_output: 'UNKNOWN' })).rule_output).toBe('UNKNOWN');

      const bare = adaptProductionObservationRow(baseRow({ verification_strength: null, code_sha: null, confidence_signals: null }));
      expect(bare.verification_strength).toBeNull();
      expect(bare.code_sha).toBeUndefined();
      expect(bare.confidence_signals).toBeUndefined();
    });

    it('is fail-closed on unknown slugs, unknown statuses, and non-primitive atoms', () => {
      expect(() => adaptProductionObservationRow(baseRow({ rule_slug: 'website_acquisition_path_gap' }))).toThrow(/unknown production rule_slug/);
      expect(() => adaptProductionObservationRow(baseRow({ rule_output: 'NOT_A_REAL_STATUS' }))).toThrow(/unknown production rule_output/);
      expect(() => adaptProductionObservationRow(baseRow({ level1_atoms: { bad: { nested: 'object' } } as Document } as Partial<ProductionObservationRow> as ProductionObservationRow)))
        .toThrow(/not a primitive atom value/);
    });
  });

  function healthFailed(h: ReturnType<typeof computeRuleHealth>) {
    return h.verdict === 'UNHEALTHY';
  }
});
