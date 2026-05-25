import { describe, expect, it } from 'vitest';
import { GovConApiSource } from './govconapi-source';
import { NormalizedOpportunitySchema } from './types';

const baseOpp = (descriptionText: string | null) =>
  NormalizedOpportunitySchema.parse({
    jurisdiction: 'federal',
    externalNoticeId: 'gc-1',
    solicitationNumber: null,
    title: 'X',
    department: null,
    subTier: null,
    office: null,
    noticeType: 'Solicitation',
    naicsCode: null,
    pscCode: null,
    setAsideType: null,
    postedDate: '2026-01-01T00:00:00.000Z',
    responseDeadline: null,
    placeOfPerformance: null,
    descriptionUrl: null,
    descriptionText,
    pointOfContact: null,
    rawData: {},
  });

describe('GovConApiSource', () => {
  it('declares descriptionsInline=true and a per-hour budget', () => {
    const source = new GovConApiSource();
    expect(source.capabilities.descriptionsInline).toBe(true);
    expect(source.capabilities.requestBudget.perHour).toBe(1000);
  });

  it('fetchDescription passes through the inline text without spending budget', async () => {
    const source = new GovConApiSource();
    const text = await source.fetchDescription(baseOpp('Inline description text.'));
    expect(text).toBe('Inline description text.');
  });

  it('fetchDescription throws if inline text is unexpectedly missing', async () => {
    const source = new GovConApiSource();
    await expect(source.fetchDescription(baseOpp(null))).rejects.toThrow();
  });

  it('search() throws a clear pending error until a real sample is mapped', async () => {
    const source = new GovConApiSource();
    await expect(
      source.search({ postedFrom: '01/01/2026', postedTo: '01/02/2026', limit: 5, offset: 0 }),
    ).rejects.toThrow(/not implemented yet/i);
  });

  // Blocked on a real GovConAPI sample response (see STATUS.md, M0). Once the
  // response schema is known, implement the parser and enable this to assert a
  // clean parse AND that descriptionText is populated inline.
  it.skip('REAL: narrow search parses with inline descriptions (pending GovConAPI sample)', () => {});
});
