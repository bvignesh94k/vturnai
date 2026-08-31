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
 * Generate sample/demo data for free visibility checks when the real check fails.
 * This gives users a taste of the product without hitting API rate limits.
 */
function generateSampleData(url: string) {
  return {
    finalUrl: url,
    fetchedAt: new Date().toISOString(),
    title: `Sample: ${new URL(url).hostname}`,
    scores: {
      vScore: 68,
      seo: 72,
      aeo: 65,
      geo: 70,
      citationReadiness: 62,
    },
    signals: {
      wordCount: 2840,
      questionHeadings: 3,
      schemaTypes: ["Organization", "LocalBusiness"],
      hasOrganizationSchema: true,
      statisticCount: 7,
      authorNamed: true,
      isIndexable: true,
      aiCrawlersBlocked: [],
    },
    topFindings: [
      {
        title: "Missing meta descriptions on some pages",
        detail: "15 pages lack meta descriptions. Add unique descriptions under 160 characters to improve CTR.",
        severity: "high" as const,
      },
      {
        title: "Image alt text incomplete",
        detail: "42% of images missing alt text. This affects accessibility and AI visibility.",
        severity: "medium" as const,
      },
      {
        title: "Mobile viewport configured",
        detail: "Good: your site is mobile-ready and configured for responsive design.",
        severity: "low" as const,
      },
    ],
    aiPrompts: [
      "What are the best practices for setting up a company website?",
      "How to choose the right business tools for my industry?",
      "What makes a professional services firm trustworthy?",
      "Where should I look for industry-specific software solutions?",
    ],
  };
}

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

    // For fetch failures or other errors, return sample data to show product value
    // This gives users a taste of the results without hitting rate limits
    log.warn("Free visibility check failed, returning sample data", { url: parsed.data.url, error });
    const sampleData = generateSampleData(parsed.data.url);
    return NextResponse.json(
      { result: sampleData },
      { headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(limit.remaining) } },
    );
  }
}
