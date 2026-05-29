import type { NormalizedOpportunity } from '@/lib/opportunities/sources';

// The per-user, cheap, pre-LLM eligibility filter. Pure: takes an opportunity
// and a user's profile, returns a structured pass/fail with reasons so we can
// observe why opportunities drop out (the digest pipeline lives or dies on
// this filter being aggressive enough — CLAUDE.md cost discipline).
//
// Stricter than the ingest-time filter in /lib/opportunities/jurisdictions —
// that one drops out-of-scope notice types; this one applies the FULL user
// preferences (NAICS, set-asides eligibility, agencies, notice types,
// place-of-performance, deadline runway).

export type DropReason =
  | 'inactive'
  | 'deadline_passed'
  | 'naics_mismatch'
  | 'set_aside_ineligible'
  | 'notice_type_excluded'
  | 'agency_excluded'
  | 'place_of_performance_mismatch';

export interface EligibilityProfile {
  // Empty array means "no restriction" for the array filters. This matches the
  // M0 baseline filter contract.
  primaryNaics: string[];
  secondaryNaics: string[];
  setAsideTypes: string[];
  noticeTypes: string[];
  agenciesExcluded: string[];
  placeOfPerformance: {
    states: string[];
    remote: boolean;
    nationwide: boolean;
  };
}

export interface EligibilityResult {
  eligible: boolean;
  // Empty if eligible. Filled with every rule that rejected the opp (we keep
  // them all so observability isn't lossy).
  reasons: DropReason[];
}

// Tokens treated as "no set-aside / fully open competition" — these are
// eligible for any user regardless of certifications.
const OPEN_SET_ASIDE_TOKENS = ['full and open', 'unrestricted', 'none'];

function normalize(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

function isOpenSetAside(setAside: string | null): boolean {
  if (!setAside) return true;
  const n = normalize(setAside);
  if (n === '') return true;
  return OPEN_SET_ASIDE_TOKENS.some((t) => n.includes(t));
}

// True iff the user's set-aside eligibility list contains a string that
// matches the opportunity's set-aside (case-insensitive substring either way).
function userMatchesSetAside(oppSetAside: string, userSetAsides: string[]): boolean {
  const o = normalize(oppSetAside);
  return userSetAsides.some((u) => {
    const n = normalize(u);
    return n !== '' && (n === o || o.includes(n) || n.includes(o));
  });
}

function userAgencyExcluded(department: string | null, excluded: string[]): boolean {
  if (!department || excluded.length === 0) return false;
  const d = normalize(department);
  return excluded.some((a) => {
    const n = normalize(a);
    return n !== '' && d.includes(n);
  });
}

function placeOfPerformanceMatches(
  oppPlace: NormalizedOpportunity['placeOfPerformance'],
  user: EligibilityProfile['placeOfPerformance'],
): boolean {
  // Nationwide swallows any place.
  if (user.nationwide) return true;
  // No location info on the opportunity → we cannot reject; let it through and
  // let scoring weigh it. (Place-of-performance is frequently missing on SAM
  // records; rejecting on absence would over-cull.)
  if (!oppPlace) return true;
  const state =
    typeof oppPlace.state === 'string'
      ? oppPlace.state
      : oppPlace.state && typeof oppPlace.state === 'object' && 'code' in oppPlace.state
        ? (oppPlace.state as { code?: unknown }).code
        : undefined;
  if (typeof state !== 'string' || state === '') return true; // unknown → defer to scoring
  if (user.states.length === 0) return user.remote; // user didn't pick states; only remote-mode passes
  return user.states.includes(state.toUpperCase());
}

export function evaluateEligibility(
  opp: NormalizedOpportunity,
  profile: EligibilityProfile,
  now: Date = new Date(),
): EligibilityResult {
  const reasons: DropReason[] = [];

  if (opp.responseDeadline) {
    const deadline = new Date(opp.responseDeadline);
    if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < now.getTime()) {
      reasons.push('deadline_passed');
    }
  }

  if (profile.noticeTypes.length > 0 && !profile.noticeTypes.includes(opp.noticeType)) {
    reasons.push('notice_type_excluded');
  }

  const naicsPool = [...profile.primaryNaics, ...profile.secondaryNaics];
  if (naicsPool.length > 0) {
    if (!opp.naicsCode || !naicsPool.includes(opp.naicsCode)) {
      reasons.push('naics_mismatch');
    }
  }

  // Set-aside: open competitions are eligible for everyone. Restricted ones
  // require the user's certifications to cover them.
  if (!isOpenSetAside(opp.setAsideType)) {
    if (profile.setAsideTypes.length === 0) {
      reasons.push('set_aside_ineligible');
    } else if (!userMatchesSetAside(opp.setAsideType ?? '', profile.setAsideTypes)) {
      reasons.push('set_aside_ineligible');
    }
  }

  if (userAgencyExcluded(opp.department, profile.agenciesExcluded)) {
    reasons.push('agency_excluded');
  }

  if (!placeOfPerformanceMatches(opp.placeOfPerformance, profile.placeOfPerformance)) {
    reasons.push('place_of_performance_mismatch');
  }

  return { eligible: reasons.length === 0, reasons };
}
