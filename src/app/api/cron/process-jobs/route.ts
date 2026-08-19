import { NextResponse, type NextRequest } from "next/server";
import { runJobs } from "@/lib/jobs/runner";
import { safeEqual } from "@/lib/security/encryption";
import { logger } from "@/lib/logger";

const log = logger.child("cron-process-jobs");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job queue worker, invoked on a schedule.
 *
 * Authenticated with CRON_SECRET, compared in constant time. Vercel Cron sends
 * the secret as a Bearer token; the same endpoint can be called by any external
 * scheduler with the same header.
 */
function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    log.error("CRON_SECRET is not configured; refusing to run jobs");
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer && safeEqual(bearer, secret)) return true;

  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  return Boolean(headerSecret) && safeEqual(headerSecret, secret);
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const result = await runJobs({ limit: 4, budgetMs: 50_000 });
  log.info("Cron job batch complete", { ...result });

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export const POST = GET;
