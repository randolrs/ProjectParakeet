import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { ingestRuns, opportunities } from '@/db/schema';
import { FederalJurisdictionStrategy } from '@/lib/opportunities/jurisdictions/federal';
import {
  getActiveSource,
  type NormalizedOpportunity,
  type OpportunitySource,
} from '@/lib/opportunities/sources';

export type UpsertResult = 'new' | 'updated' | 'unchanged';

// The persistence seam, so runIngest is testable without a database.
export interface IngestStore {
  lastSuccessfulWindowTo(source: string, jurisdiction: string): Promise<Date | null>;
  startRun(run: {
    source: string;
    jurisdiction: string;
    windowFrom: Date;
    windowTo: Date;
  }): Promise<string>;
  upsertOpportunity(opp: NormalizedOpportunity, rawDataHash: string): Promise<UpsertResult>;
  finishRun(
    id: string,
    fields: {
      status: 'success' | 'failed';
      requestsConsumed: number;
      opportunitiesUpserted: number;
      opportunitiesNew: number;
      descriptionsFetched: number;
      error?: string;
    },
  ): Promise<void>;
}

export interface IngestOptions {
  store: IngestStore;
  source?: OpportunitySource;
  now?: Date;
  lookbackDays?: number;
  pageSize?: number;
  // Hard cap on pages per run so a huge window can't overrun the function
  // timeout. Separate from the source's rate-limit budget.
  maxPages?: number;
}

export interface IngestSummary {
  runId: string;
  source: string;
  windowFrom: string;
  windowTo: string;
  requestsConsumed: number;
  pages: number;
  fetched: number;
  upserted: number;
  newCount: number;
  status: 'success';
}

export function hashRawData(rawData: unknown): string {
  return createHash('sha256').update(JSON.stringify(rawData)).digest('hex');
}

