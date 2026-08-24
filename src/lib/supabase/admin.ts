import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { requireServiceRoleKey, requireSupabasePublicEnv } from "@/lib/supabase/env";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Service-role Supabase client. Bypasses Row Level Security.
 *
 * Only background jobs, verified webhooks and integration credential access may
 * use this. Every call site must have already established which organization or
 * project the caller is entitled to, RLS is not there to catch mistakes here.
 */
export function createServiceRoleClient() {
  if (cached) return cached;
  const env = requireSupabasePublicEnv();
  cached = createClient<Database>(env.url, requireServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "x-vturnai-client": "service-role" } },
  });
  return cached;
}
