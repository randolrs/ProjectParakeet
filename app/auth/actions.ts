'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const credsSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type AuthState = { error?: string; message?: string };

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };
  redirect('/onboarding');
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: error.message };

  // Session present => email confirmation is disabled; proceed straight in.
  if (data.session) redirect('/onboarding');
  return { message: 'Check your email to confirm your account, then sign in.' };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
