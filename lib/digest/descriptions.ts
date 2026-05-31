import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { opportunities } from '@/db/schema';
import type { NormalizedOpportunity } from '@/lib/opportunities/sources';
import type { CandidateOpportunity } from '@/lib/digest/candidates';

// Step 3 of the digest pipeline. Per CLAUDE.md cost discipline:
//   "fetch only for opportunities matching ≥1 active user's eligibility filter;
//    cache permanently; re-fetch only on raw_data_hash change; track count in
//    ingest_runs and defer past a safe ceiling."
// We're called AFTER candidate selection (so already eligibility-gated) and we
// write the fetched text back to opportunities.description_text so every
// downstream user benefits from the cache.

export interface DescriptionFetchOptions {
  // Hard ceiling per digest run. Both v1 sources publish per-hour or per-day
  // budgets; with a handful of users at most one of them eats the cost and
  // the rest hit the cache. Default 100 keeps a single user well under
  // GovConAPI's 1000/hr or SAM's 1000/day budget.
  maxFetches?: number;
}

export interface DescriptionFetchResult {
  // The candidates with descriptionText filled in where possible. Order
  // preserved from input.
  hydrated: CandidateOpportunity[];
  // Actual fetches made — counts against the source budget.
  fetched: number;
  // Already had description_text inline (no fetch needed).
  skippedInline: number;
  // Hit the maxFetches ceiling; these go to scoring without descriptions.
  deferred: number;
  // Per-fetch failures so one bad URL doesn't sink the whole digest.
  failures: { opportunityId: string; error: string }[];
}

// The two seams. Production wires them to the active OpportunitySource +
// Drizzle; tests inject in-memory fakes.
export interface DescriptionSource {
  fetchDescription(opp: NormalizedOpportunity): Promise<string>;
}
export interface DescriptionStore {
  saveDescription(opportunityId: string, text: string): Promise<void>;
}

export async function fetchMissingDescriptions(
  candidates: CandidateOpportunity[],
  source: DescriptionSource,
  store: DescriptionStore,
  options: DescriptionFetchOptions = {},
): Promise<DescriptionFetchResult> {
  const maxFetches = options.maxFetches ?? 100;

  let fetched = 0;
  let skippedInline = 0;
  let deferred = 0;
  const failures: { opportunityId: string; error: string }[] = [];
  const hydrated: CandidateOpportunity[] = [];

  for (const cand of candidates) {
    if (cand.normalized.descriptionText) {
      skippedInline += 1;
      hydrated.push(cand);
      continue;
    }
    if (fetched >= maxFetches) {
      // Defer: pass through without text. Scoring will see a thinner
      // record but won't fail — better than blocking on budget exhaustion.
      deferred += 1;
      hydrated.push(cand);
      continue;
    }
    try {
      const text = await source.fetchDescription(cand.normalized);
      await store.saveDescription(cand.id, text);
      fetched += 1;
      hydrated.push({
        ...cand,
        normalized: { ...cand.normalized, descriptionText: text },
      });
    } catch (err) {
      failures.push({
        opportunityId: cand.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Push the candidate through without text; downstream can still score
      // the metadata. One bad URL must never sink the digest.
      hydrated.push(cand);
    }
  }

  return { hydrated, fetched, skippedInline, deferred, failures };
}

// Production store: cache the description AND bump last_fetched_at so the
// "still active in source" signal stays fresh on cache hits.
export class DrizzleDescriptionStore implements DescriptionStore {
  async saveDescription(opportunityId: string, text: string): Promise<void> {
    await getDb()
      .update(opportunities)
      .set({ descriptionText: text, lastFetchedAt: new Date() })
      .where(eq(opportunities.id, opportunityId));
  }
}
