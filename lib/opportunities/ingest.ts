import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { ingestRuns, opportunities } from '@/db/schema';
import { FederalJurisdictionStrategy } from '@/lib/opportunities/jurisdictions/federal';
import {
  getActiveSource,
  type NormalizedOpportunity,
  type OpportunitySource,
} from '@/lib/opportunities/sources';

export type UpsertCounts = { newCount: number; updatedCount: number; unchangedCount: number };

// The persistence seam, so runIngest is testable without a database. The
// upsert is BULK (one batch per page): per-record round-trips through the
// Supabase pooler push a 5-page run past Vercel's 60s function timeout.
export interface IngestStore {
  lastSuccessfulWindowTo(source: string, jurisdiction: string): Promise<Date | null>;
  startRun(run: {
    source: string;
    jurisdiction: string;
    windowFrom: Date;
    windowTo: Date;
  }): Promise<string>;
  upsertOpportunities(
    batch: { opp: NormalizedOpportunity; hash: string }[],
  ): Promise<UpsertCounts>;
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
  // Bulk upsert means each page is ~2-3 SQL round trips regardless of page
  // size, so a page costs roughly the same whether it has 1 or 50 records.
  // 15 pages × ~50 records × budget for the source's API latency comfortably
  // fits inside Vercel's 60s function timeout.
  const maxPages = opts.maxPages ?? 15;

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
      const page = await source.search({
        postedFrom: toMmddyyyy(windowFrom),
        postedTo: toMmddyyyy(windowTo),
        noticeTypes: [...strategy.vocabulary.noticeTypes],
        limit: pageSize,
        offset,
      });
      requestsConsumed += 1;
      pages += 1;
      if (page.items.length === 0) break;
      fetched += page.items.length;

      const toUpsert: { opp: NormalizedOpportunity; hash: string }[] = [];
      for (const raw of page.items) {
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
        toUpsert.push({ opp, hash: hashRawData(opp.rawData) });
      }
      const counts = await opts.store.upsertOpportunities(toUpsert);
      upserted += counts.newCount + counts.updatedCount;
      newCount += counts.newCount;

      if (!page.hasNext) break; // trust the source — don't assume by item count
      // Advance by the number actually returned (the source may cap below limit).
      offset += page.items.length;
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

  async upsertOpportunities(
    batch: { opp: NormalizedOpportunity; hash: string }[],
  ): Promise<UpsertCounts> {
    if (batch.length === 0) {
      return { newCount: 0, updatedCount: 0, unchangedCount: 0 };
    }
    const db = getDb();
    const jurisdiction = batch[0].opp.jurisdiction;
    const noticeIds = batch.map((b) => b.opp.externalNoticeId);

    // 1 round-trip: pull current id+hash for everything in this page.
    const existing = await db
      .select({
        id: opportunities.id,
        externalNoticeId: opportunities.externalNoticeId,
        hash: opportunities.rawDataHash,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.jurisdiction, jurisdiction),
          inArray(opportunities.externalNoticeId, noticeIds),
        ),
      );
    const byNoticeId = new Map(existing.map((e) => [e.externalNoticeId, e]));

    const toInsert: { opp: NormalizedOpportunity; hash: string }[] = [];
    const toUpdate: { id: string; opp: NormalizedOpportunity; hash: string }[] = [];
    const unchangedIds: string[] = [];
    for (const b of batch) {
      const prior = byNoticeId.get(b.opp.externalNoticeId);
      if (!prior) toInsert.push(b);
      else if (prior.hash === b.hash) unchangedIds.push(prior.id);
      else toUpdate.push({ id: prior.id, opp: b.opp, hash: b.hash });
    }

    const buildValues = (opp: NormalizedOpportunity, hash: string) => ({
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
      rawDataHash: hash,
      lastFetchedAt: new Date(),
    });

    // 1 round-trip: bulk insert new rows (the common case on first ingest).
    if (toInsert.length > 0) {
      await db.insert(opportunities).values(toInsert.map((b) => buildValues(b.opp, b.hash)));
    }

    // K round-trips for K rows that actually changed (typically small after
    // the first run); rawData drives the hash so most re-fetches are no-ops.
    for (const u of toUpdate) {
      await db
        .update(opportunities)
        .set(buildValues(u.opp, u.hash))
        .where(eq(opportunities.id, u.id));
    }

    // 1 round-trip: touch last_fetched_at on unchanged rows so we can see
    // which are still active in the source.
    if (unchangedIds.length > 0) {
      await db
        .update(opportunities)
        .set({ lastFetchedAt: new Date() })
        .where(inArray(opportunities.id, unchangedIds));
    }

    return {
      newCount: toInsert.length,
      updatedCount: toUpdate.length,
      unchangedCount: unchangedIds.length,
    };
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
