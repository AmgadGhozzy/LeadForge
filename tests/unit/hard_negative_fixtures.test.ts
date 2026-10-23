// ADR-006 Gate 3.1 — Hard Negative Control Test Suite (HARD_NEGATIVE_CONTROL_SPEC v2)
// Guards the four forensic failure modes from ADR-006 §1.2:
//   HF-001  Regulatory disclosure       (Lendo hn-006)  — footer phone/email must NOT fire QUOTE_CTA or CONSULTATION_CTA
//   HF-002  Emergency dispatch          (Morni hn-007)  — dispatch channel must NOT produce acquisition atoms
//   HF-003  Support-only WhatsApp       (PureGym hn-014)— WhatsApp + support context = no acquisition CTA atoms
//   HF-004  Self-service subscription   (FitnessFirst/Hive hn-015/016) — membership checkout = ONLINE_MEMBERSHIP only
//   HF-005  Bare WhatsApp icon          (ambiguous)     — no CTA atoms from bare icon; WHATSAPP = PRESENT only
//
// Amendment 1: ACQUISITION_CTA / SUPPORT_CTA / classified_intent removed from assertions.
// These hard negatives now verify that the raw detectors do NOT emit false acquisition CTA atoms.
// "UNKNOWN is a valid result, not a detector failure."

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DetectionEngine } from '../../supabase/functions/_shared/detection/DetectionEngine.ts';

const HF_DIR = path.join(__dirname, '../fixtures/hard_negatives');
const engine = new DetectionEngine();

const run = (file: string) =>
  engine.runAtomicEvidence({
    html: fs.readFileSync(path.join(HF_DIR, file), 'utf-8'),
    observability_sufficient: true,
  });

describe('ADR-006 Gate 3.1: Hard Negative Controls — no false acquisition atoms (5/5)', () => {
  it('HF-001 Regulatory Disclosure: footer legal phone/email produces no acquisition CTA atoms', () => {
    const r = run('HF-001-regulatory-disclosure.html');
    // Channel is raw-observed (PHONE or EMAIL), but no acquisition CTAs should fire.
    expect(r.cta_context?.channel).toMatch(/^(PHONE|EMAIL)$/);
    expect(r.atoms.QUOTE_CTA).toBe('ABSENT');
    expect(r.atoms.CONSULTATION_CTA).toBe('ABSENT');
    expect(r.atoms.APPLICATION_CTA).toBe('ABSENT');
    // WHATSAPP was not on the page.
    expect(r.atoms.WHATSAPP).toBe('ABSENT');
  });

  it('HF-002 Emergency Dispatch: dispatch channel produces no acquisition CTAs; app evidence preserved', () => {
    const r = run('HF-002-emergency-dispatch.html');
    expect(r.atoms.QUOTE_CTA).toBe('ABSENT');
    expect(r.atoms.CONSULTATION_CTA).toBe('ABSENT');
    expect(r.atoms.APPLICATION_CTA).toBe('ABSENT');
    // The dispatch service has an app — this is a real raw signal.
    expect(r.atoms.APP_BASED_SERVICE).toBe('PRESENT');
  });

  it('HF-003 Support-only WhatsApp: WHATSAPP = PRESENT, but no acquisition CTA atoms', () => {
    const r = run('HF-003-support-only-whatsapp.html');
    expect(r.atoms.WHATSAPP).toBe('PRESENT');
    // No acquisition path atoms — support context does NOT fire QUOTE/CONSULTATION/APPLICATION CTAs.
    expect(r.atoms.QUOTE_CTA).toBe('ABSENT');
    expect(r.atoms.CONSULTATION_CTA).toBe('ABSENT');
    expect(r.atoms.APPLICATION_CTA).toBe('ABSENT');
    // CtaContext is a raw observation (channel = WHATSAPP, no intent field).
    expect(r.cta_context?.channel).toBe('WHATSAPP');
  });

  it('HF-004 Self-service subscription: ONLINE_MEMBERSHIP = PRESENT; not a quote/consultation service', () => {
    const r = run('HF-004-self-service-subscription.html');
    expect(r.atoms.ONLINE_MEMBERSHIP).toBe('PRESENT');
    expect(r.atoms.DIRECT_CHECKOUT).toBe('ABSENT');
    expect(r.atoms.SELF_SERVICE_PORTAL).toBe('PRESENT');
    // Membership checkout is self-service, NOT a human-interaction CTA.
    expect(r.atoms.QUOTE_CTA).toBe('ABSENT');
    expect(r.atoms.CONSULTATION_CTA).toBe('ABSENT');
  });

  it('HF-005 Bare WhatsApp icon: WHATSAPP = PRESENT only; no false acquisition CTA atoms fired', () => {
    const r = run('HF-005-bare-whatsapp-icon.html');
    expect(r.atoms.WHATSAPP).toBe('PRESENT');
    // No surrounding context → no CTA patterns matched → no acquisition atoms.
    expect(r.atoms.QUOTE_CTA).toBe('ABSENT');
    expect(r.atoms.CONSULTATION_CTA).toBe('ABSENT');
    expect(r.atoms.APPLICATION_CTA).toBe('ABSENT');
    // CtaContext is populated (raw channel observation), but with empty/minimal label.
    expect(r.cta_context?.channel).toBe('WHATSAPP');
  });
});