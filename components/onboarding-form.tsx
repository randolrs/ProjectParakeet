'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveCompanyPreferences, type OnboardingState } from '@/app/onboarding/actions';
import { deriveSetAsides, validatePreferences } from '@/lib/onboarding/eligibility';

type Option = { value: string; label: string };
type NaicsSuggestion = { code: string; label: string; sizeStandard: string };

export type OnboardingOptions = {
  certifications: readonly string[];
  contractVehicles: readonly string[];
  states: readonly string[];
  roles: readonly Option[];
  noticeTypeOptions: ReadonlyArray<{
    value: string;
    label: string;
    help: string;
    earlyStage: boolean;
  }>;
  naicsSuggestions: NaicsSuggestion[];
  valueThresholds: string;
};

export type OnboardingDefaults = {
  certsGranted: string[];
  certsPursuing: string[];
  confirmedNaics: string[];
  primaryNaicsExtra: string;
  secondaryNaics: string;
  pscCodes: string;
  keywords: string;
  contractVehicles: string[];
  states: string[];
  remote: boolean;
  nationwide: boolean;
  hqState: string;
  valueMin: string;
  valueMax: string;
  annualRevenue: string;
  employeeCount: string;
  samRegistered: boolean;
  hasUei: boolean;
  role: string;
  agenciesOfInterest: string;
  agenciesExcluded: string;
  noticeTypes: string[];
  widenFullOpen: boolean;
};

const initial: OnboardingState = {};
const input =
  'rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900';

