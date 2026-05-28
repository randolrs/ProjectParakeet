import { z } from 'zod';
import { fetchJson } from '@/lib/http';
import {
  type NormalizedOpportunity,
  type OpportunitySearchParams,
  type OpportunitySource,
  type SourceCapabilities,
} from './types';

// GovConAPI is the v1 primary source. It resells SAM data with description
// text inline, so descriptionsInline=true and fetchDescription is a pure
// passthrough. Budget is per-hour (dev tier).

const BASE_URL = 'https://govconapi.com/api/v1';

function requireKey(): string {
  const key = process.env.GOVCONAPI_KEY;
  if (!key) {
    throw new Error('GOVCONAPI_KEY is not set; GovConApiSource cannot make requests.');
  }
  return key;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${requireKey()}` };
}

// OpportunitySearchParams boundary uses MM/DD/YYYY (SAM's native format);
// GovConAPI wants YYYY-MM-DD.
function toIsoDate(mmddyyyy: string): string {
  const [mm, dd, yyyy] = mmddyyyy.split('/');
  if (!mm || !dd || !yyyy) {
    throw new Error(`Invalid date "${mmddyyyy}"; expected MM/DD/YYYY.`);
  }
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// Permissive item schema: validates the fields we map, passthrough keeps the
// rest of the ~59 documented fields for rawData. Don't infer required fields
// you have not seen in a real response.
const GovConApiOpportunitySchema = z
  .object({
    notice_id: z.string(),
    title: z.string(),
    solicitation_number: z.string().nullable().optional(),
    agency: z.string().nullable().optional(),
    notice_type: z.string().nullable().optional(),
    naics: z.array(z.string()).nullable().optional(),
    psc: z.string().nullable().optional(),
    set_aside_type: z.string().nullable().optional(),
    posted_date: z.string().nullable().optional(),
    response_deadline: z.string().nullable().optional(),
    description_text: z.string().nullable().optional(),
    contact_name: z.string().nullable().optional(),
    contact_email: z.string().nullable().optional(),
    performance_city_name: z.string().nullable().optional(),
    performance_state_code: z.string().nullable().optional(),
    sam_url: z.string().nullable().optional(),
  })
  .passthrough();
type GovConApiOpportunity = z.infer<typeof GovConApiOpportunitySchema>;

const GovConApiResponseSchema = z
  .object({
    data: z.array(GovConApiOpportunitySchema),
    pagination: z
      .object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        total: z.number().optional(),
        total_is_estimate: z.boolean().optional(),
        has_next: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

function toNormalized(item: GovConApiOpportunity): NormalizedOpportunity {
  const placeOfPerformance =
    item.performance_city_name || item.performance_state_code
      ? { city: item.performance_city_name ?? null, state: item.performance_state_code ?? null }
      : null;
  const pointOfContact =
    item.contact_name || item.contact_email
      ? { name: item.contact_name ?? null, email: item.contact_email ?? null }
      : null;

  return {
    jurisdiction: 'federal',
    externalNoticeId: item.notice_id,
    solicitationNumber: item.solicitation_number ?? null,
    title: item.title,
    department: item.agency ?? null,
    subTier: null,
    office: null,
    // Fallback string is intentionally non-vocab so the ingest's in-scope
    // filter drops it — we never store an opportunity with no real notice type.
    noticeType: item.notice_type ?? 'Unknown',
    naicsCode: item.naics && item.naics.length > 0 ? item.naics[0] : null,
    pscCode: item.psc ?? null,
    setAsideType: item.set_aside_type ?? null,
    postedDate: item.posted_date ?? '',
    responseDeadline: item.response_deadline ?? null,
    placeOfPerformance,
    descriptionUrl: item.sam_url ?? null,
    descriptionText: item.description_text ?? null,
    pointOfContact,
    rawData: item as Record<string, unknown>,
  };
}

export class GovConApiSource implements OpportunitySource {
  readonly name = 'govconapi';
  readonly capabilities: SourceCapabilities = {
    descriptionsInline: true,
    requestBudget: { perHour: 1000 },
    // GovConAPI does not expose a documented modified-since filter on
    // /opportunities/search; we re-window via date_from each run instead.
    supportsModifiedSince: false,
  };

  async search(params: OpportunitySearchParams): Promise<NormalizedOpportunity[]> {
    const url = new URL(`${BASE_URL}/opportunities/search`);
    // date_from + date_to satisfy the API's "at least one meaningful filter"
    // rule. notice_type is NOT filtered server-side here — the ingest's
    // in-scope vocabulary check enforces it downstream, avoiding one query
    // per notice type.
    url.searchParams.set('date_from', toIsoDate(params.postedFrom));
    url.searchParams.set('date_to', toIsoDate(params.postedTo));
    url.searchParams.set('limit', String(params.limit));
    url.searchParams.set('offset', String(params.offset));
    url.searchParams.set('sort_by', 'posted_date');
    url.searchParams.set('sort_order', 'asc');

    const raw = await fetchJson(
      url.toString(),
      { method: 'GET', headers: authHeaders() },
      {
        timeoutMs: 30_000,
        retries: 3,
        context: {
          source: 'govconapi',
          endpoint: 'opportunities/search',
          offset: params.offset,
          limit: params.limit,
        },
      },
    );

    const parsed = GovConApiResponseSchema.parse(raw);
    return parsed.data.map(toNormalized);
  }

  // Descriptions are inline for GovConAPI: search() already populated
  // descriptionText, so this is a passthrough that never spends budget.
  async fetchDescription(opp: NormalizedOpportunity): Promise<string> {
    if (opp.descriptionText !== null) return opp.descriptionText;
    throw new Error(
      `GovConApiSource expected inline descriptionText for ${opp.externalNoticeId}, but it was null.`,
    );
  }
}
