import { describe, expect, it, vi } from 'vitest';
import {
  rankEntries,
  synthesizeDigest,
  type SynthesisClient,
} from './synthesis';
import type { CandidateOpportunity } from './candidates';
import type { OpportunityScore } from './scoring';

function cand(id: string, deadline: string | null = null): CandidateOpportunity {
  return {
    id,
    rawDataHash: `h-${id}`,
    normalized: {
      jurisdiction: 'federal',
      externalNoticeId: id,
      solicitationNumber: null,
      title: `Opp ${id}`,
      department: 'DoD',
      subTier: null,
      office: null,
      noticeType: 'Solicitation',
      naicsCode: '541512',
      pscCode: null,
      setAsideType: null,
      postedDate: '2026-05-01T00:00:00.000Z',
      responseDeadline: deadline,
      placeOfPerformance: null,
      descriptionUrl: null,
      descriptionText: null,
      pointOfContact: null,
      rawData: {},
    },
  };
}

function score(
  id: string,
  fit: number,
  rec: OpportunityScore['bidRecommendation'],
): OpportunityScore {
  return {
    opportunityId: id,
    fitScore: fit,
    bidRecommendation: rec,
    reasoningText: `r-${id}`,
    keyFactors: ['k'],
    opportunityHash: `h-${id}`,
    bidProfileVersion: 1,
    fromCache: false,
  };
}

const NOW = new Date('2026-05-29T00:00:00.000Z');

describe('rankEntries', () => {
  it('drops no_bid entries entirely — the digest is an action list', () => {
    const cs = [cand('a'), cand('b'), cand('c')];
    const ss = [score('a', 70, 'bid'), score('b', 95, 'no_bid'), score('c', 60, 'watch')];
    const ranked = rankEntries(cs, ss, 15, NOW);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['a', 'c']);
    expect(ranked[0].rank).toBe(1);
  });

  it('orders by recommendation tier first (bid > watch), then fit_score desc', () => {
    const cs = [cand('a'), cand('b'), cand('c'), cand('d')];
    const ss = [
      score('a', 50, 'watch'),
      score('b', 70, 'bid'),
      score('c', 85, 'watch'),
      score('d', 60, 'bid'),
    ];
    const ranked = rankEntries(cs, ss, 15, NOW);
    // Bids first (b at 70 > d at 60), then watches (c at 85 > a at 50)
    expect(ranked.map((r) => r.candidate.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('bumps deadline-imminent (<72h) entries to the top regardless of tier', () => {
    const inTwoDays = new Date(NOW.getTime() + 48 * 36e5).toISOString();
    const inAMonth = new Date(NOW.getTime() + 30 * 24 * 36e5).toISOString();
    const cs = [
      cand('high-fit-distant', inAMonth),
      cand('mid-fit-urgent', inTwoDays),
    ];
    const ss = [
      score('high-fit-distant', 95, 'bid'),
      score('mid-fit-urgent', 55, 'watch'),
    ];
    const ranked = rankEntries(cs, ss, 15, NOW);
    expect(ranked[0].candidate.id).toBe('mid-fit-urgent');
    expect(ranked[1].candidate.id).toBe('high-fit-distant');
  });

  it('respects maxEntries cap (top-N only)', () => {
    const cs = Array.from({ length: 20 }, (_, i) => cand(`o${i}`));
    const ss = cs.map((c, i) => score(c.id, 60 + i, 'bid'));
    const ranked = rankEntries(cs, ss, 5, NOW);
    expect(ranked).toHaveLength(5);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['o19', 'o18', 'o17', 'o16', 'o15']);
  });

  it('tie-breaks identical (recommendation, fit) by sooner deadline, then by id (deterministic)', () => {
    const sooner = new Date(NOW.getTime() + 10 * 24 * 36e5).toISOString();
    const later = new Date(NOW.getTime() + 20 * 24 * 36e5).toISOString();
    const cs = [cand('a-later', later), cand('b-sooner', sooner), cand('c-later', later)];
    const ss = [score('a-later', 70, 'bid'), score('b-sooner', 70, 'bid'), score('c-later', 70, 'bid')];
    const ranked = rankEntries(cs, ss, 15, NOW);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['b-sooner', 'a-later', 'c-later']);
  });

  it('treats missing deadline as "no urgency" — places after entries with future deadlines', () => {
    const future = new Date(NOW.getTime() + 10 * 24 * 36e5).toISOString();
    const cs = [cand('no-deadline', null), cand('with-deadline', future)];
    const ss = [score('no-deadline', 80, 'bid'), score('with-deadline', 80, 'bid')];
    const ranked = rankEntries(cs, ss, 15, NOW);
    expect(ranked[0].candidate.id).toBe('with-deadline');
  });

  it('does not bump past-deadline entries as urgent (they would be filtered by selectCandidates anyway)', () => {
    const past = new Date(NOW.getTime() - 24 * 36e5).toISOString();
    const cs = [cand('past', past), cand('clean', null)];
    const ss = [score('past', 50, 'watch'), score('clean', 80, 'bid')];
    const ranked = rankEntries(cs, ss, 15, NOW);
    expect(ranked[0].candidate.id).toBe('clean');
  });
});

describe('synthesizeDigest', () => {
  it('passes the ranked entries to the client and returns the produced header + entries', async () => {
    const client: SynthesisClient = {
      writeHeader: vi.fn(async (entries) => `Today: ${entries.length} entries, top: ${entries[0]?.title}`),
    };
    const cs = [cand('a'), cand('b')];
    const ss = [score('a', 80, 'bid'), score('b', 70, 'bid')];
    const out = await synthesizeDigest(cs, ss, client, 15, NOW);
    expect(out.entries.map((e) => e.candidate.id)).toEqual(['a', 'b']);
    expect(out.header).toBe('Today: 2 entries, top: Opp a');
    expect(client.writeHeader).toHaveBeenCalledOnce();
  });

  it('returns the empty-day header when no entries qualify (no client call needed)', async () => {
    const client: SynthesisClient = {
      // Production client returns a hardcoded empty-day message; verify the
      // synthesis call still hands an empty array through.
      writeHeader: vi.fn(async () => 'No new opportunities matched your profile today.'),
    };
    const out = await synthesizeDigest([], [], client, 15, NOW);
    expect(out.entries).toEqual([]);
    expect(out.header).toBe('No new opportunities matched your profile today.');
    expect(client.writeHeader).toHaveBeenCalledWith([]);
  });
});
