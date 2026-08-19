import { NextResponse, type NextRequest } from "next/server";
import { runQuickCheck } from "@/lib/analysis/quick-check";
import { publicVisibilityCheckSchema } from "@/lib/validation/schemas";
import { RATE_LIMITS, clientIpFromHeaders, consumeRateLimit } from "@/lib/security/rate-limit";
import { BlockedRequestError } from "@/lib/security/ssrf";
import { FetchFailedError } from "@/lib/crawler/fetcher";
import { logger, errorMessage } from "@/lib/logger";

const log = logger.child("public-visibility-check");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public "Run Free Visibility Check" endpoint.
 *
 * Unauthenticated, so it is the most exposed surface in the product. It is
 * rate-limited per IP, validated with Zod, SSRF-guarded inside `safeFetch`, and
 * only ever fetches one page.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const limit = await consumeRateLimit(RATE_LIMITS.freeVisibilityCheck, ip);

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Too many checks from this network. Try again shortly, or start a free trial for unlimited scans.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body containing a url." }, { status: 400 });
  }

  const parsed = publicVisibilityCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a valid website address." },
      { status: 400 },
    );
  }

  try {
    const result = await runQuickCheck(parsed.data.url);
    return NextResponse.json(
      { result },
      { headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(limit.remaining) } },
    );
  } catch (error) {
    if (error instanceof BlockedRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof FetchFailedError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    log.warn("Free visibility check failed", { url: parsed.data.url, error });
    return NextResponse.json(
      { error: errorMessage(error) || "That site could not be analysed." },
      { status: 502 },
    );
  }
}