function toMmddyyyy(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

// One centralized, date-windowed, paginated, budget-aware pull. All per-user
// filtering/scoring happens later in-DB and in the LLM — never against the
// live source (the load-bearing cost rule).
export async function runIngest(opts: IngestOptions): Promise<IngestSummary> {
  const source = opts.source ?? getActiveSource();
  const strategy = new FederalJurisdictionStrategy();
  const jurisdiction = strategy.jurisdiction;
  const now = opts.now ?? new Date();
  const lookbackDays = opts.lookbackDays ?? 2;
  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPages ?? 25;

  const lastTo = await opts.store.lastSuccessfulWindowTo(source.name, jurisdiction);
  const windowFrom = lastTo ?? new Date(now.getTime() - lookbackDays * 86_400_000);
  const windowTo = now;

  const runId = await opts.store.startRun({ source: source.name, jurisdiction, windowFrom, windowTo });

  // Respect whatever budget the active source reports — without hardcoding.
  const budget = source.capabilities.requestBudget;
  const ceiling = budget.perHour ?? budget.perDay ?? 100;

  let requestsConsumed = 0;
  let pages = 0;
  let fetched = 0;
  let upserted = 0;
  let newCount = 0;
  let offset = 0;

  try {
    while (requestsConsumed < ceiling && pages < maxPages) {
      const batch = await source.search({
        postedFrom: toMmddyyyy(windowFrom),
        postedTo: toMmddyyyy(windowTo),
        noticeTypes: [...strategy.vocabulary.noticeTypes],
        limit: pageSize,
        offset,
      });
      requestsConsumed += 1;
      pages += 1;
      if (batch.length === 0) break;
      fetched += batch.length;

      for (const raw of batch) {
        const opp = strategy.normalize(raw);
        // Drop out-of-scope notice types (Justification, surplus, etc.) before
        // they ever hit Postgres — they violate the actionable-digest premise.
        if (
          !strategy.isEligible(opp, {
            naicsCodes: [],
            setAsideTypes: [],
            noticeTypes: [],
            agenciesExcluded: [],
          })
        ) {
          continue;
        }
        const result = await opts.store.upsertOpportunity(opp, hashRawData(opp.rawData));
        if (result !== 'unchanged') upserted += 1;
        if (result === 'new') newCount += 1;
      }

      if (batch.length < pageSize) break; // last page
      offset += pageSize;
    }

    await opts.store.finishRun(runId, {
      status: 'success',
      requestsConsumed,
      opportunitiesUpserted: upserted,
      opportunitiesNew: newCount,
      descriptionsFetched: 0,
    });

    return {
      runId,
      source: source.name,
      windowFrom: windowFrom.toISOString(),
      windowTo: windowTo.toISOString(),
      requestsConsumed,
      pages,
      fetched,
      upserted,
      newCount,
      status: 'success',
    };
  } catch (err) {
    await opts.store.finishRun(runId, {
      status: 'failed',
      requestsConsumed,
      opportunitiesUpserted: upserted,
      opportunitiesNew: newCount,
      descriptionsFetched: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// Production store backed by the trusted Drizzle connection (bypasses RLS).
export class DrizzleIngestStore implements IngestStore {
  async lastSuccessfulWindowTo(source: string, jurisdiction: string): Promise<Date | null> {
    const rows = await getDb()
      .select({ windowTo: ingestRuns.windowTo })
      .from(ingestRuns)
      .where(
        and(
          eq(ingestRuns.source, source),
          eq(ingestRuns.jurisdiction, jurisdiction),
          eq(ingestRuns.status, 'success'),
        ),
      )
      .orderBy(desc(ingestRuns.windowTo))
      .limit(1);
    return rows[0]?.windowTo ?? null;
  }

  async startRun(run: {
    source: string;
    jurisdiction: string;
    windowFrom: Date;
    windowTo: Date;
  }): Promise<string> {
    const rows = await getDb()
      .insert(ingestRuns)
      .values({
        source: run.source,
        jurisdiction: run.jurisdiction,
        windowFrom: run.windowFrom,
        windowTo: run.windowTo,
        status: 'running',
      })
      .returning({ id: ingestRuns.id });
    return rows[0].id;
  }

  async upsertOpportunity(opp: NormalizedOpportunity, rawDataHash: string): Promise<UpsertResult> {
    const db = getDb();
    const existing = await db
      .select({ id: opportunities.id, hash: opportunities.rawDataHash })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.jurisdiction, opp.jurisdiction),
          eq(opportunities.externalNoticeId, opp.externalNoticeId),
        ),
      )
      .limit(1);

    const values = {
      jurisdiction: opp.jurisdiction,
      externalNoticeId: opp.externalNoticeId,
      solicitationNumber: opp.solicitationNumber,
      title: opp.title,
      department: opp.department,
      subTier: opp.subTier,
      office: opp.office,
      noticeType: opp.noticeType,
      naicsCode: opp.naicsCode,
      pscCode: opp.pscCode,
      setAsideType: opp.setAsideType,
      postedDate: opp.postedDate ? new Date(opp.postedDate) : null,
      responseDeadline: opp.responseDeadline ? new Date(opp.responseDeadline) : null,
      placeOfPerformance: opp.placeOfPerformance,
      descriptionUrl: opp.descriptionUrl,
      descriptionText: opp.descriptionText,
      pointOfContact: opp.pointOfContact,
      rawData: opp.rawData,
      rawDataHash,
      lastFetchedAt: new Date(),
    };

    if (!existing[0]) {
      await db.insert(opportunities).values(values);
      return 'new';
    }
    if (existing[0].hash === rawDataHash) {
      await db
        .update(opportunities)
        .set({ lastFetchedAt: new Date() })
        .where(eq(opportunities.id, existing[0].id));
      return 'unchanged';
    }
    await db.update(opportunities).set(values).where(eq(opportunities.id, existing[0].id));
    return 'updated';
  }

  async finishRun(
    id: string,
    fields: {
      status: 'success' | 'failed';
      requestsConsumed: number;
      opportunitiesUpserted: number;
      opportunitiesNew: number;
      descriptionsFetched: number;
      error?: string;
    },
  ): Promise<void> {
    await getDb()
      .update(ingestRuns)
      .set({
        status: fields.status,
        requestsConsumed: fields.requestsConsumed,
        opportunitiesUpserted: fields.opportunitiesUpserted,
        opportunitiesNew: fields.opportunitiesNew,
        descriptionsFetched: fields.descriptionsFetched,
        error: fields.error ?? null,
        finishedAt: new Date(),
      })
      .where(eq(ingestRuns.id, id));
  }
}
