import { describe, expect, it, vi } from 'vitest';
import {
  scoreCandidates,
  type RawScore,
  type ScoringCache,
  type ScoringClient,
} from './scoring';
import type { CandidateOpportunity } from './candidates';
import type { ScoringContractor } from '@/lib/llm/prompts/federal/opportunity-scoring';

function cand(id: string, hash = `hash-${id}`): CandidateOpportunity {
  return {
    id,
    rawDataHash: hash,
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
      placeOfPerformance: { state: 'VA' },
      descriptionUrl: null,
      descriptionText: `desc for ${id}`,
      pointOfContact: null,
      rawData: {},
    },
  };
}

const CONTRACTOR: ScoringContractor = {
  capabilitySummary: 'IT systems integration for DoD.',
  certifications: ['8(a)', 'WOSB'],
  primaryNaics: ['541512'],
  secondaryNaics: ['541511'],
  setAsideTypes: ['Total Small Business', 'WOSB'],
  placeOfPerformance: { states: ['VA', 'DC', 'MD'], remote: true, nationwide: false },
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

class FakeClient implements ScoringClient {
  public calls: { id: string }[] = [];
  constructor(private readonly behavior: (id: string) => Promise<RawScore>) {}
  async score(opp: CandidateOpportunity): Promise<RawScore> {
    this.calls.push({ id: opp.id });
    return this.behavior(opp.id);
  }
}

class NeverCache implements ScoringCache {
  async lookup(): Promise<null> {
    return null;
  }
}

class AlwaysCache implements ScoringCache {
  async lookup() {
    return {
      fitScore: 77,
      bidRecommendation: 'bid' as const,
      reasoningText: 'cached reasoning',
      keyFactors: ['cached'],
    };
  }
}

describe('scoreCandidates', () => {
  it('calls the LLM for each candidate on a fresh run (no cache hits)', async () => {
    const client = new FakeClient(async (id) => ({
      fit_score: 72,
      bid_recommendation: 'bid',
      reasoning_text: `reasoning for ${id}`,
      key_factors: ['matches primary NAICS', '8(a) eligible'],
    }));
    const result = await scoreCandidates(
      [cand('a'), cand('b')],
      { userId: 'u1', contractor: CONTRACTOR, bidProfileVersion: 1 },
      client,
      new NeverCache(),
    );
    expect(result.llmCalls).toBe(2);
    expect(result.cacheHits).toBe(0);
    expect(result.scored).toHaveLength(2);
    expect(result.scored[0].fromCache).toBe(false);
    expect(result.scored[0].bidRecommendation).toBe('bid');
    expect(result.scored[0].opportunityHash).toBe('hash-a');
    expect(result.scored[0].bidProfileVersion).toBe(1);
  });

  it('hits the cache when (user, opp, hash, profile_version) all match — no LLM call', async () => {
    const client = new FakeClient(async () => {
      throw new Error('client should not be called on a full cache hit');
    });
    const result = await scoreCandidates(
      [cand('a'), cand('b')],
      { userId: 'u1', contractor: CONTRACTOR, bidProfileVersion: 1 },
      client,
      new AlwaysCache(),
    );
    expect(client.calls).toHaveLength(0);
    expect(result.cacheHits).toBe(2);
    expect(result.llmCalls).toBe(0);
    expect(result.scored.every((s) => s.fromCache)).toBe(true);
    expect(result.scored[0].fitScore).toBe(77);
  });

  it('mixed cache hit + miss: only misses incur LLM calls', async () => {
    const cache: ScoringCache = {
      lookup: vi.fn(async (input) => {
        if (input.opportunityId === 'cached') {
          return {
            fitScore: 90,
            bidRecommendation: 'bid' as const,
            reasoningText: 'cached',
            keyFactors: ['c'],
          };
        }
        return null;
      }),
    };
    const client = new FakeClient(async (id) => ({
      fit_score: 50,
      bid_recommendation: 'watch',
      reasoning_text: `fresh ${id}`,
      key_factors: ['k'],
    }));
    const result = await scoreCandidates(
      [cand('cached'), cand('fresh1'), cand('fresh2')],
      { userId: 'u1', contractor: CONTRACTOR, bidProfileVersion: 1 },
      client,
      cache,
    );
    expect(result.cacheHits).toBe(1);
    expect(result.llmCalls).toBe(2);
    expect(client.calls.map((c) => c.id)).toEqual(['fresh1', 'fresh2']);
  });

  it('isolates per-opportunity LLM failures (failures do not sink the batch)', async () => {
    const client = new FakeClient(async (id) => {
      if (id === 'bad') throw new Error('rate limited');
      return {
        fit_score: 60,
        bid_recommendation: 'bid',
        reasoning_text: 'r',
        key_factors: ['k'],
      };
    });
    const result = await scoreCandidates(
      [cand('a'), cand('bad'), cand('c')],
      { userId: 'u1', contractor: CONTRACTOR, bidProfileVersion: 1 },
      client,
      new NeverCache(),
    );
    expect(result.scored.map((s) => s.opportunityId)).toEqual(['a', 'c']);
    expect(result.failures).toEqual([{ opportunityId: 'bad', error: 'rate limited' }]);
    expect(result.llmCalls).toBe(2);
  });

  it('bid_profile_version is part of the cache key (a profile rev forces re-scoring)', async () => {
    // Cache returns null when version mismatches.
    const lookup = vi.fn(async (input) =>
      input.bidProfileVersion === 1
        ? {
            fitScore: 80,
            bidRecommendation: 'bid' as const,
            reasoningText: 'v1',
            keyFactors: ['k'],
          }
        : null,
    );
    const client = new FakeClient(async () => ({
      fit_score: 70,
      bid_recommendation: 'watch',
      reasoning_text: 'v2',
      key_factors: ['k'],
    }));
    const r1 = await scoreCandidates(
      [cand('x')],
      { userId: 'u1', contractor: CONTRACTOR, bidProfileVersion: 1 },
      client,
      { lookup },
    );
    expect(r1.cacheHits).toBe(1);

    const r2 = await scoreCandidates(
      [cand('x')],
      { userId: 'u1', contractor: CONTRACTOR, bidProfileVersion: 2 },
      client,
      { lookup },
    );
    expect(r2.cacheHits).toBe(0);
    expect(r2.llmCalls).toBe(1);
    expect(r2.scored[0].reasoningText).toBe('v2');
  });
});
