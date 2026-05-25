import type { NormalizedOpportunity, OpportunitySource } from '@/lib/opportunities/sources';

// Jurisdiction is first-class even though only federal ships in v1. A strategy
// abstracts everything that differs by jurisdiction: where data comes from, how
// it's normalized, the vocabulary, the default digest hour, and eligibility.
// Federal-specific logic must live under jurisdictions/federal/ — never here.

export interface JurisdictionVocabulary {
  readonly certifications: readonly string[];
  readonly setAsideTypes: readonly string[];
  readonly noticeTypes: readonly string[]; // in-scope notice types
}

// The cheap, pre-LLM eligibility filter inputs (a subset of a user's
// company_preferences). Empty arrays mean "no restriction".
export interface EligibilityCriteria {
  naicsCodes: string[];
  setAsideTypes: string[];
  noticeTypes: string[];
  agenciesExcluded: string[];
}

export interface JurisdictionStrategy {
  readonly jurisdiction: string;
  readonly defaultDigestDeliveryHour: number; // user-local hour, 0-23
  readonly vocabulary: JurisdictionVocabulary;

  // Data fetch: the opportunity source this jurisdiction pulls from.
  source(): OpportunitySource;

  // Normalization hook layered on top of the source's own boundary
  // normalization (e.g. guaranteeing the jurisdiction tag).
  normalize(opp: NormalizedOpportunity): NormalizedOpportunity;

  // Eligibility rules: a cheap filter applied in-DB before any LLM scoring.
  isEligible(opp: NormalizedOpportunity, criteria: EligibilityCriteria): boolean;
}

export async function loadJurisdictionStrategy(
  jurisdiction: string,
): Promise<JurisdictionStrategy> {
  switch (jurisdiction.toLowerCase()) {
    case 'federal': {
      const { FederalJurisdictionStrategy } = await import(
        '@/lib/opportunities/jurisdictions/federal'
      );
      return new FederalJurisdictionStrategy();
    }
    case 'sled': {
      const { SledJurisdictionStrategy } = await import(
        '@/lib/opportunities/jurisdictions/sled'
      );
      return new SledJurisdictionStrategy();
    }
    default:
      throw new Error(`Unknown jurisdiction "${jurisdiction}".`);
  }
}
