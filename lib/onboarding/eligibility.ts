// Pure eligibility logic for onboarding: set-asides are the EFFECT of held
// certifications, so we derive them rather than collect a second unlinked list,
// and we surface contradictions instead of silently accepting them. No Next /
// Supabase imports here so it stays unit-testable.

// Set-asides a holder of each certification becomes eligible to pursue.
const CERT_TO_SET_ASIDES: Record<string, string[]> = {
  '8(a)': ['8(a) Sole Source', '8(a) Competitive'],
  WOSB: ['WOSB'],
  EDWOSB: ['EDWOSB', 'WOSB'],
  SDVOSB: ['SDVOSB'],
  VOSB: [], // no government-wide VOSB set-aside (VA-only); no derived set-aside
  HUBZone: ['HUBZone'],
  SDB: [], // a status, not a set-aside program (8(a) is the program)
};

// Which certifications a set-aside requires (for contradiction detection).
const SET_ASIDE_REQUIRED_CERTS: Record<string, string[]> = {
  '8(a) Sole Source': ['8(a)'],
  '8(a) Competitive': ['8(a)'],
  WOSB: ['WOSB', 'EDWOSB'],
  EDWOSB: ['EDWOSB'],
  SDVOSB: ['SDVOSB'],
  HUBZone: ['HUBZone'],
  // Total/Partial Small Business and full-and-open need no specific cert.
};

export type PlaceOfPerformance = { states: string[]; remote: boolean; nationwide: boolean };

// Eligible set-asides from the certs the company HOLDS. Any held cert implies
// small-business status, so Total/Partial Small Business are included. The user
// can additionally widen to full-and-open in the form.
export function deriveSetAsides(certsGranted: string[]): string[] {
  const out = new Set<string>();
  for (const cert of certsGranted) {
    for (const sa of CERT_TO_SET_ASIDES[cert] ?? []) out.add(sa);
  }
  if (certsGranted.length > 0) {
    out.add('Total Small Business');
    out.add('Partial Small Business');
  }
  return [...out];
}

export type PreferenceWarning = { field: string; message: string };

// Surfaces contradictions the form should warn about (never silently accept).
export function validatePreferences(input: {
  certsGranted: string[];
  certsPursuing: string[];
  setAsideTypes: string[];
  placeOfPerformance: PlaceOfPerformance;
  hqState?: string | null;
}): PreferenceWarning[] {
  const warnings: PreferenceWarning[] = [];
  const granted = new Set(input.certsGranted);

  // Pursuing a set-aside without holding the cert it requires.
  for (const sa of input.setAsideTypes) {
    const required = SET_ASIDE_REQUIRED_CERTS[sa];
    if (required && required.length > 0 && !required.some((c) => granted.has(c))) {
      warnings.push({
        field: 'setAsideTypes',
        message: `Pursuing a ${sa} set-aside requires the ${required.join(' or ')} certification, which isn't in your held certs. Add the cert or drop this set-aside.`,
      });
    }
  }

  // HUBZone depends on a principal office in a HUBZone + 35% of employees
  // residing in one — at odds with performing fully remote, everywhere.
  const claimsHubzone = granted.has('HUBZone') || input.certsPursuing.includes('HUBZone');
  const fullyRemoteEverywhere =
    input.placeOfPerformance.remote && input.placeOfPerformance.nationwide;
  if (claimsHubzone && fullyRemoteEverywhere && !input.hqState) {
    warnings.push({
      field: 'hubzone',
      message:
        'HUBZone depends on a principal-office location and 35% of employees living in a HUBZone — that conflicts with being fully remote across all states. Set your HQ state, or reconsider HUBZone.',
    });
  }

  return warnings;
}
