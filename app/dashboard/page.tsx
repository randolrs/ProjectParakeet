import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
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
            <dt className="text-zinc-500">Certifications</dt>
            <dd>{(prefs.certifications ?? []).join(', ') || '—'}</dd>
            <dt className="text-zinc-500">Primary NAICS</dt>
            <dd className="font-mono">{(prefs.primary_naics ?? []).join(', ') || '—'}</dd>
            <dt className="text-zinc-500">Role</dt>
            <dd>{prefs.role ?? '—'}</dd>
            <dt className="text-zinc-500">Value band</dt>
            <dd>{prefs.value_band ?? '—'}</dd>
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
    </main>
  );
}
