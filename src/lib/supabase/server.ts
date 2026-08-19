import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";
import { requireSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Server Supabase client bound to the request's cookies.
 *
 * Always use this (never the service-role client) for anything acting on behalf
 * of a signed-in user, so Row Level Security applies to every query.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = requireSupabasePublicEnv();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
