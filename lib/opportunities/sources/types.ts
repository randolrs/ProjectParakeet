import { z } from 'zod';

// Source-independent, jurisdiction-tagged opportunity. Everything
// downstream speaks THIS, never a vendor's raw JSON.
export const NormalizedOpportunitySchema = z.object({
  jurisdiction: z.string(), // 'federal' in v1
  externalNoticeId: z.string(),
  solicitationNumber: z.string().nullable(),
  title: z.string(),
  department: z.string().nullable(),
  subTier: z.string().nullable(),
  office: z.string().nullable(),
  noticeType: z.string(),
  naicsCode: z.string().nullable(),
  pscCode: z.string().nullable(),
  setAsideType: z.string().nullable(),
  postedDate: z.string(), // ISO
  responseDeadline: z.string().nullable(),
  placeOfPerformance: z.record(z.string(), z.unknown()).nullable(),
  descriptionUrl: z.string().nullable(),
  descriptionText: z.string().nullable(), // populated iff descriptionsInline
  pointOfContact: z.record(z.string(), z.unknown()).nullable(),
  rawData: z.record(z.string(), z.unknown()),
});
export type NormalizedOpportunity = z.infer<typeof NormalizedOpportunitySchema>;

export interface OpportunitySearchParams {
  postedFrom: string; // mm/dd/yyyy at the source boundary; normalize internally
  postedTo: string;
  noticeTypes?: string[];
  naics?: string;
  limit: number;
  offset: number;
}

export interface SourceCapabilities {
  descriptionsInline: boolean; // govconapi: true, sam: false
  requestBudget: { perDay?: number; perHour?: number };
  supportsModifiedSince: boolean;
}

export interface OpportunitySource {
  readonly name: string; // 'govconapi' | 'sam-direct'
  readonly capabilities: SourceCapabilities;
  search(params: OpportunitySearchParams): Promise<NormalizedOpportunity[]>;
  // Passthrough returning existing text when descriptionsInline; counts
  // against budget otherwise.
  fetchDescription(opp: NormalizedOpportunity): Promise<string>;
}
