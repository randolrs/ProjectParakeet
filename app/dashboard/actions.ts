'use server';

import { redirect } from 'next/navigation';
import { DrizzleIngestStore, runIngest, type IngestSummary } from '@/lib/opportunities/ingest';
import { createClient } from '@/lib/supabase/server';

export type RunIngestState = { ok?: boolean; summary?: IngestSummary; error?: string };

// Admin-only manual ingest trigger. Gated by the FOUNDER_EMAIL env var so it
// can never be invoked by other signed-in users. Logs are structured so the
// run is greppable in Vercel runtime logs.
export async function runIngestNow(
  _prev: RunIngestState,
  _formData: FormData,
): Promise<RunIngestState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const founder = process.env.FOUNDER_EMAIL;
  if (!founder || user.email?.toLowerCase() !== founder.toLowerCase()) {
    return { ok: false, error: 'Admin only.' };
  }

  try {
    const summary = await runIngest({ store: new DrizzleIngestStore() });
    console.log(
      JSON.stringify({
        level: 'info',
        ts: new Date().toISOString(),
        event: 'ingest_run_manual',
        triggeredBy: user.email,
        ...summary,
      }),
    );
    return { ok: true, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: 'error',
        ts: new Date().toISOString(),
        event: 'ingest_failed_manual',
        triggeredBy: user.email,
        error: message,
      }),
    );
    return { ok: false, error: message };
  }
}
