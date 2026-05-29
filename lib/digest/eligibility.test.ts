import { describe, expect, it } from 'vitest';
import { evaluateEligibility, type EligibilityProfile } from './eligibility';
import type { NormalizedOpportunity } from '@/lib/opportunities/sources';

function opp(overrides: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity {
  return {
    jurisdiction: 'federal',
    externalNoticeId: 'x1',
    solicitationNumber: null,
    title: 'X',
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
  };
}

function profile(overrides: Partial<EligibilityProfile> = {}): EligibilityProfile {
  return {
    primaryNaics: ['541512'],
    secondaryNaics: [],
    setAsideTypes: ['Total Small Business', 'WOSB'],
    noticeTypes: ['Solicitation', 'Combined Synopsis/Solicitation'],
    agenciesExcluded: [],
    placeOfPerformance: { states: ['VA', 'DC', 'MD'], remote: false, nationwide: false },
    ...overrides,
  };
}

const NOW = new Date('2026-05-29T00:00:00.000Z');

describe('evaluateEligibility', () => {
  it('passes a clean match', () => {
    expect(evaluateEligibility(opp(), profile(), NOW)).toEqual({ eligible: true, reasons: [] });
  });

  it('rejects a closed deadline', () => {
    const r = evaluateEligibility(opp({ responseDeadline: '2026-05-01T00:00:00.000Z' }), profile(), NOW);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('deadline_passed');
  });

  it('does not reject when responseDeadline is null (active vehicles, no closing date)', () => {
    expect(
      evaluateEligibility(opp({ responseDeadline: null }), profile(), NOW).reasons,
    ).not.toContain('deadline_passed');
  });

  it('rejects a notice type the user did not select', () => {
    const r = evaluateEligibility(opp({ noticeType: 'Award Notice' }), profile(), NOW);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('notice_type_excluded');
  });

  it('passes any notice type if the user list is empty (no restriction)', () => {
    const r = evaluateEligibility(opp({ noticeType: 'Award Notice' }), profile({ noticeTypes: [] }), NOW);
    expect(r.reasons).not.toContain('notice_type_excluded');
  });

  it('rejects when the NAICS does not match the user pool', () => {
    const r = evaluateEligibility(opp({ naicsCode: '236220' }), profile(), NOW);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('naics_mismatch');
  });

  it('matches NAICS via secondary list (not only primary)', () => {
    const r = evaluateEligibility(
      opp({ naicsCode: '236220' }),
      profile({ primaryNaics: ['541512'], secondaryNaics: ['236220'] }),
      NOW,
    );
    expect(r.reasons).not.toContain('naics_mismatch');
  });

  it('treats null naics as a mismatch when the user has restrictions', () => {
    const r = evaluateEligibility(opp({ naicsCode: null }), profile(), NOW);
    expect(r.reasons).toContain('naics_mismatch');
  });

  it('passes any NAICS when the user has no NAICS configured (broad default)', () => {
    const r = evaluateEligibility(
      opp({ naicsCode: '236220' }),
      profile({ primaryNaics: [], secondaryNaics: [] }),
      NOW,
    );
    expect(r.reasons).not.toContain('naics_mismatch');
  });

  it('passes a null set-aside (full and open competition)', () => {
    const r = evaluateEligibility(opp({ setAsideType: null }), profile(), NOW);
    expect(r.reasons).not.toContain('set_aside_ineligible');
  });

  it('passes "full and open" set-aside even for a user with no certs', () => {
    const r = evaluateEligibility(
      opp({ setAsideType: 'Full and Open' }),
      profile({ setAsideTypes: [] }),
      NOW,
    );
    expect(r.reasons).not.toContain('set_aside_ineligible');
  });

  it('rejects a restricted set-aside when the user is not eligible', () => {
    const r = evaluateEligibility(
      opp({ setAsideType: '8(a) Sole Source' }),
      profile({ setAsideTypes: ['Total Small Business', 'WOSB'] }),
      NOW,
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('set_aside_ineligible');
  });

  it('accepts substring matches on set-aside (vendor formatting varies)', () => {
    const r = evaluateEligibility(
      opp({ setAsideType: 'Total Small Business Set-Aside (FAR 19.5)' }),
      profile({ setAsideTypes: ['Total Small Business'] }),
      NOW,
    );
    expect(r.reasons).not.toContain('set_aside_ineligible');
  });

  it('rejects when the opportunity department is on the user excluded list', () => {
    const r = evaluateEligibility(
      opp({ department: 'DEPT OF VETERANS AFFAIRS' }),
      profile({ agenciesExcluded: ['Veterans Affairs'] }),
      NOW,
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('agency_excluded');
  });

  it('rejects when the place-of-performance state is outside the user list', () => {
    const r = evaluateEligibility(opp({ placeOfPerformance: { state: 'CA' } }), profile(), NOW);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('place_of_performance_mismatch');
  });

  it('does not reject on missing place-of-performance (defer to scoring)', () => {
    const r = evaluateEligibility(opp({ placeOfPerformance: null }), profile(), NOW);
    expect(r.reasons).not.toContain('place_of_performance_mismatch');
  });

  it('handles SAM-shaped placeOfPerformance ({ state: { code: "NC" } })', () => {
    const r = evaluateEligibility(
      opp({ placeOfPerformance: { state: { code: 'NC' } } }),
      profile({ placeOfPerformance: { states: ['NC'], remote: false, nationwide: false } }),
      NOW,
    );
    expect(r.eligible).toBe(true);
  });

  it('nationwide swallows place restrictions entirely', () => {
    const r = evaluateEligibility(
      opp({ placeOfPerformance: { state: 'AK' } }),
      profile({ placeOfPerformance: { states: [], remote: false, nationwide: true } }),
      NOW,
    );
    expect(r.reasons).not.toContain('place_of_performance_mismatch');
  });

  it('with no states and no nationwide, a known POP state is rejected unless user is remote-only', () => {
    const r = evaluateEligibility(
      opp({ placeOfPerformance: { state: 'VA' } }),
      profile({ placeOfPerformance: { states: [], remote: false, nationwide: false } }),
      NOW,
    );
    expect(r.reasons).toContain('place_of_performance_mismatch');

    const remote = evaluateEligibility(
      opp({ placeOfPerformance: { state: 'VA' } }),
      profile({ placeOfPerformance: { states: [], remote: true, nationwide: false } }),
      NOW,
    );
    expect(remote.reasons).not.toContain('place_of_performance_mismatch');
  });

  it('aggregates all failing reasons (lossy reasons would hide bugs)', () => {
    const r = evaluateEligibility(
      opp({ naicsCode: '999999', noticeType: 'Award Notice', setAsideType: 'HUBZone' }),
      profile({
        primaryNaics: ['541512'],
        noticeTypes: ['Solicitation'],
        setAsideTypes: ['WOSB'],
      }),
      NOW,
    );
    expect(r.reasons.sort()).toEqual(
      ['naics_mismatch', 'notice_type_excluded', 'set_aside_ineligible'].sort(),
    );
  });
});
