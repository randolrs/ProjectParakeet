import { describe, expect, it } from 'vitest';
import {
  OPPORTUNITY_SCORING_TOOL,
  buildContractorBlock,
  buildOpportunityBlock,
  type ScoringContractor,
} from './opportunity-scoring';
import type { NormalizedOpportunity } from '@/lib/opportunities/sources';

const fullContractor: ScoringContractor = {
  capabilitySummary: 'IT systems integration for DoD.',
  certifications: ['8(a)', 'WOSB'],
  primaryNaics: ['541512'],
  secondaryNaics: ['541511'],
  setAsideTypes: ['Total Small Business', '8(a)'],
  placeOfPerformance: { states: ['VA', 'DC'], remote: true, nationwide: false },
  hqState: 'VA',
  valueMin: 100_000,
  valueMax: 5_000_000,
  role: 'prime',
  walkAwaySignals: ['unrealistic timeline'],
  differentiators: ['DoD past performance'],
  incumbentDisplacementAppetite: 'avoid recompetes with strong incumbents',
  teamingPosture: 'prime preferred; sub on large vehicles',
  responseEffortTolerance: 'pursue high P(win) only',
};

const baseOpp: NormalizedOpportunity = {
  jurisdiction: 'federal',
  externalNoticeId: 'opp-1',
  solicitationNumber: 'W52P-25-R-0001',
  title: 'Helpdesk Modernization',
  department: 'DEPT OF DEFENSE',
  subTier: null,
  office: null,
  noticeType: 'Solicitation',
  naicsCode: '541512',
  pscCode: 'D307',
  setAsideType: 'Total Small Business',
  postedDate: '2026-05-01T00:00:00.000Z',
  responseDeadline: '2026-06-15T00:00:00.000Z',
  placeOfPerformance: { state: 'VA', city: 'Arlington' },
  descriptionUrl: 'https://sam.gov/opp/x',
  descriptionText: 'Full description here.',
  pointOfContact: null,
  rawData: {},
};

describe('OPPORTUNITY_SCORING_TOOL', () => {
  it('declares a strict input schema with the four required fields and enum recommendation', () => {
    const schema = OPPORTUNITY_SCORING_TOOL.input_schema as {
      required: string[];
      properties: Record<string, { type: string; enum?: string[]; minimum?: number; maximum?: number }>;
    };
    expect(schema.required.sort()).toEqual(
      ['bid_recommendation', 'fit_score', 'key_factors', 'reasoning_text'].sort(),
    );
    expect(schema.properties.fit_score.type).toBe('integer');
    expect(schema.properties.fit_score.minimum).toBe(0);
    expect(schema.properties.fit_score.maximum).toBe(100);
    expect(schema.properties.bid_recommendation.enum).toEqual(['bid', 'no_bid', 'watch']);
    expect(schema.properties.key_factors.type).toBe('array');
  });
});

describe('buildContractorBlock', () => {
  it('renders all sections when fully populated', () => {
    const out = buildContractorBlock(fullContractor);
    expect(out).toContain('IT systems integration for DoD.');
    expect(out).toContain('Certifications held: 8(a); WOSB');
    expect(out).toContain('Primary NAICS: 541512');
    expect(out).toContain('Set-asides eligible to pursue: Total Small Business; 8(a)');
    expect(out).toContain('Will perform: remote / states VA, DC');
    expect(out).toContain('HQ state: VA');
    expect(out).toContain('Contract value range: $100,000 to $5,000,000');
    expect(out).toContain('Role: prime');
    expect(out).toContain('Tacit judgment');
    expect(out).toContain('Walk-away signals: unrealistic timeline');
    expect(out).toContain('Incumbent-displacement appetite: avoid recompetes with strong incumbents');
  });

  it('omits empty / null sections cleanly (no orphan headers)', () => {
    const out = buildContractorBlock({
      capabilitySummary: null,
      certifications: [],
      primaryNaics: ['541512'],
      secondaryNaics: [],
      setAsideTypes: [],
      placeOfPerformance: { states: [], remote: false, nationwide: false },
      hqState: null,
      valueMin: null,
      valueMax: null,
      role: null,
      walkAwaySignals: [],
      differentiators: [],
      incumbentDisplacementAppetite: null,
      teamingPosture: null,
      responseEffortTolerance: null,
    });
    expect(out).toContain('Primary NAICS: 541512');
    // Empty judgment block should not even emit the header.
    expect(out).not.toContain('Tacit judgment');
    expect(out).not.toContain('Will perform:');
    expect(out).not.toContain('Contract value range:');
  });

  it('renders "nationwide" alone when no states are listed', () => {
    const out = buildContractorBlock({
      ...fullContractor,
      placeOfPerformance: { states: [], remote: false, nationwide: true },
    });
    expect(out).toContain('Will perform: nationwide');
  });
});

describe('buildOpportunityBlock', () => {
  it('renders core opportunity fields and full description when present', () => {
    const out = buildOpportunityBlock(baseOpp);
    expect(out).toContain('Notice type: Solicitation');
    expect(out).toContain('Title: Helpdesk Modernization');
    expect(out).toContain('Agency: DEPT OF DEFENSE');
    expect(out).toContain('NAICS: 541512');
    expect(out).toContain('PSC: D307');
    expect(out).toContain('Set-aside: Total Small Business');
    expect(out).toContain('Solicitation #: W52P-25-R-0001');
    expect(out).toContain('Full description here.');
  });

  it('flags missing description so the model leans toward "watch"', () => {
    const out = buildOpportunityBlock({ ...baseOpp, descriptionText: null });
    expect(out).toContain('Description: (not yet retrieved)');
  });

  it('shows the default set-aside label when null (eligible-for-all)', () => {
    const out = buildOpportunityBlock({ ...baseOpp, setAsideType: null });
    expect(out).toContain('Set-aside: Full and Open / Unrestricted');
  });

  it('truncates very long descriptions to keep token cost bounded', () => {
    const huge = 'X'.repeat(10_000);
    const out = buildOpportunityBlock({ ...baseOpp, descriptionText: huge });
    expect(out).toContain('[truncated]');
    expect(out.length).toBeLessThan(huge.length); // confirms we cut it
  });
});
