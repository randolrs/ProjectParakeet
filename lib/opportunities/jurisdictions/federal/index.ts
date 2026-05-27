import { getActiveSource } from '@/lib/opportunities/sources';
import type {
  NormalizedOpportunity,
  OpportunitySource,
} from '@/lib/opportunities/sources';
import type {
  EligibilityCriteria,
  JurisdictionStrategy,
  JurisdictionVocabulary,
} from '@/lib/opportunities/jurisdictions';

export const FEDERAL_VOCABULARY: JurisdictionVocabulary = {
  certifications: ['8(a)', 'WOSB', 'EDWOSB', 'SDVOSB', 'VOSB', 'HUBZone', 'SDB'],
  setAsideTypes: [
    'Total Small Business',
    'Partial Small Business',
    '8(a) Sole Source',
    '8(a) Competitive',
    'WOSB',
    'EDWOSB',
    'SDVOSB',
    'HUBZone',
    'full and open',
  ],
  // v1 in-scope notice types. Expanded 2026-05 (founder decision) to add
  // Special + Award notices: Sources Sought/RFI and Special Notices let a small
  // vendor shape early-stage requirements, and Award Notices feed teaming-target
  // and recompete intel. Justifications, intent-to-bundle, and surplus sales
  // remain out. Ordered early-stage first.
  noticeTypes: [
    'Sources Sought',
    'Presolicitation',
    'Combined Synopsis/Solicitation',
    'Solicitation',
    'Special Notice',
    'Award Notice',
  ],
} as const;

export class FederalJurisdictionStrategy implements JurisdictionStrategy {
  readonly jurisdiction = 'federal';
  readonly defaultDigestDeliveryHour = 7; // 7 AM user-local
  readonly vocabulary = FEDERAL_VOCABULARY;

  source(): OpportunitySource {
    return getActiveSource();
  }

  normalize(opp: NormalizedOpportunity): NormalizedOpportunity {
    // Source impls already normalize; guarantee the jurisdiction tag here.
    return opp.jurisdiction === this.jurisdiction
      ? opp
      : { ...opp, jurisdiction: this.jurisdiction };
  }

  // M0 baseline pre-filter: NAICS spine + in-scope notice type + agency
  // exclusion. Set-aside/certification fit is refined in M3.
  isEligible(opp: NormalizedOpportunity, criteria: EligibilityCriteria): boolean {
    const inScope = this.vocabulary.noticeTypes.includes(opp.noticeType);
    if (!inScope) return false;

    if (criteria.noticeTypes.length && !criteria.noticeTypes.includes(opp.noticeType)) {
      return false;
    }

    if (criteria.naicsCodes.length) {
      if (!opp.naicsCode || !criteria.naicsCodes.includes(opp.naicsCode)) return false;
    }

    if (criteria.agenciesExcluded.length && opp.department) {
      const dept = opp.department.toLowerCase();
      const excluded = criteria.agenciesExcluded.some((a) =>
        dept.includes(a.toLowerCase()),
      );
      if (excluded) return false;
    }

    return true;
  }
}
