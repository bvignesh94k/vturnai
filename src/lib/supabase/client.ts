"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Browser Supabase client. Uses the anon key only, RLS is what protects data,
 * and no privileged key is ever shipped to the browser.
 */
export function createClient() {
  if (cached) return cached;
  const env = requireSupabasePublicEnv();
  cached = createBrowserClient<Database>(env.url, env.anonKey);
  return cached;
}
