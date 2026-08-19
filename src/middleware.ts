import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image optimisation output. Webhook and
     * cron routes are excluded because they authenticate with their own secrets,
     * not a user session.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
