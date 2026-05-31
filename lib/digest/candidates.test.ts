import { describe, expect, it } from 'vitest';
import {
  selectCandidates,
  type CandidateOpportunity,
  type CandidateStore,
  type CandidateUserProfile,
} from './candidates';
import type { NormalizedOpportunity } from '@/lib/opportunities/sources';

function cand(id: string, overrides: Partial<NormalizedOpportunity> = {}): CandidateOpportunity {
  return {
    id,
    rawDataHash: `hash-${id}`,
    normalized: {
      jurisdiction: 'federal',
      externalNoticeId: id,
      solicitationNumber: null,
      title: `Opp ${id}`,
      department: 'DEPT OF DEFENSE',
      subTier: null,
      office: null,
      noticeType: 'Solicitation',
      naicsCode: '541512',
      pscCode: null,
      setAsideType: null,
      postedDate: '2026-05-01T00:00:00.000Z',
      responseDeadline: '2026-06-15T00:00:00.000Z',
      placeOfPerformance: { state: 'VA' },
      descriptionUrl: null,
      descriptionText: null,
      pointOfContact: null,
      rawData: {},
      ...overrides,
    },
  };
}

class FakeStore implements CandidateStore {
  constructor(
    private readonly profile: CandidateUserProfile | null,
    private readonly opps: CandidateOpportunity[],
  ) {}
  async loadUserProfile(): Promise<CandidateUserProfile | null> {
    return this.profile;
  }
  async loadCandidateOpportunities(): Promise<CandidateOpportunity[]> {
    return this.opps;
  }
}

const NOW = new Date('2026-05-29T00:00:00.000Z');

const baseProfile: CandidateUserProfile = {
  userId: 'u1',
  jurisdiction: 'federal',
  bidProfileVersion: 2,
  eligibility: {
    primaryNaics: ['541512'],
    secondaryNaics: ['541511'],
    setAsideTypes: ['Total Small Business', 'WOSB'],
    noticeTypes: ['Solicitation', 'Combined Synopsis/Solicitation'],
    agenciesExcluded: ['Veterans Affairs'],
    placeOfPerformance: { states: ['VA', 'DC', 'MD'], remote: false, nationwide: false },
  },
};

describe('selectCandidates', () => {
  it('throws when the user has no profile', async () => {
    const store = new FakeStore(null, []);
    await expect(selectCandidates(store, 'missing', NOW)).rejects.toThrow(/No user profile/);
  });

  it('keeps eligible opportunities and counts the dropped ones by reason', async () => {
    const store = new FakeStore(baseProfile, [
      cand('keep-1'),
      cand('keep-2', { naicsCode: '541511' }), // matches via secondary NAICS
      cand('drop-naics', { naicsCode: '999999' }),
      cand('drop-notice-type', { noticeType: 'Award Notice' }),
      cand('drop-set-aside', { setAsideType: 'HUBZone' }),
      cand('drop-agency', { department: 'DEPT OF VETERANS AFFAIRS' }),
      cand('drop-pop', { placeOfPerformance: { state: 'CA' } }),
    ]);

    const result = await selectCandidates(store, 'u1', NOW);
    expect(result.candidatesConsidered).toBe(7);
    expect(result.eligible.map((e) => e.id).sort()).toEqual(['keep-1', 'keep-2']);
    expect(result.dropCounts).toEqual({
      naics_mismatch: 1,
      notice_type_excluded: 1,
      set_aside_ineligible: 1,
      agency_excluded: 1,
      place_of_performance_mismatch: 1,
    });
    expect(result.jurisdiction).toBe('federal');
    expect(result.bidProfileVersion).toBe(2);
  });

  it('carries opportunity id + raw_data_hash through (needed downstream for scoring cache)', async () => {
    const store = new FakeStore(baseProfile, [cand('opp-9')]);
    const result = await selectCandidates(store, 'u1', NOW);
    expect(result.eligible[0].id).toBe('opp-9');
    expect(result.eligible[0].rawDataHash).toBe('hash-opp-9');
  });

  it('an opp that fails two rules counts in both drop buckets (observability)', async () => {
    const store = new FakeStore(baseProfile, [
      cand('multi', { naicsCode: '999999', noticeType: 'Award Notice' }),
    ]);
    const result = await selectCandidates(store, 'u1', NOW);
    expect(result.eligible).toHaveLength(0);
    expect(result.dropCounts).toEqual({ naics_mismatch: 1, notice_type_excluded: 1 });
  });
});