function Section({
  title,
  hint,
  tag,
  children,
}: {
  title: string;
  hint?: string;
  tag?: 'filter' | 'signal';
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {tag && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800">
            {tag === 'filter' ? 'hard filter' : 'ranking signal'}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {children}
    </section>
  );
}

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export function OnboardingForm({
  options,
  defaults,
}: {
  options: OnboardingOptions;
  defaults: OnboardingDefaults;
}) {
  const [state, formAction, pending] = useActionState(saveCompanyPreferences, initial);

  const [certsGranted, setCertsGranted] = useState<string[]>(defaults.certsGranted);
  const [certsPursuing, setCertsPursuing] = useState<string[]>(defaults.certsPursuing);
  const [remote, setRemote] = useState(defaults.remote);
  const [nationwide, setNationwide] = useState(defaults.nationwide);
  const [hqState, setHqState] = useState(defaults.hqState);
  const [widenFullOpen, setWidenFullOpen] = useState(defaults.widenFullOpen);

  const setAsides = useMemo(
    () => [...deriveSetAsides(certsGranted), ...(widenFullOpen ? ['full and open'] : [])],
    [certsGranted, widenFullOpen],
  );

  const warnings = useMemo(
    () =>
      validatePreferences({
        certsGranted,
        certsPursuing,
        setAsideTypes: setAsides,
        placeOfPerformance: { states: [], remote, nationwide },
        hqState,
      }),
    [certsGranted, certsPursuing, setAsides, remote, nationwide, hqState],
  );

  const primarySizeStandard = options.naicsSuggestions[0]?.sizeStandard;

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tell us what you do</h1>
        <p className="text-sm text-zinc-500">
          {'Start broad — we will tighten from your feedback. Most of this is a ranking signal, not a hard wall; you can change it anytime.'}
        </p>
      </header>

      <Section
        title="What you do"
        tag="signal"
        hint="How buyers and vendors actually search. Comma-separated."
      >
        <textarea name="keywords" rows={2} defaultValue={defaults.keywords} className={`${input} font-mono`} />
      </Section>

      <Section
        title="NAICS codes"
        tag="signal"
        hint="Confirm the suggestions (from your site) or add your own. We rank by these — we do not hard-filter to them."
      >
        {options.naicsSuggestions.length > 0 ? (
          <div className="flex flex-col gap-1">
            {options.naicsSuggestions.map((n) => (
              <label key={n.code} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="primaryNaics"
                  value={n.code}
                  defaultChecked={defaults.confirmedNaics.includes(n.code)}
                  className="mt-1"
                />
                <span>
                  <span className="font-mono">{n.code}</span> — {n.label}
                  {n.sizeStandard && (
                    <span className="block text-xs text-zinc-500">size standard: {n.sizeStandard}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            {'No suggestions yet — add your codes below, or use “Autofill from your website” above.'}
          </p>
        )}
        <label className="mt-1 flex flex-col gap-1 text-sm">
          Add other NAICS codes
          <textarea name="primaryNaicsAdd" rows={1} defaultValue={defaults.primaryNaicsExtra} className={`${input} font-mono`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Secondary NAICS (optional)
          <textarea name="secondaryNaics" rows={1} defaultValue={defaults.secondaryNaics} className={`${input} font-mono`} />
        </label>
      </Section>

      <Section title="Certifications held" hint="What you actually hold today drives your eligible set-asides.">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {options.certifications.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="certsGranted"
                value={c}
                checked={certsGranted.includes(c)}
                onChange={() => setCertsGranted((s) => toggle(s, c))}
              />
              {c}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Certifications you are pursuing" hint="In progress, not yet granted. We will not surface set-aside-only work you cannot win yet.">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {options.certifications.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="certsPursuing"
                value={c}
                checked={certsPursuing.includes(c)}
                onChange={() => setCertsPursuing((s) => toggle(s, c))}
              />
              {c}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Eligible set-asides" tag="signal" hint="Derived from the certs you hold. Widen if you also bid full-and-open.">
        <div className="flex flex-wrap gap-2">
          {setAsides.length === 0 ? (
            <span className="text-xs text-zinc-500">Select certifications above to populate this.</span>
          ) : (
            setAsides.map((s) => (
              <span key={s} className="rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800">
                {s}
              </span>
            ))
          )}
        </div>
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="widenFullOpen"
            checked={widenFullOpen}
            onChange={(e) => setWidenFullOpen(e.target.checked)}
          />
          Also include full-and-open opportunities
        </label>
      </Section>

      {warnings.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {warnings.map((w, i) => (
            <p key={i}>⚠ {w.message}</p>
          ))}
        </div>
      )}

      <Section title="Where you can perform" tag="filter">
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="remote" checked={remote} onChange={(e) => setRemote(e.target.checked)} /> Remote OK
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="nationwide" checked={nationwide} onChange={(e) => setNationwide(e.target.checked)} /> Nationwide
          </label>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">or pick specific states</summary>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {options.states.map((st) => (
              <label key={st} className="flex items-center gap-1">
                <input type="checkbox" name="states" value={st} defaultChecked={defaults.states.includes(st)} />
                {st}
              </label>
            ))}
          </div>
        </details>
      </Section>

      <Section title="Where you are located" hint="Your principal office state — drives HUBZone and local-preference logic.">
        <select name="hqState" value={hqState} onChange={(e) => setHqState(e.target.value)} className={input}>
          <option value="">Not specified</option>
          {options.states.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Size" hint="Small vs large is specific to your primary NAICS, not a single label.">
        {primarySizeStandard && (
          <p className="text-xs text-zinc-500">Primary NAICS size standard: {primarySizeStandard}</p>
        )}
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Annual revenue (USD)
            <input name="annualRevenueUsd" inputMode="numeric" defaultValue={defaults.annualRevenue} placeholder="$0" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Employees
            <input name="employeeCount" inputMode="numeric" defaultValue={defaults.employeeCount} placeholder="0" className={input} />
          </label>
        </div>
      </Section>

      <Section title="Readiness">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="samRegistered" defaultChecked={defaults.samRegistered} /> Active SAM.gov registration
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hasUei" defaultChecked={defaults.hasUei} /> Have a UEI
        </label>
      </Section>

      <Section title="Contract value range" tag="signal" hint={options.valueThresholds}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Min (USD)
            <input name="valueMin" inputMode="numeric" defaultValue={defaults.valueMin} placeholder="$0" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Max (USD)
            <input name="valueMax" inputMode="numeric" defaultValue={defaults.valueMax} placeholder="no cap" className={input} />
          </label>
        </div>
      </Section>

      <Section title="Contract vehicles" tag="signal" hint="Schedules and IDIQs you hold or can use.">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {options.contractVehicles.map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="contractVehicles" value={v} defaultChecked={defaults.contractVehicles.includes(v)} />
              {v}
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

      <Section title="Notice types" hint="Early-stage notices let you shape the work — they are checked by default.">
        <div className="flex flex-col gap-2">
          {options.noticeTypeOptions.map((n) => (
            <label key={n.value} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="noticeTypes"
                value={n.value}
                defaultChecked={defaults.noticeTypes.includes(n.value)}
                className="mt-1"
              />
              <span>
                {n.label}
                <span className="block text-xs text-zinc-500">{n.help}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Agencies" tag="filter" hint="Optional. One per line or comma separated. Excludes are a hard filter.">
        <label className="flex flex-col gap-1 text-sm">
          Agencies of interest
          <textarea name="agenciesOfInterest" rows={2} defaultValue={defaults.agenciesOfInterest} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Agencies to exclude
          <textarea name="agenciesExcluded" rows={2} defaultValue={defaults.agenciesExcluded} className={input} />
        </label>
      </Section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {pending ? 'Saving…' : 'Save and continue'}
      </button>
    </form>
  );
}
