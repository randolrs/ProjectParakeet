import { describe, expect, it, vi } from 'vitest';
import {
  fetchMissingDescriptions,
  type DescriptionSource,
  type DescriptionStore,
} from './descriptions';
import type { CandidateOpportunity } from './candidates';
import type { NormalizedOpportunity } from '@/lib/opportunities/sources';

function cand(id: string, descriptionText: string | null = null): CandidateOpportunity {
  return {
    id,
    rawDataHash: `hash-${id}`,
    normalized: {
      jurisdiction: 'federal',
      externalNoticeId: id,
      solicitationNumber: null,
      title: `Opp ${id}`,
      department: null,
      subTier: null,
      office: null,
      noticeType: 'Solicitation',
      naicsCode: null,
      pscCode: null,
      setAsideType: null,
      postedDate: '2026-05-01T00:00:00.000Z',
      responseDeadline: null,
      placeOfPerformance: null,
      descriptionUrl: 'https://sam.gov/opp/x',
      descriptionText,
      pointOfContact: null,
      rawData: {},
    },
  };
}

class FakeSource implements DescriptionSource {
  public calls: NormalizedOpportunity[] = [];
  constructor(private readonly behavior: (opp: NormalizedOpportunity) => Promise<string>) {}
  async fetchDescription(opp: NormalizedOpportunity): Promise<string> {
    this.calls.push(opp);
    return this.behavior(opp);
  }
}

class FakeStore implements DescriptionStore {
  saved = new Map<string, string>();
  async saveDescription(opportunityId: string, text: string): Promise<void> {
    this.saved.set(opportunityId, text);
  }
}

describe('fetchMissingDescriptions', () => {
  it('skips opportunities that already have description text inline (no source call)', async () => {
    const source = new FakeSource(async () => 'should not be called');
    const store = new FakeStore();
    const result = await fetchMissingDescriptions(
      [cand('a', 'Award notice description.')],
      source,
      store,
    );
    expect(source.calls).toHaveLength(0);
    expect(store.saved.size).toBe(0);
    expect(result.fetched).toBe(0);
    expect(result.skippedInline).toBe(1);
    expect(result.hydrated[0].normalized.descriptionText).toBe('Award notice description.');
  });

  it('fetches text for opps with no inline description and caches it to the store', async () => {
    const source = new FakeSource(async (o) => `Body for ${o.externalNoticeId}.`);
    const store = new FakeStore();
    const result = await fetchMissingDescriptions([cand('b'), cand('c')], source, store);
    expect(source.calls).toHaveLength(2);
    expect(store.saved.get('b')).toBe('Body for b.');
    expect(store.saved.get('c')).toBe('Body for c.');
    expect(result.fetched).toBe(2);
    expect(result.hydrated.map((h) => h.normalized.descriptionText)).toEqual([
      'Body for b.',
      'Body for c.',
    ]);
  });

  it('respects maxFetches as a hard cap (defers the rest, does not throw)', async () => {
    const source = new FakeSource(async (o) => `Body ${o.externalNoticeId}`);
    const store = new FakeStore();
    const result = await fetchMissingDescriptions(
      [cand('a'), cand('b'), cand('c'), cand('d')],
      source,
      store,
      { maxFetches: 2 },
    );
    expect(result.fetched).toBe(2);
    expect(result.deferred).toBe(2);
    expect(source.calls).toHaveLength(2);
    // Deferred candidates pass through with null descriptionText (don't sink
    // the digest; scoring can still use metadata).
    expect(result.hydrated[2].normalized.descriptionText).toBeNull();
    expect(result.hydrated[3].normalized.descriptionText).toBeNull();
  });

  it('records per-fetch failures and continues — one bad URL must not sink the digest', async () => {
    const source = new FakeSource(async (o) => {
      if (o.externalNoticeId === 'bad') throw new Error('404 not found');
      return `OK ${o.externalNoticeId}`;
    });
    const store = new FakeStore();
    const result = await fetchMissingDescriptions(
      [cand('a'), cand('bad'), cand('b')],
      source,
      store,
    );
    expect(result.failures).toEqual([{ opportunityId: 'bad', error: '404 not found' }]);
    expect(result.fetched).toBe(2);
    expect(store.saved.has('bad')).toBe(false);
    expect(result.hydrated.map((h) => h.id)).toEqual(['a', 'bad', 'b']);
    expect(result.hydrated[1].normalized.descriptionText).toBeNull();
  });

  it('inline + needs-fetch + over-cap mixed: each counted in the right bucket', async () => {
    const source = new FakeSource(async () => 'fetched');
    const store = new FakeStore();
    const result = await fetchMissingDescriptions(
      [
        cand('inline-1', 'pre-existing'),
        cand('miss-1'),
        cand('inline-2', 'also pre-existing'),
        cand('miss-2'),
        cand('miss-3'),
      ],
      source,
      store,
      { maxFetches: 2 },
    );
    expect(result.skippedInline).toBe(2);
    expect(result.fetched).toBe(2);
    expect(result.deferred).toBe(1);
  });

  it('counts the fetches against the cap in input order (does not race ahead)', async () => {
    const order: string[] = [];
    const source: DescriptionSource = {
      fetchDescription: vi.fn(async (o) => {
        order.push(o.externalNoticeId);
        return 't';
      }),
    };
    const store = new FakeStore();
    await fetchMissingDescriptions([cand('1'), cand('2'), cand('3')], source, store);
    expect(order).toEqual(['1', '2', '3']);
  });
});
