'use client';

// Catches uncaught render errors inside /dashboard so a single failure does
// not produce the generic "Application error" overlay (Next's last-resort
// boundary). Most commonly fires when a server action call returns a non-OK
// response and the client useActionState rejects mid-render.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-8 text-sm">
      <h1 className="text-lg font-semibold">Something went wrong on this page.</h1>
      <p className="text-zinc-500">{error.message || 'Unknown error.'}</p>
      {error.digest && (
        <p className="text-xs text-zinc-400">digest: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Reload dashboard
        </a>
      </div>
    </main>
  );
}
