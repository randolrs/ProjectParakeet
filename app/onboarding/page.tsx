import { redirect } from 'next/navigation';
import {
  OnboardingForm,
  type OnboardingDefaults,
  type OnboardingOptions,
} from '@/components/onboarding-form';
import {
  CERTIFICATIONS,
  NOTICE_TYPES,
  ROLE_LABELS,
  ROLE_VALUES,
  SET_ASIDE_TYPES,
  US_STATES,
  VALUE_BAND_LABELS,
  VALUE_BAND_VALUES,
} from '@/lib/onboarding/preferences';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const EMPTY: OnboardingDefaults = {
  certifications: [],
  primaryNaics: '',
  secondaryNaics: '',
  pscCodes: '',
  setAsideTypes: [],
  states: [],
  remote: false,
  nationwide: false,
  valueBand: '',
  role: '',
  agenciesOfInterest: '',
  agenciesExcluded: '',
  noticeTypes: [],
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: prefs } = await supabase
    .from('company_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const options: OnboardingOptions = {
    certifications: CERTIFICATIONS,
    setAsideTypes: SET_ASIDE_TYPES,
    noticeTypes: NOTICE_TYPES,
    states: US_STATES,
    valueBands: VALUE_BAND_VALUES.map((v) => ({ value: v, label: VALUE_BAND_LABELS[v] })),
    roles: ROLE_VALUES.map((v) => ({ value: v, label: ROLE_LABELS[v] })),
  };

  const pop = (prefs?.place_of_performance ?? {}) as {
    states?: string[];
    remote?: boolean;
    nationwide?: boolean;
  };

  const defaults: OnboardingDefaults = prefs
    ? {
        certifications: prefs.certifications ?? [],
        primaryNaics: (prefs.primary_naics ?? []).join(', '),
        secondaryNaics: (prefs.secondary_naics ?? []).join(', '),
        pscCodes: (prefs.psc_codes ?? []).join(', '),
        setAsideTypes: prefs.set_aside_types ?? [],
        states: pop.states ?? [],
        remote: pop.remote ?? false,
        nationwide: pop.nationwide ?? false,
        valueBand: prefs.value_band ?? '',
        role: prefs.role ?? '',
        agenciesOfInterest: (prefs.agencies_of_interest ?? []).join('\n'),
        agenciesExcluded: (prefs.agencies_excluded ?? []).join('\n'),
        noticeTypes: prefs.notice_types ?? [],
      }
    : EMPTY;

  return <OnboardingForm options={options} defaults={defaults} />;
}
