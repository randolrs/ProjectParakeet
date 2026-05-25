import {
  type NormalizedOpportunity,
  type OpportunitySearchParams,
  type OpportunitySource,
  type SourceCapabilities,
} from './types';

// GovConAPI is the v1 primary source. It resells SAM data with description
// text inline, so descriptionsInline=true and fetchDescription is a pure
// passthrough. Budget is per-hour (dev tier).
//
// TODO(M0): the search() response mapping is pending a real GovConAPI sample
// response. We deliberately do NOT invent a response shape — a fabricated Zod
// parser would silently break against the live API and waste budget. Once a
// sample is provided, add a `GovConApiOpportunitySchema`, Zod-parse the
// response here, and map each item to NormalizedOpportunity with
// descriptionText populated from the inline field.

const SEARCH_PENDING =
  'GovConApiSource.search is not implemented yet: the GovConAPI response ' +
  'schema is unknown. Provide a real sample response to complete the Zod ' +
  'mapping (see STATUS.md, M0).';

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

export class GovConApiSource implements OpportunitySource {
  readonly name = 'govconapi';
  readonly capabilities: SourceCapabilities = {
    descriptionsInline: true,
    requestBudget: { perHour: 1000 },
    // TODO(M0): confirm against GovConAPI docs; conservatively false for now.
    supportsModifiedSince: false,
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async search(_params: OpportunitySearchParams): Promise<NormalizedOpportunity[]> {
    // Auth wiring is ready; mapping is intentionally deferred — see TODO above.
    void authHeaders;
    throw new Error(SEARCH_PENDING);
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
