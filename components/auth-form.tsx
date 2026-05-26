'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, signUp, type AuthState } from '@/app/auth/actions';

const initial: AuthState = {};

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === 'signin' ? 'Sign in' : 'Create your account'}
      </h1>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.message && <p className="text-sm text-emerald-600">{state.message}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {pending ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-zinc-500">
        {mode === 'signin' ? (
          <>
            No account?{' '}
            <Link href="/signup" className="underline">
              Create one
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
