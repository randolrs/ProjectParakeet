import { z } from 'zod';
import { fetchJson } from '@/lib/http';
import {
  NormalizedOpportunitySchema,
  type NormalizedOpportunity,
  type OpportunitySearchParams,
  type OpportunitySource,
  type SearchPage,
  type SourceCapabilities,
} from './types';

const SEARCH_BASE = 'https://api.sam.gov/prod/opportunities/v2/search';

// SAM exposes notice types as single-letter `ptype` codes. We translate
// the human notice-type names used everywhere downstream into SAM's codes
// here, at the source boundary, so SAM's vocabulary never leaks outward.
const NOTICE_TYPE_TO_PTYPE: Record<string, string> = {
  Solicitation: 'o',
  'Combined Synopsis/Solicitation': 'k',
  Presolicitation: 'p',
  'Sources Sought': 'r',
  'Special Notice': 's',
  'Award Notice': 'a',
  Justification: 'u',
  'Intent to Bundle': 'i',
  'Sale of Surplus Property': 'g',
};

// --- SAM raw response shapes (validated at this boundary, never leaked) ---

const SamPocSchema = z.object({
  type: z.string().nullish(),
  fullName: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  title: z.string().nullish(),
});

const SamOpportunitySchema = z.object({
  noticeId: z.string(),
  title: z.string(),
  solicitationNumber: z.string().nullish(),
  fullParentPathName: z.string().nullish(),
  postedDate: z.string(),
  type: z.string(),
  typeOfSetAsideDescription: z.string().nullish(),
  typeOfSetAside: z.string().nullish(),
  responseDeadLine: z.string().nullish(),
  naicsCode: z.string().nullish(),
  naicsCodes: z.array(z.string()).nullish(),
  classificationCode: z.string().nullish(),
  description: z.string().nullish(),
  pointOfContact: z.array(SamPocSchema).nullish(),
  placeOfPerformance: z.record(z.string(), z.unknown()).nullish(),
});

const SamSearchResponseSchema = z.object({
  totalRecords: z.number().nullish(),
  limit: z.number().nullish(),
  offset: z.number().nullish(),
  opportunitiesData: z.array(z.unknown()).nullish(),
});

const SamDescriptionSchema = z.object({
  description: z.string(),
});

function toIso(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

function splitParentPath(path: string | null | undefined): {
  department: string | null;
  subTier: string | null;
  office: string | null;
} {
  if (!path) return { department: null, subTier: null, office: null };
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { department: null, subTier: null, office: null };
  return {
    department: parts[0] ?? null,
    subTier: parts[1] ?? null,
    office: parts.length > 1 ? (parts[parts.length - 1] ?? null) : null,
  };
}

function appendApiKey(url: string, apiKey: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return url.includes('api_key=') ? url : `${url}${sep}api_key=${encodeURIComponent(apiKey)}`;
}

function requireKey(): string {
  const key = process.env.SAM_API_KEY;
  if (!key) {
    throw new Error('SAM_API_KEY is not set; SamDirectSource cannot make requests.');
  }
  return key;
}

export class SamDirectSource implements OpportunitySource {
  readonly name = 'sam-direct';
  readonly capabilities: SourceCapabilities = {
    descriptionsInline: false,
    requestBudget: { perDay: 1000 },
    supportsModifiedSince: false,
  };

  async search(params: OpportunitySearchParams): Promise<SearchPage> {
    const apiKey = requireKey();
    const query = new URLSearchParams({
      api_key: apiKey,
      postedFrom: params.postedFrom,
      postedTo: params.postedTo,
      limit: String(params.limit),
      offset: String(params.offset),
    });

    if (params.naics) query.set('ncode', params.naics);
    if (params.noticeTypes?.length) {
      const codes = params.noticeTypes
        .map((t) => NOTICE_TYPE_TO_PTYPE[t] ?? (t.length === 1 ? t : undefined))
        .filter((c): c is string => Boolean(c));
      if (codes.length) query.set('ptype', codes.join(','));
    }

    const raw = await fetchJson(`${SEARCH_BASE}?${query.toString()}`, {}, {
      context: { source: this.name, op: 'search' },
    });
    const parsed = SamSearchResponseSchema.parse(raw);
    const rawItems = parsed.opportunitiesData ?? [];
    const items = rawItems.map((item) => this.normalize(item));
    const total = parsed.totalRecords ?? 0;
    const offset = parsed.offset ?? params.offset;
    const hasNext = total > offset + items.length;
    return { items, hasNext };
  }

  private normalize(item: unknown): NormalizedOpportunity {
    const o = SamOpportunitySchema.parse(item);
    const { department, subTier, office } = splitParentPath(o.fullParentPathName);
    const poc = o.pointOfContact?.find((p) => p.type === 'primary') ?? o.pointOfContact?.[0];

    return NormalizedOpportunitySchema.parse({
      jurisdiction: 'federal',
      externalNoticeId: o.noticeId,
      solicitationNumber: o.solicitationNumber ?? null,
      title: o.title,
      department,
      subTier,
      office,
      noticeType: o.type,
      naicsCode: o.naicsCode ?? o.naicsCodes?.[0] ?? null,
      pscCode: o.classificationCode ?? null,
      setAsideType: o.typeOfSetAsideDescription ?? o.typeOfSetAside ?? null,
      postedDate: toIso(o.postedDate),
      responseDeadline: o.responseDeadLine ?? null,
      placeOfPerformance: o.placeOfPerformance ?? null,
      descriptionUrl: o.description ?? null,
      descriptionText: null,
      pointOfContact: poc ? (poc as Record<string, unknown>) : null,
      rawData: item as Record<string, unknown>,
    });
  }

  // Descriptions are NOT inline for SAM. Each call hits the notice
  // description endpoint and counts against the request budget — callers
  // must gate this behind eligibility + caching (see CLAUDE.md).
  async fetchDescription(opp: NormalizedOpportunity): Promise<string> {
    if (opp.descriptionText) return opp.descriptionText;
    if (!opp.descriptionUrl) {
      throw new Error(`Opportunity ${opp.externalNoticeId} has no description URL.`);
    }
    const apiKey = requireKey();
    const raw = await fetchJson(appendApiKey(opp.descriptionUrl, apiKey), {}, {
      context: { source: this.name, op: 'fetchDescription' },
    });
    return SamDescriptionSchema.parse(raw).description;
  }
}
