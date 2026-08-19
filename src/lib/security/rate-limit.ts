/**
 * Rate limiting for expensive operations.
 *
 * Backed by the `rate_limit_counters` table so limits hold across serverless
 * instances. An in-process fallback keeps development usable when the database
 * is unreachable, but production correctness comes from the database.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";

export interface RateLimitRule {
  /** Stable identifier, e.g. "ai_scan" or "crawl_start". */
  key: string;
  /** Maximum number of operations allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  aiScan: { key: "ai_scan", limit: 4, windowSeconds: 3600 },
  crawlStart: { key: "crawl_start", limit: 6, windowSeconds: 3600 },
  pagespeed: { key: "pagespeed", limit: 20, windowSeconds: 3600 },
  contentAnalysis: { key: "content_analysis", limit: 30, windowSeconds: 3600 },
  reportGeneration: { key: "report_generation", limit: 10, windowSeconds: 3600 },
  freeVisibilityCheck: { key: "free_visibility_check", limit: 5, windowSeconds: 3600 },
  authAction: { key: "auth_action", limit: 12, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

function windowStart(windowSeconds: number, now = Date.now()): Date {
  const bucket = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  return new Date(bucket);
}

function consumeInMemory(bucketKey: string, rule: RateLimitRule, now: number): RateLimitResult {
  const start = windowStart(rule.windowSeconds, now).getTime();
  const expiresAt = start + rule.windowSeconds * 1000;
  const existing = memoryCounters.get(bucketKey);
  const count = existing && existing.expiresAt === expiresAt ? existing.count + 1 : 1;
  memoryCounters.set(bucketKey, { count, expiresAt });

  // Opportunistic cleanup so the map cannot grow without bound.
  if (memoryCounters.size > 5000) {
    for (const [key, value] of memoryCounters) {
      if (value.expiresAt <= now) memoryCounters.delete(key);
    }
  }

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    limit: rule.limit,
    resetAt: new Date(expiresAt),
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
  };
}

/**
 * Consume one unit against a rule for a subject (user id, project id or IP).
 * Fails open on infrastructure errors — a rate limiter outage must not take the
 * product down — but the in-memory counter still applies within the instance.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const bucketKey = `${rule.key}:${subject}`;
  const memoryResult = consumeInMemory(bucketKey, rule, now);

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_bucket: rule.key,
      p_subject: subject,
      p_window_start: windowStart(rule.windowSeconds, now).toISOString(),
      p_window_seconds: rule.windowSeconds,
    });
    if (error) return memoryResult;
    const count = typeof data === "number" ? data : memoryResult.limit - memoryResult.remaining;
    const expiresAt = windowStart(rule.windowSeconds, now).getTime() + rule.windowSeconds * 1000;
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      limit: rule.limit,
      resetAt: new Date(expiresAt),
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
    };
  } catch {
    return memoryResult;
  }
}

/** Best-effort client IP for anonymous rate limiting. */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}

/** Reset the in-process counters. Test helper only. */
export function __resetInMemoryRateLimits(): void {
  memoryCounters.clear();
}
