/**
 * Supabase environment resolution.
 *
 * Kept separate so both client and server modules can check configuration
 * without importing the other's runtime, and so the app can render a helpful
 * "not configured" state during first-time setup rather than crashing.
 */

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export function readSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabasePublicEnv(): SupabasePublicEnv {
  const env = readSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  return env;
}

export function isSupabaseConfigured(): boolean {
  return readSupabasePublicEnv() !== null;
}

export function requireServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. It is required for background jobs, webhooks and integration credential access.",
    );
  }
  return key;
}
