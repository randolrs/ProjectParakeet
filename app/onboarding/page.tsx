import { redirect } from 'next/navigation';
import { EnrichForm } from '@/components/enrich-form';
import {
  OnboardingForm,
  type OnboardingDefaults,
  type OnboardingOptions,
} from '@/components/onboarding-form';
import { ExtractedCompanySchema } from '@/lib/onboarding/enrichment';
import {
  CERTIFICATIONS,
  CONTRACT_VEHICLES,
  NOTICE_TYPE_OPTIONS,
  ROLE_LABELS,
  ROLE_VALUES,
  US_STATES,
  VALUE_THRESHOLDS,
} from '@/lib/onboarding/preferences';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const numStr = (n: number | null | undefined) => (n != null ? String(n) : '');

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: prefs }, { data: enr }] = await Promise.all([
    supabase.from('company_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('company_enrichment')
      .select('website_url, extracted')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const extracted = ExtractedCompanySchema.partial().safeParse(enr?.extracted);
  const suggestion = extracted.success ? extracted.data : undefined;
  const suggestionNaics = suggestion?.naics ?? [];
  const suggestionCodes = suggestionNaics.map((n) => n.code);

  const options: OnboardingOptions = {
    certifications: CERTIFICATIONS,
    contractVehicles: CONTRACT_VEHICLES,
    states: US_STATES,
    roles: ROLE_VALUES.map((v) => ({ value: v, label: ROLE_LABELS[v] })),
    noticeTypeOptions: NOTICE_TYPE_OPTIONS,
    naicsSuggestions: suggestionNaics,
    valueThresholds: VALUE_THRESHOLDS,
  };

  const earlyStageDefaults = NOTICE_TYPE_OPTIONS.filter((n) => n.earlyStage).map((n) => n.value);

  let defaults: OnboardingDefaults;
  if (prefs) {
    const pop = (prefs.place_of_performance ?? {}) as {
      states?: string[];
      remote?: boolean;
      nationwide?: boolean;
    };
    const primary: string[] = prefs.primary_naics ?? [];
    defaults = {
      certsGranted: prefs.certifications ?? [],
      certsPursuing: prefs.certs_pursuing ?? [],
      confirmedNaics: primary.filter((c) => suggestionCodes.includes(c)),
      primaryNaicsExtra: primary.filter((c) => !suggestionCodes.includes(c)).join(', '),
      secondaryNaics: (prefs.secondary_naics ?? []).join(', '),
      pscCodes: (prefs.psc_codes ?? []).join(', '),
      keywords: (prefs.keywords ?? []).join(', '),
      contractVehicles: prefs.contract_vehicles ?? [],
      states: pop.states ?? [],
      remote: pop.remote ?? false,
      nationwide: pop.nationwide ?? false,
      hqState: prefs.hq_state ?? '',
      valueMin: numStr(prefs.value_min),
      valueMax: numStr(prefs.value_max),
      annualRevenue: numStr(prefs.annual_revenue_usd),
      employeeCount: numStr(prefs.employee_count),
      samRegistered: prefs.sam_registered ?? false,
      hasUei: prefs.has_uei ?? false,
      role: prefs.role ?? '',
      agenciesOfInterest: (prefs.agencies_of_interest ?? []).join('\n'),
      agenciesExcluded: (prefs.agencies_excluded ?? []).join('\n'),
      noticeTypes: prefs.notice_types ?? [],
      widenFullOpen: (prefs.set_aside_types ?? []).includes('full and open'),
    };
  } else {
    // First time: confirm the crawl's suggestions, default broad on notice types.
    defaults = {
      certsGranted: [],
      certsPursuing: [],
      confirmedNaics: suggestionCodes,
      primaryNaicsExtra: '',
      secondaryNaics: '',
      pscCodes: (suggestion?.psc ?? []).join(', '),
      keywords: (suggestion?.keywords ?? []).join(', '),
      contractVehicles: [],
      states: [],
      remote: false,
      nationwide: false,
      hqState: '',
      valueMin: numStr(suggestion?.valueMin),
      valueMax: numStr(suggestion?.valueMax),
      annualRevenue: '',
      employeeCount: '',
      samRegistered: false,
      hasUei: false,
      role: '',
      agenciesOfInterest: '',
      agenciesExcluded: '',
      noticeTypes: earlyStageDefaults,
      widenFullOpen: false,
    };
  }

  return (
    <>
      <EnrichForm
        websiteUrl={enr?.website_url ?? ''}
        capabilitySummary={suggestion?.capabilitySummary ?? ''}
      />
      <OnboardingForm options={options} defaults={defaults} />
    </>
  );
}
