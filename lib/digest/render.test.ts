import { describe, expect, it } from 'vitest';
import { buildSubject, renderDigest } from './render';
import type { DigestSynthesis, RankedEntry } from './synthesis';
import type { CandidateOpportunity } from './candidates';
import type { OpportunityScore } from './scoring';

function cand(
  id: string,
  overrides: Partial<CandidateOpportunity['normalized']> = {},
): CandidateOpportunity {
  return {
    id,
    rawDataHash: `h-${id}`,
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
      setAsideType: 'Total Small Business',
      postedDate: '2026-05-01T00:00:00.000Z',
      responseDeadline: '2026-06-15T00:00:00.000Z',
      placeOfPerformance: null,
      descriptionUrl: 'https://sam.gov/opp/x',
      descriptionText: null,
      pointOfContact: null,
      rawData: {},
      ...overrides,
    },
  };
}

function entry(
  rank: number,
  id: string,
  fit: number,
  rec: OpportunityScore['bidRecommendation'] = 'bid',
  overrides: Partial<CandidateOpportunity['normalized']> = {},
): RankedEntry {
  return {
    rank,
    candidate: cand(id, overrides),
    score: {
      opportunityId: id,
      fitScore: fit,
      bidRecommendation: rec,
      reasoningText: `Reasoning for ${id}: matches your primary NAICS and 8(a) eligibility.`,
      keyFactors: ['matches primary NAICS', '8(a) eligible'],
      opportunityHash: `h-${id}`,
      bidProfileVersion: 1,
      fromCache: false,
    },
  };
}

const NOW = new Date('2026-05-29T00:00:00.000Z');

describe('buildSubject', () => {
  it('uses ISO date for sortability and includes the count', () => {
    expect(buildSubject(NOW, 5)).toBe('Parakeet digest — 2026-05-29 (5 opportunities)');
    expect(buildSubject(NOW, 1)).toBe('Parakeet digest — 2026-05-29 (1 opportunity)');
  });

  it('uses an empty-day variant when nothing qualified', () => {
    expect(buildSubject(NOW, 0)).toBe('Parakeet digest — 2026-05-29 (no new matches)');
  });
});

describe('renderDigest', () => {
  it('renders the header and every entry into HTML + plain text', () => {
    const synth: DigestSynthesis = {
      header: '3 strong bids today, all in your primary NAICS.',
      entries: [entry(1, 'a', 85), entry(2, 'b', 72)],
    };
    const out = renderDigest(synth, NOW);
    expect(out.subject).toContain('2026-05-29');
    expect(out.subject).toContain('2 opportunities');
    expect(out.html).toContain('3 strong bids today');
    expect(out.html).toContain('Opp a');
    expect(out.html).toContain('Opp b');
    expect(out.html).toContain('fit 85');
    expect(out.html).toContain('matches primary NAICS');
    expect(out.html).toContain('href="https://sam.gov/opp/x"');
    expect(out.text).toContain('Parakeet digest · 2026-05-29');
    expect(out.text).toContain('3 strong bids today');
    expect(out.text).toContain('[BID]');
    expect(out.text).toContain('https://sam.gov/opp/x');
  });

  it('renders the deadline label per ranking_window: <72h vs days vs date', () => {
    const urgent = new Date(NOW.getTime() + 48 * 36e5).toISOString();
    const week = new Date(NOW.getTime() + 7 * 24 * 36e5).toISOString();
    const month = new Date(NOW.getTime() + 30 * 24 * 36e5).toISOString();

    const synth: DigestSynthesis = {
      header: 'h',
      entries: [
        entry(1, 'u', 80, 'bid', { responseDeadline: urgent }),
        entry(2, 'w', 70, 'bid', { responseDeadline: week }),
        entry(3, 'm', 65, 'bid', { responseDeadline: month }),
      ],
    };
    const out = renderDigest(synth, NOW);
    expect(out.text).toContain('48h to deadline');
    expect(out.text).toContain('7d to deadline');
    expect(out.text).toContain('Due 2026-06-28');
  });

  it('handles missing description URL (no link wrapping the title)', () => {
    const synth: DigestSynthesis = {
      header: 'h',
      entries: [entry(1, 'a', 80, 'bid', { descriptionUrl: null })],
    };
    const out = renderDigest(synth, NOW);
    expect(out.html).not.toContain('<a href');
    expect(out.html).toContain('Opp a');
  });

  it('color-codes recommendations (visual scanability)', () => {
    const synth: DigestSynthesis = {
      header: 'h',
      entries: [entry(1, 'a', 80, 'bid'), entry(2, 'b', 70, 'watch')],
    };
    const out = renderDigest(synth, NOW);
    expect(out.html).toContain('color:#0a7a3b'); // bid green
    expect(out.html).toContain('color:#9a6b00'); // watch amber
  });

  it('escapes HTML in user-supplied / source-supplied text (defensive)', () => {
    const synth: DigestSynthesis = {
      header: '<script>alert(1)</script>',
      entries: [
        entry(1, 'x', 80, 'bid', { title: 'Build & deploy <thing>' }),
      ],
    };
    const out = renderDigest(synth, NOW);
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('Build &amp; deploy &lt;thing&gt;');
  });

  it('empty-day digest renders header without any entry cards', () => {
    const out = renderDigest({ header: 'No new opportunities matched.', entries: [] }, NOW);
    expect(out.subject).toContain('no new matches');
    expect(out.html).toContain('No new opportunities matched.');
    expect(out.html).not.toContain('border:1px solid');
    expect(out.text).toContain('— Parakeet');
  });
});
