import { describe, expect, it } from 'vitest';
import {
  type EligibilityCriteria,
  loadJurisdictionStrategy,
} from './jurisdictions';
import { FederalJurisdictionStrategy } from './jurisdictions/federal';
import { SledJurisdictionStrategy } from './jurisdictions/sled';
import { NormalizedOpportunitySchema, type NormalizedOpportunity } from './sources';

const makeOpp = (over: Partial<NormalizedOpportunity>): NormalizedOpportunity =>
  NormalizedOpportunitySchema.parse({
    jurisdiction: 'federal',
    externalNoticeId: 'n1',
    solicitationNumber: null,
    title: 'Test',
    department: 'DEPT OF DEFENSE',
    subTier: null,
    office: null,
    noticeType: 'Solicitation',
    naicsCode: '541330',
    pscCode: null,
    setAsideType: null,
    postedDate: '2026-01-01T00:00:00.000Z',
    responseDeadline: null,
    placeOfPerformance: null,
    descriptionUrl: null,
    descriptionText: null,
    pointOfContact: null,
    rawData: {},
    ...over,
  });

const noCriteria: EligibilityCriteria = {
  naicsCodes: [],
  setAsideTypes: [],
  noticeTypes: [],
  agenciesExcluded: [],
};

describe('FederalJurisdictionStrategy', () => {
  const strategy = new FederalJurisdictionStrategy();

  it('defaults the digest delivery hour to 7 and tags jurisdiction federal', () => {
    expect(strategy.defaultDigestDeliveryHour).toBe(7);
    expect(strategy.jurisdiction).toBe('federal');
  });

  it('exposes the expanded in-scope notice types, early-stage first', () => {
    expect(strategy.vocabulary.noticeTypes).toEqual([
      'Sources Sought',
      'Presolicitation',
      'Combined Synopsis/Solicitation',
      'Solicitation',
      'Special Notice',
      'Award Notice',
    ]);
  });

  it('normalize guarantees the federal jurisdiction tag', () => {
    const tagged = strategy.normalize(makeOpp({ jurisdiction: 'something-else' }));
    expect(tagged.jurisdiction).toBe('federal');
  });

  it('rejects out-of-scope notice types', () => {
    expect(
      strategy.isEligible(makeOpp({ noticeType: 'Justification and Approval (J&A)' }), noCriteria),
    ).toBe(false);
  });

  it('accepts an in-scope opportunity when no criteria restrict it', () => {
    expect(strategy.isEligible(makeOpp({}), noCriteria)).toBe(true);
  });

  it('filters on the NAICS spine', () => {
    const criteria = { ...noCriteria, naicsCodes: ['561720'] };
    expect(strategy.isEligible(makeOpp({ naicsCode: '541330' }), criteria)).toBe(false);
    expect(strategy.isEligible(makeOpp({ naicsCode: '561720' }), criteria)).toBe(true);
  });

  it('excludes opportunities from excluded agencies', () => {
    const criteria = { ...noCriteria, agenciesExcluded: ['dept of defense'] };
    expect(strategy.isEligible(makeOpp({ department: 'DEPT OF DEFENSE' }), criteria)).toBe(false);
  });
});

describe('SledJurisdictionStrategy', () => {
  const strategy = new SledJurisdictionStrategy();

  it('throws on every operational method', () => {
    expect(() => strategy.source()).toThrow(/not yet supported/i);
    expect(() => strategy.normalize(makeOpp({}))).toThrow(/not yet supported/i);
    expect(() => strategy.isEligible(makeOpp({}), noCriteria)).toThrow(/not yet supported/i);
  });
});

describe('loadJurisdictionStrategy', () => {
  it('loads federal and sled, and throws on unknown', async () => {
    expect(await loadJurisdictionStrategy('federal')).toBeInstanceOf(FederalJurisdictionStrategy);
    expect(await loadJurisdictionStrategy('sled')).toBeInstanceOf(SledJurisdictionStrategy);
    await expect(loadJurisdictionStrategy('mars')).rejects.toThrow(/unknown jurisdiction/i);
  });
});
