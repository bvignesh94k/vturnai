import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";
import { readSupabasePublicEnv } from "@/lib/supabase/env";

const PROTECTED_PREFIXES = ["/app", "/onboarding", "/admin"];
const AUTH_ROUTES = ["/login", "/signup"];

/**
 * Refresh the Supabase session on every request and gate protected routes.
 *
 * `getUser()` is used rather than `getSession()` because it validates the JWT
 * against the auth server; a session cookie alone is not proof of identity.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = readSupabasePublicEnv();
  if (!env) return response;

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(redirectUrl);
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/app";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
