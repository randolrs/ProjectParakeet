import { createBrowserClient } from '@supabase/ssr';

// Browser Supabase client for Client Components. Only the publishable/anon key
// is exposed here — never the service role key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
