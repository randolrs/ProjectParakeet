import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Request-scoped Supabase client for Server Components, Server Actions, and
// route handlers. Queries run as the signed-in user, so RLS is enforced.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session cookie instead.
          }
        },
      },
    },
  );
}
