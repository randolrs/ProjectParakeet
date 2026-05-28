import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/auth/actions';
import { AdminIngestButton } from '@/components/admin-ingest-button';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
// Allow the admin-triggered ingest enough time to finish within the action.
export const maxDuration = 60;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: prefs }, { data: bid }] = await Promise.all([
    supabase.from('company_preferences').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('bid_profile').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  const founder = process.env.FOUNDER_EMAIL;
  const isAdmin = !!founder && user.email?.toLowerCase() === founder.toLowerCase();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile saved</h1>
          <p className="text-sm text-zinc-500">{user.email}</p>
        </div>
        <form action={signOut}>
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
            Sign out
          </button>
        </form>
      </header>

      {prefs ? (
        <section className="flex flex-col gap-3 text-sm">
          <p className="text-zinc-500">
            Daily digests begin once opportunity ingest is live (M3).
          </p>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
            <dt className="text-zinc-500">Capabilities</dt>
            <dd>{(prefs.keywords ?? []).join(', ') || '—'}</dd>
            <dt className="text-zinc-500">Certifications</dt>
            <dd>{(prefs.certifications ?? []).join(', ') || '—'}</dd>
            <dt className="text-zinc-500">Primary NAICS</dt>
            <dd className="font-mono">{(prefs.primary_naics ?? []).join(', ') || '—'}</dd>
            <dt className="text-zinc-500">Set-asides</dt>
            <dd>{(prefs.set_aside_types ?? []).join(', ') || '—'}</dd>
            <dt className="text-zinc-500">Value range</dt>
            <dd>
              {prefs.value_min != null || prefs.value_max != null
                ? `${prefs.value_min != null ? '$' + Number(prefs.value_min).toLocaleString() : 'any'} – ${prefs.value_max != null ? '$' + Number(prefs.value_max).toLocaleString() : 'any'}`
                : '—'}
            </dd>
          </dl>
          <Link href="/onboarding" className="underline">
            Edit preferences
          </Link>
        </section>
      ) : (
        <p className="text-sm">
          <Link href="/onboarding" className="underline">
            Finish onboarding
          </Link>{' '}
          to start receiving digests.
        </p>
      )}

      {bid && (
        <section className="flex flex-col gap-2 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
          <h2 className="font-semibold">Your bid/no-bid profile</h2>
          <dl className="grid grid-cols-[12rem_1fr] gap-y-1">
            <dt className="text-zinc-500">Walk-away signals</dt>
            <dd>{(bid.walk_away_signals ?? []).join('; ') || '—'}</dd>
            <dt className="text-zinc-500">Incumbent appetite</dt>
            <dd>{bid.incumbent_displacement_appetite ?? '—'}</dd>
            <dt className="text-zinc-500">Teaming posture</dt>
            <dd>{bid.teaming_posture ?? '—'}</dd>
            <dt className="text-zinc-500">Effort vs. P(win)</dt>
            <dd>{bid.response_effort_tolerance ?? '—'}</dd>
          </dl>
          <Link href="/onboarding/conversation" className="underline">
            Redo the interview
          </Link>
        </section>
      )}

      {isAdmin && <AdminIngestButton />}
    </main>
  );
}
