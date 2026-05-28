'use client';

import { useActionState } from 'react';
import { runIngestNow, type RunIngestState } from '@/app/dashboard/actions';

const initial: RunIngestState = {};

export function AdminIngestButton() {
  const [state, formAction, pending] = useActionState(runIngestNow, initial);

  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
      <h2 className="font-semibold">Admin</h2>
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
        >
          {pending ? 'Running ingest…' : 'Run ingest now'}
        </button>
      </form>
      {state.error && <p className="text-red-600">{state.error}</p>}
      {state.summary && (
        <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
          {JSON.stringify(state.summary, null, 2)}
        </pre>
      )}
    </section>
  );
}
