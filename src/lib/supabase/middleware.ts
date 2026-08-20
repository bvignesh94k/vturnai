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

  /**
   * Only bounce a signed-in visitor away from the auth pages once their profile
   * row genuinely exists.
   *
   * A valid JWT is not the same thing as a usable account: the row is created by
   * a trigger on `auth.users`, so between sign-up and that row landing — or if
   * the schema was never migrated — a user holds a good token with nothing
   * behind it. The page guards treat that state as signed out and send the
   * visitor to /login. If this redirect trusted the token alone it would send
   * them straight back, and the two would volley until the browser gave up with
   * ERR_TOO_MANY_REDIRECTS. Agreeing on one definition of "signed in" is what
   * makes that loop unrepresentable.
   */
  if (user && AUTH_ROUTES.includes(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/app";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}
