import { describe, expect, it } from 'vitest';
import { ExtractedCompanySchema, sanitizeExtracted } from './enrichment';

describe('sanitizeExtracted', () => {
  it('drops malformed codes, uppercases PSC, trims, and caps differentiators', () => {
    const out = sanitizeExtracted({
      naics: ['541512', '5415', '999999', 'abcdef'],
      psc: ['d307', 'R4250', '70'],
      capabilitySummary: '  Cloud migration for civilian agencies.  ',
      differentiators: ['8(a)', '', 'FedRAMP', 'Cleared staff', 'Past DoD work', 'Sixth'],
    });
    expect(out.naics).toEqual(['541512', '999999']);
    expect(out.psc).toEqual(['D307']);
    expect(out.capabilitySummary).toBe('Cloud migration for civilian agencies.');
    expect(out.differentiators).toHaveLength(5);
    expect(out.differentiators).not.toContain('');
  });
});

describe('ExtractedCompanySchema', () => {
  it('parses structured extraction output', () => {
    const r = ExtractedCompanySchema.safeParse({
      naics: ['541512'],
      psc: [],
      capabilitySummary: 'x',
      differentiators: [],
    });
    expect(r.success).toBe(true);
  });
});
