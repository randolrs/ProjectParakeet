import { z } from 'zod';
import { fetchJson } from '@/lib/http';

// USAspending.gov: open, no key. Used for incumbent / prior-award context in
// bid/no-bid reasoning. Strictly best-effort — every entry point swallows
// failures and returns [] so the digest still ships if this is down.

const AWARD_SEARCH_URL =
  'https://api.usaspending.gov/api/v2/search/spending_by_award/';

// Contract award type codes (A=BPA Call, B=Purchase Order, C=Delivery Order,
// D=Definitive Contract). Grants/loans are out of scope.
const CONTRACT_AWARD_TYPE_CODES = ['A', 'B', 'C', 'D'];

const REQUESTED_FIELDS = [
  'Award ID',
  'Recipient Name',
  'Award Amount',
  'Awarding Agency',
  'Awarding Sub Agency',
  'Start Date',
  'End Date',
  'Award Type',
] as const;

const AwardSchema = z.object({
  'Award ID': z.string().nullish(),
  'Recipient Name': z.string().nullish(),
  'Award Amount': z.number().nullish(),
  'Awarding Agency': z.string().nullish(),
  'Awarding Sub Agency': z.string().nullish(),
  'Start Date': z.string().nullish(),
  'End Date': z.string().nullish(),
  'Award Type': z.string().nullish(),
});

const AwardSearchResponseSchema = z.object({
  results: z.array(AwardSchema).nullish(),
});

export interface UsaSpendingAward {
  awardId: string | null;
  recipientName: string | null;
  awardAmount: number | null;
  awardingAgency: string | null;
  awardingSubAgency: string | null;
  startDate: string | null;
  endDate: string | null;
  awardType: string | null;
}

export interface SearchAwardsParams {
  naics?: string;
  agency?: string;
  limit?: number;
}

export async function searchAwards(
  params: SearchAwardsParams,
): Promise<UsaSpendingAward[]> {
  const filters: Record<string, unknown> = {
    award_type_codes: CONTRACT_AWARD_TYPE_CODES,
  };
  if (params.naics) filters.naics_codes = [params.naics];
  if (params.agency) {
    filters.agencies = [{ type: 'awarding', tier: 'toptier', name: params.agency }];
  }

  const body = {
    filters,
    fields: REQUESTED_FIELDS,
    page: 1,
    limit: params.limit ?? 10,
    sort: 'Award Amount',
    order: 'desc',
  };

  try {
    const raw = await fetchJson(
      AWARD_SEARCH_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      { context: { source: 'usaspending', op: 'searchAwards' } },
    );
    const parsed = AwardSearchResponseSchema.parse(raw);
    return (parsed.results ?? []).map((a) => ({
      awardId: a['Award ID'] ?? null,
      recipientName: a['Recipient Name'] ?? null,
      awardAmount: a['Award Amount'] ?? null,
      awardingAgency: a['Awarding Agency'] ?? null,
      awardingSubAgency: a['Awarding Sub Agency'] ?? null,
      startDate: a['Start Date'] ?? null,
      endDate: a['End Date'] ?? null,
      awardType: a['Award Type'] ?? null,
    }));
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        ts: new Date().toISOString(),
        event: 'usaspending_enrichment_failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return [];
  }
}
