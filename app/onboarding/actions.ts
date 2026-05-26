'use server';

import { redirect } from 'next/navigation';
import { parsePreferencesForm } from '@/lib/onboarding/preferences';
import { createClient } from '@/lib/supabase/server';

export type OnboardingState = { error?: string };

export async function saveCompanyPreferences(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = parsePreferencesForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please review the form and try again.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const p = parsed.data;
  // RLS enforces user_id = auth.uid(); we still set it explicitly for the row.
  const { error } = await supabase.from('company_preferences').upsert(
    {
      user_id: user.id,
      certifications: p.certifications,
      primary_naics: p.primaryNaics,
      secondary_naics: p.secondaryNaics,
      psc_codes: p.pscCodes,
      set_aside_types: p.setAsideTypes,
      place_of_performance: p.placeOfPerformance,
      value_band: p.valueBand,
      role: p.role,
      agencies_of_interest: p.agenciesOfInterest,
      agencies_excluded: p.agenciesExcluded,
      notice_types: p.noticeTypes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return { error: error.message };

  redirect('/dashboard');
}
