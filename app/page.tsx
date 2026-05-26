import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        [PRODUCT_NAME]
      </h1>
      <p className="max-w-md text-base text-zinc-500 dark:text-zinc-400">
        A personalized AI morning digest for government contractors.
      </p>
      <div className="flex gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
