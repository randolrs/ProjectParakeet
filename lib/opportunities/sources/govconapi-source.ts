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

// Only require the two anchor fields. The other ~57 fields vary in shape per
// record (naics is an array, psc is too, etc.); reading them through safe
// coercions below means an unexpected type on one field never kills a whole
// batch. Passthrough preserves everything for rawData.
const GovConApiOpportunitySchema = z
  .object({
    notice_id: z.string(),
    title: z.string(),
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

const asString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
// Many GovConAPI fields are arrays of strings (naics, psc, ...); when we only
// store a single code, take the first.
const firstString = (v: unknown): string | null => {
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v)) {
    const first = v.find((x) => typeof x === 'string' && x.length > 0);
    return typeof first === 'string' ? first : null;
  }
  return null;
};

function toNormalized(item: GovConApiOpportunity): NormalizedOpportunity {
  const r = item as Record<string, unknown>;

  const city = asString(r.performance_city_name);
  const state = asString(r.performance_state_code);
  const contactName = asString(r.contact_name);
  const contactEmail = asString(r.contact_email);

  return {
    jurisdiction: 'federal',
    externalNoticeId: item.notice_id,
    solicitationNumber: asString(r.solicitation_number),
    title: item.title,
    department: asString(r.agency),
    subTier: null,
    office: null,
    // Fallback string is intentionally non-vocab so the ingest's in-scope
    // filter drops it — we never store an opportunity with no real notice type.
    noticeType: asString(r.notice_type) ?? 'Unknown',
    naicsCode: firstString(r.naics),
    pscCode: firstString(r.psc),
    setAsideType: asString(r.set_aside_type),
    postedDate: asString(r.posted_date) ?? '',
    responseDeadline: asString(r.response_deadline),
    placeOfPerformance: city || state ? { city, state } : null,
    descriptionUrl: asString(r.sam_url),
    descriptionText: asString(r.description_text),
    pointOfContact: contactName || contactEmail ? { name: contactName, email: contactEmail } : null,
    rawData: r,
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
