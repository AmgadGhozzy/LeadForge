import { describe, it, expect } from 'vitest';
import {
  extractDbpgEvidence,
  hasArabicCharacters,
  DBPG_STATUS_CONFIG,
} from '@/features/dashboard/utils/dbpg-Shared';

describe('dbpg-Shared helper', () => {
  it('handles null/undefined business gracefully', () => {
    const result = extractDbpgEvidence(null);
    expect(result.status).toBe('UNKNOWN');
    expect(result.statusLabel).toBe('Needs Crawl / Unknown');
    expect(result.engineVersion).toBe('DBPG v2.1');
  });

  it('detects NOT_APPLICABLE when business has no website', () => {
    const result = extractDbpgEvidence({
      id: 'biz-1',
      name: 'No Web Clinic',
      website: null,
      status: 'NEW',
    });
    expect(result.status).toBe('NOT_APPLICABLE');
    expect(result.statusLabel).toBe('Not Applicable');
    expect(result.auditTrail).toContain('No website URL present');
  });

  it('detects UNKNOWN when business has website but has not been analyzed', () => {
    const result = extractDbpgEvidence({
      id: 'biz-2',
      name: 'Unanalyzed Spa',
      website: 'https://example.com',
      status: 'READY_FOR_ANALYSIS',
      website_analyses: [],
    });
    expect(result.status).toBe('UNKNOWN');
    expect(result.auditTrail).toContain('Observability insufficient');
  });

  it('detects OPPORTUNITY_DETECTED when consultative clinic has no booking system', () => {
    const result = extractDbpgEvidence({
      id: 'biz-3',
      name: 'Dental Care Clinic',
      website: 'https://dental.example.com',
      status: 'ANALYZED',
      categories: { name: 'Dental Clinic' },
      website_analyses: [
        {
          id: 'ana-1',
          lead_score: 85,
          recommended_offer: 'ai-website-audit',
        },
      ],
      business_capabilities: [{ type: 'whatsapp' }],
      business_technologies: [],
      contacts: [{ type: 'WHATSAPP', value: '+971501234567' }],
    });
    expect(result.status).toBe('OPPORTUNITY_DETECTED');
    expect(result.statusLabel).toBe('Verified Booking Gap');
    expect(result.atoms.CONSULTATION_CTA).toBe('PRESENT');
    expect(result.atoms.APPOINTMENT_CTA).toBe('ABSENT');
    expect(result.atoms.WHATSAPP).toBe('PRESENT');
    expect(result.verificationStrength).toBe('UNVERIFIED_EXTERNAL_STATE');
    expect(result.auditTrail).toContain('Opportunity detected: pre-booking intent present');
  });

  it('detects NO_GAP when booking capability or technology is present', () => {
    const result = extractDbpgEvidence({
      id: 'biz-4',
      name: 'Modern Medical Center',
      website: 'https://med.example.com',
      status: 'ANALYZED',
      categories: { name: 'Medical Clinic' },
      website_analyses: [{ id: 'ana-2', lead_score: 50 }],
      business_capabilities: [{ type: 'booking' }],
      business_technologies: [{ category: 'Booking', name: 'Calendly' }],
    });
    expect(result.status).toBe('NO_GAP');
    expect(result.statusLabel).toBe('Digital Booking Active');
    expect(result.atoms.APPOINTMENT_CTA).toBe('PRESENT');
    expect(result.auditTrail).toContain('Booking capability (APPOINTMENT_CTA) is actively present');
  });

  it('detects SUPPRESSED when e-commerce checkout is detected', () => {
    const result = extractDbpgEvidence({
      id: 'biz-5',
      name: 'E-Shop Retail',
      website: 'https://shop.example.com',
      status: 'ANALYZED',
      categories: { name: 'Online Store' },
      website_analyses: [{ id: 'ana-3', lead_score: 30 }],
      business_capabilities: [],
      business_technologies: [{ category: 'Ecommerce', name: 'Shopify' }],
    });
    expect(result.status).toBe('SUPPRESSED');
    expect(result.statusLabel).toBe('Suppressed / E-Commerce');
    expect(result.atoms.DIRECT_CHECKOUT).toBe('PRESENT');
    expect(result.auditTrail).toContain('Suppressed due to active exclusions');
  });

  it('extracts explicit DBPG record when present in analysis', () => {
    const result = extractDbpgEvidence({
      id: 'biz-6',
      name: 'Explicit Lead',
      website: 'https://explicit.example.com',
      status: 'ANALYZED',
      digital_booking_path_gap: {
        status: 'OPPORTUNITY_DETECTED',
        verification_strength: 'VERIFIED_EXTERNAL_STATE',
        audit_trail: 'Explicit gate evaluation match',
        atoms: {
          CONSULTATION_CTA: 'PRESENT',
          APPOINTMENT_CTA: 'ABSENT',
          QUOTE_CTA: 'PRESENT',
          WHATSAPP: 'PRESENT',
          DIRECT_CHECKOUT: 'ABSENT',
          SELF_SERVICE_PORTAL: 'ABSENT',
        },
      },
    });
    expect(result.status).toBe('OPPORTUNITY_DETECTED');
    expect(result.verificationStrength).toBe('VERIFIED_EXTERNAL_STATE');
    expect(result.verificationLabel).toBe('Externally Verified');
    expect(result.auditTrail).toBe('Explicit gate evaluation match');
    expect(result.atoms.CONSULTATION_CTA).toBe('PRESENT');
  });

  it('correctly identifies Arabic characters', () => {
    expect(hasArabicCharacters('عيادة الأمل')).toBe(true);
    expect(hasArabicCharacters('Dr. Ahmed Clinic')).toBe(false);
    expect(hasArabicCharacters('مركز النور للتجميل - Al Noor Spa')).toBe(true);
    expect(hasArabicCharacters(null)).toBe(false);
  });
});
