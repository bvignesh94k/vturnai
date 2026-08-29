import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { appUrl } from "@/lib/config/site";

const log = logger.child("auth-callback");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email confirmation and password-reset callback.
 *
 * Exchanges the one-time code for a session, then sends the user onward. The
 * `next` parameter is only honoured when it is a same-origin path, so the link
 * cannot be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const errorDescription = searchParams.get("error_description");
  const origin = appUrl();

  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;

  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription.slice(0, 200))}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("That link is no longer valid.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    log.warn("Code exchange failed", { message: error.message });
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That link has expired. Please sign in again.")}&resend=true`,
    );
  }

  if (next) return NextResponse.redirect(`${origin}${next}`);

  // Route based on whether onboarding has produced a project yet.
  const { data: projects } = await supabase.from("projects").select("id").limit(1);
  const destination = projects && projects.length > 0 ? "/app" : "/onboarding";
  return NextResponse.redirect(`${origin}${destination}`);
}
