import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  bidProfiles,
  companyPreferences,
  opportunities,
  users,
} from '@/db/schema';
import { FederalJurisdictionStrategy } from '@/lib/opportunities/jurisdictions/federal';
import type { NormalizedOpportunity } from '@/lib/opportunities/sources';
import {
  evaluateEligibility,
  type DropReason,
  type EligibilityProfile,
} from '@/lib/digest/eligibility';

// A pulled-from-DB candidate, slim by design: opportunities.raw_data can be
// hundreds of KB and we never need it for filtering or scoring. We carry the
// id + hash so the scoring cache can key on (opportunity_id, opportunity_hash).
export interface CandidateOpportunity {
  id: string;
  rawDataHash: string;
  // The eligibility filter consumes a NormalizedOpportunity; pulled fields
  // populate it exactly. rawData is filled with {} since the filter never
  // reads it (downstream rendering uses the typed fields).
  normalized: NormalizedOpportunity;
}

export interface CandidateUserProfile {
  userId: string;
  jurisdiction: string;
  bidProfileVersion: number;
  eligibility: EligibilityProfile;
}

export interface CandidateSelection {
  userId: string;
  jurisdiction: string;
  bidProfileVersion: number;
  candidatesConsidered: number;
  eligible: CandidateOpportunity[];
  dropCounts: Partial<Record<DropReason, number>>;
}

// The seam. The DB-backed impl below is what production uses; tests inject a
// fake store so candidate-selection logic is verifiable without Postgres.
export interface CandidateStore {
  loadUserProfile(userId: string): Promise<CandidateUserProfile | null>;
  loadCandidateOpportunities(
    jurisdiction: string,
    asOf: Date,
    inScopeNoticeTypes: string[],
  ): Promise<CandidateOpportunity[]>;
}

export async function selectCandidates(
  store: CandidateStore,
  userId: string,
  now: Date = new Date(),
): Promise<CandidateSelection> {
  const profile = await store.loadUserProfile(userId);
  if (!profile) {
    throw new Error(`No user profile found for ${userId}.`);
  }

  // Cheap in-DB pre-filter: only pull what the jurisdiction considers in-scope.
  // The federal vocabulary already excludes Justification/Surplus/etc., so we
  // never even page through them here.
  const strategy = new FederalJurisdictionStrategy();
  const inScope = [...strategy.vocabulary.noticeTypes];

  const all = await store.loadCandidateOpportunities(profile.jurisdiction, now, inScope);

  const dropCounts: Partial<Record<DropReason, number>> = {};
  const eligible: CandidateOpportunity[] = [];
  for (const cand of all) {
    const result = evaluateEligibility(cand.normalized, profile.eligibility, now);
    if (result.eligible) {
      eligible.push(cand);
    } else {
      for (const reason of result.reasons) {
        dropCounts[reason] = (dropCounts[reason] ?? 0) + 1;
      }
    }
  }

  return {
    userId,
    jurisdiction: profile.jurisdiction,
    bidProfileVersion: profile.bidProfileVersion,
    candidatesConsidered: all.length,
    eligible,
    dropCounts,
  };
}

// Production store. Read-only; writes happen in the digest generator (next).
export class DrizzleCandidateStore implements CandidateStore {
  async loadUserProfile(userId: string): Promise<CandidateUserProfile | null> {
    const db = getDb();
    const userRows = await db
      .select({ jurisdictions: users.jurisdictions })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (userRows.length === 0) return null;

    const prefRows = await db
      .select()
      .from(companyPreferences)
      .where(eq(companyPreferences.userId, userId))
      .limit(1);
    if (prefRows.length === 0) return null;
    const prefs = prefRows[0];

    const bidRows = await db
      .select({ version: bidProfiles.version })
      .from(bidProfiles)
      .where(eq(bidProfiles.userId, userId))
      .limit(1);

    // Default federal if the user has no jurisdictions column populated.
    const jurisdiction = userRows[0].jurisdictions[0] ?? 'federal';

    const pop = (prefs.placeOfPerformance as {
      states?: unknown;
      remote?: unknown;
      nationwide?: unknown;
    }) ?? {};
    const eligibility: EligibilityProfile = {
      primaryNaics: prefs.primaryNaics,
      secondaryNaics: prefs.secondaryNaics,
      setAsideTypes: prefs.setAsideTypes,
      noticeTypes: prefs.noticeTypes,
      agenciesExcluded: prefs.agenciesExcluded,
      placeOfPerformance: {
        states: Array.isArray(pop.states) ? (pop.states as string[]) : [],
        remote: Boolean(pop.remote),
        nationwide: Boolean(pop.nationwide),
      },
    };

    return {
      userId,
      jurisdiction,
      bidProfileVersion: bidRows[0]?.version ?? 0,
      eligibility,
    };
  }

  async loadCandidateOpportunities(
    jurisdiction: string,
    asOf: Date,
    inScopeNoticeTypes: string[],
  ): Promise<CandidateOpportunity[]> {
    const db = getDb();
    // Cheap pre-filter in SQL (the row-count multiplier matters as the DB grows):
    // - same jurisdiction
    // - currently active in the source
    // - either no closing date (active vehicles) or deadline in the future
    // - notice type in this jurisdiction's in-scope vocabulary
    // Everything else (NAICS, set-asides, POP, agency exclusions) runs in
    // memory through evaluateEligibility — those rules need substring matching
    // and shape variance that don't translate cleanly to SQL.
    const rows = await db
      .select({
        id: opportunities.id,
        rawDataHash: opportunities.rawDataHash,
        jurisdiction: opportunities.jurisdiction,
        externalNoticeId: opportunities.externalNoticeId,
        solicitationNumber: opportunities.solicitationNumber,
        title: opportunities.title,
        department: opportunities.department,
        subTier: opportunities.subTier,
        office: opportunities.office,
        noticeType: opportunities.noticeType,
        naicsCode: opportunities.naicsCode,
        pscCode: opportunities.pscCode,
        setAsideType: opportunities.setAsideType,
        postedDate: opportunities.postedDate,
        responseDeadline: opportunities.responseDeadline,
        placeOfPerformance: opportunities.placeOfPerformance,
        descriptionUrl: opportunities.descriptionUrl,
        descriptionText: opportunities.descriptionText,
        pointOfContact: opportunities.pointOfContact,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.jurisdiction, jurisdiction),
          eq(opportunities.isActive, true),
          inArray(opportunities.noticeType, inScopeNoticeTypes),
          or(isNull(opportunities.responseDeadline), gt(opportunities.responseDeadline, asOf)),
        ),
      );

    return rows.map((r) => ({
      id: r.id,
      rawDataHash: r.rawDataHash,
      normalized: {
        jurisdiction: r.jurisdiction,
        externalNoticeId: r.externalNoticeId,
        solicitationNumber: r.solicitationNumber,
        title: r.title,
        department: r.department,
        subTier: r.subTier,
        office: r.office,
        noticeType: r.noticeType,
        naicsCode: r.naicsCode,
        pscCode: r.pscCode,
        setAsideType: r.setAsideType,
        postedDate: r.postedDate?.toISOString() ?? '',
        responseDeadline: r.responseDeadline?.toISOString() ?? null,
        placeOfPerformance: r.placeOfPerformance as Record<string, unknown> | null,
        descriptionUrl: r.descriptionUrl,
        descriptionText: r.descriptionText,
        pointOfContact: r.pointOfContact as Record<string, unknown> | null,
        // The filter never reads rawData; downstream code uses the typed fields.
        rawData: {},
      },
    }));
  }
}
