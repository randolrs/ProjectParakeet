import type {
  NormalizedOpportunity,
  OpportunitySource,
} from '@/lib/opportunities/sources';
import type {
  EligibilityCriteria,
  JurisdictionStrategy,
  JurisdictionVocabulary,
} from '@/lib/opportunities/jurisdictions';

const NOT_SUPPORTED = 'SLED not yet supported';

// State & Local is a first-class concept in the schema and a planned M7+
// expansion, but no SLED ingest ships in v1. This stub exists so the
// jurisdiction abstraction is real today; every method throws.
export class SledJurisdictionStrategy implements JurisdictionStrategy {
  readonly jurisdiction = 'sled';
  readonly defaultDigestDeliveryHour = 7;
  readonly vocabulary: JurisdictionVocabulary = {
    certifications: [],
    setAsideTypes: [],
    noticeTypes: [],
  };

  source(): OpportunitySource {
    throw new Error(NOT_SUPPORTED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  normalize(_opp: NormalizedOpportunity): NormalizedOpportunity {
    throw new Error(NOT_SUPPORTED);
  }

  isEligible(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _opp: NormalizedOpportunity,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _criteria: EligibilityCriteria,
  ): boolean {
    throw new Error(NOT_SUPPORTED);
  }
}
