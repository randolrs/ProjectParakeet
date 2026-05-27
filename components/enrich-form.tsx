'use client';

import { useActionState } from 'react';
import { enrichFromWebsite, type EnrichState } from '@/app/onboarding/actions';

const initial: EnrichState = {};

export function EnrichForm({
  websiteUrl,
  capabilitySummary,
}: {
  websiteUrl: string;
  capabilitySummary: string;
}) {
  const [state, formAction, pending] = useActionState(enrichFromWebsite, initial);

  return (
    <section className="mx-auto w-full max-w-2xl px-8 pt-8">
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Autofill from your website (optional)</h2>
        <p className="text-xs text-zinc-500">
          We read your site to suggest NAICS codes and tailor the next step. You can edit everything below.
        </p>
        <form action={formAction} className="mt-3 flex gap-2">
          <input
            name="websiteUrl"
            type="url"
            placeholder="https://yourcompany.com"
            defaultValue={websiteUrl}
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {pending ? 'Reading…' : 'Autofill'}
          </button>
        </form>
        {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
        {capabilitySummary && (
          <p className="mt-2 text-xs text-zinc-500">From your site: {capabilitySummary}</p>
        )}
      </div>
    </section>
  );
}
