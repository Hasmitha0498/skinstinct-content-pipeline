// Server-only Supabase client using the service role key. It is used by API routes and CLI scripts only.
// The app has no client components, so nothing here can end up in a browser bundle, and the key is
// read from a non-NEXT_PUBLIC_ variable, which Next.js never inlines into client code.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnv, requireEnv } from '../config';

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const env = readEnv();
  cached = createClient(requireEnv('SUPABASE_URL', env), requireEnv('SUPABASE_SERVICE_ROLE_KEY', env), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) }) },
  });
  return cached;
}
