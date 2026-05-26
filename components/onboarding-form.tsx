'use client';

import { useActionState } from 'react';
import { saveCompanyPreferences, type OnboardingState } from '@/app/onboarding/actions';

type Option = { value: string; label: string };

export type OnboardingOptions = {
  certifications: readonly string[];
  setAsideTypes: readonly string[];
  noticeTypes: readonly string[];
  states: readonly string[];
  valueBands: readonly Option[];
  roles: readonly Option[];
};

export type OnboardingDefaults = {
  certifications: string[];
  primaryNaics: string;
  secondaryNaics: string;
  pscCodes: string;
  setAsideTypes: string[];
  states: string[];
  remote: boolean;
  nationwide: boolean;
  valueBand: string;
  role: string;
  agenciesOfInterest: string;
  agenciesExcluded: string;
  noticeTypes: string[];
};

const initial: OnboardingState = {};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function CheckboxGroup({
  name,
  options,
  selected,
}: {
  name: string;
  options: readonly string[];
  selected: string[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={name} value={opt} defaultChecked={selected.includes(opt)} />
          {opt}
        </label>
      ))}
    </div>
  );
}

export function OnboardingForm({
  options,
  defaults,
}: {
  options: OnboardingOptions;
  defaults: OnboardingDefaults;
}) {
  const [state, formAction, pending] = useActionState(saveCompanyPreferences, initial);

  const textareaClass =
    'rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-900';

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tell us about your company</h1>
        <p className="text-sm text-zinc-500">
          This shapes which opportunities reach your digest. You can change it anytime.
        </p>
      </header>

      <Section title="Certifications held">
        <CheckboxGroup name="certifications" options={options.certifications} selected={defaults.certifications} />
      </Section>

      <Section title="NAICS codes" hint="Six-digit codes, comma or newline separated. Primary is required.">
        <label className="flex flex-col gap-1 text-sm">
          Primary NAICS
          <textarea name="primaryNaics" rows={2} defaultValue={defaults.primaryNaics} className={textareaClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Secondary NAICS
          <textarea name="secondaryNaics" rows={2} defaultValue={defaults.secondaryNaics} className={textareaClass} />
        </label>
      </Section>

      <Section title="PSC codes" hint="Optional. Four-character product/service codes.">
        <textarea name="pscCodes" rows={2} defaultValue={defaults.pscCodes} className={textareaClass} />
      </Section>

      <Section title="Set-aside types you pursue">
        <CheckboxGroup name="setAsideTypes" options={options.setAsideTypes} selected={defaults.setAsideTypes} />
      </Section>

      <Section title="Place of performance">
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="remote" defaultChecked={defaults.remote} /> Remote OK
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="nationwide" defaultChecked={defaults.nationwide} /> Nationwide
          </label>
        </div>
        <CheckboxGroup name="states" options={options.states} selected={defaults.states} />
      </Section>

      <Section title="Contract value band">
        <div className="flex flex-wrap gap-4">
          {options.valueBands.map((b) => (
            <label key={b.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="valueBand" value={b.value} defaultChecked={defaults.valueBand === b.value} />
              {b.label}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Role">
        <div className="flex gap-4">
          {options.roles.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value={r.value} defaultChecked={defaults.role === r.value} />
              {r.label}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Agencies" hint="One per line or comma separated.">
        <label className="flex flex-col gap-1 text-sm">
          Agencies of interest
          <textarea name="agenciesOfInterest" rows={2} defaultValue={defaults.agenciesOfInterest} className={textareaClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Agencies to exclude
          <textarea name="agenciesExcluded" rows={2} defaultValue={defaults.agenciesExcluded} className={textareaClass} />
        </label>
      </Section>

      <Section title="Notice types">
        <CheckboxGroup name="noticeTypes" options={options.noticeTypes} selected={defaults.noticeTypes} />
      </Section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {pending ? 'Saving…' : 'Save preferences'}
      </button>
    </form>
  );
}
