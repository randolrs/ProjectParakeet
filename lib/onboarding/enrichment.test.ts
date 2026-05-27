import { describe, expect, it } from 'vitest';
import { ExtractedCompanySchema, sanitizeExtracted } from './enrichment';

describe('sanitizeExtracted', () => {
  it('drops malformed codes, uppercases PSC, trims/caps lists, clamps values', () => {
    const out = sanitizeExtracted({
      naics: [
        { code: '541512', label: 'Computer Systems Design Services', sizeStandard: '$34M' },
        { code: '5415', label: 'bad', sizeStandard: '' },
      ],
      psc: ['d307', 'R4250', '70'],
      keywords: ['managed it', '', '  helpdesk  '],
      capabilitySummary: '  Cloud migration for civilian agencies.  ',
      differentiators: ['8(a)', '', 'FedRAMP', 'Cleared staff', 'Past DoD', 'Sixth'],
      valueMin: 50000,
      valueMax: -1,
    });
    expect(out.naics).toHaveLength(1);
    expect(out.naics[0].label).toBe('Computer Systems Design Services');
    expect(out.psc).toEqual(['D307']);
    expect(out.keywords).toEqual(['managed it', 'helpdesk']);
    expect(out.capabilitySummary).toBe('Cloud migration for civilian agencies.');
    expect(out.differentiators).toHaveLength(5);
    expect(out.valueMin).toBe(50000);
    expect(out.valueMax).toBeNull(); // negative clamped
  });
});

describe('ExtractedCompanySchema', () => {
  it('parses structured extraction output', () => {
    const r = ExtractedCompanySchema.safeParse({
      naics: [{ code: '541512', label: 'Computer Systems Design', sizeStandard: '$34M' }],
      psc: [],
      keywords: ['cybersecurity'],
      capabilitySummary: 'x',
      differentiators: [],
      valueMin: null,
      valueMax: null,
    });
    expect(r.success).toBe(true);
  });
});
