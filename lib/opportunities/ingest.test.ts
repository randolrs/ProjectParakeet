import { describe, expect, it } from 'vitest';
import { runIngest, type IngestStore, type UpsertCounts } from './ingest';
import type {
  NormalizedOpportunity,
  OpportunitySearchParams,
  OpportunitySource,
  SearchPage,
} from './sources';

function opp(id: string, rawData: Record<string, unknown> = { id }): NormalizedOpportunity {
  return {
    jurisdiction: 'federal',
    externalNoticeId: id,
    solicitationNumber: null,
    title: `Opp ${id}`,
    department: null,
    subTier: null,
    office: null,
    noticeType: 'Solicitation',
    naicsCode: '541512',
    pscCode: null,
    setAsideType: null,
    postedDate: '2026-05-01T00:00:00.000Z',
    responseDeadline: null,
    placeOfPerformance: null,
    descriptionUrl: null,
    descriptionText: 'desc',
    pointOfContact: null,
    rawData,
  };
}

class FakeSource implements OpportunitySource {
  readonly name = 'fake';
  readonly capabilities = {
    descriptionsInline: true,
    requestBudget: { perHour: 1000 },
    supportsModifiedSince: true,
  };
  constructor(private readonly data: NormalizedOpportunity[]) {}
  async search(params: OpportunitySearchParams): Promise<SearchPage> {
    const items = this.data.slice(params.offset, params.offset + params.limit);
    return { items, hasNext: params.offset + items.length < this.data.length };
  }
  async fetchDescription(): Promise<string> {
    return '';
  }
}

class FakeStore implements IngestStore {
  byId = new Map<string, string>();
  finished: { status: string; opportunitiesUpserted: number; opportunitiesNew: number }[] = [];
  async lastSuccessfulWindowTo(): Promise<Date | null> {
    return null;
  }
  async startRun(): Promise<string> {
    return 'run1';
  }
  async upsertOpportunities(
    batch: { opp: NormalizedOpportunity; hash: string }[],
  ): Promise<UpsertCounts> {
    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    for (const b of batch) {
      const prev = this.byId.get(b.opp.externalNoticeId);
      this.byId.set(b.opp.externalNoticeId, b.hash);
      if (prev === undefined) newCount += 1;
      else if (prev === b.hash) unchangedCount += 1;
      else updatedCount += 1;
    }
    return { newCount, updatedCount, unchangedCount };
  }
  async finishRun(_id: string, fields: { status: string; opportunitiesUpserted: number; opportunitiesNew: number }) {
    this.finished.push(fields);
  }
}

describe('runIngest', () => {
  it('pages through the source and counts new opportunities', async () => {
    const store = new FakeStore();
    const source = new FakeSource([opp('n1'), opp('n2'), opp('n3')]);
    const summary = await runIngest({ store, source, pageSize: 2 });

    expect(summary.status).toBe('success');
    expect(summary.pages).toBe(2); // [n1,n2] then [n3]
    expect(summary.fetched).toBe(3);
    expect(summary.upserted).toBe(3);
    expect(summary.newCount).toBe(3);
    expect(store.finished[0].status).toBe('success');
  });

  it('treats unchanged opportunities as no-ops on re-run (dedupe by hash)', async () => {
    const store = new FakeStore();
    const data = [opp('n1'), opp('n2')];
    await runIngest({ store, source: new FakeSource(data), pageSize: 50 });
    const second = await runIngest({ store, source: new FakeSource(data), pageSize: 50 });

    expect(second.upserted).toBe(0);
    expect(second.newCount).toBe(0);
  });

  it('keeps paginating when the source caps below the requested limit (Free-tier regression)', async () => {
    // Mirrors GovConAPI Free tier: requested limit=100, source returns 2/page max
    // with hasNext=true until the dataset is exhausted. The old `items.length <
    // pageSize` heuristic incorrectly concluded "last page" on every call.
    const data = Array.from({ length: 5 }, (_, i) => opp(`p${i + 1}`));
    const cappedSource: OpportunitySource = {
      name: 'capped',
      capabilities: {
        descriptionsInline: true,
        requestBudget: { perHour: 1000 },
        supportsModifiedSince: true,
      },
      async search(params): Promise<SearchPage> {
        const items = data.slice(params.offset, params.offset + Math.min(2, params.limit));
        return { items, hasNext: params.offset + items.length < data.length };
      },
      async fetchDescription() {
        return '';
      },
    };
    const store = new FakeStore();
    const summary = await runIngest({ store, source: cappedSource, pageSize: 100 });
    expect(summary.pages).toBe(3); // 2 + 2 + 1
    expect(summary.fetched).toBe(5);
    expect(summary.newCount).toBe(5);
  });

  it('marks modified opportunities as updated, not new', async () => {
    const store = new FakeStore();
    await runIngest({ store, source: new FakeSource([opp('n1')]), pageSize: 50 });
    const second = await runIngest({
      store,
      source: new FakeSource([opp('n1', { id: 'n1', changed: true })]),
      pageSize: 50,
    });

    expect(second.newCount).toBe(0);
    expect(second.upserted).toBe(1);
  });
});
