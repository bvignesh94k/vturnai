import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { PLANS, type PlanCode } from "@/lib/config/plans";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * Razorpay Subscriptions.
 *
 * Two rules govern everything here:
 *   1. Secrets stay on the server. Only the publishable key id reaches the
 *      browser, and only so the checkout widget can open.
 *   2. Subscription state is only ever written from a signature-verified
 *      webhook or a direct server-to-server fetch. A value posted by a browser
 *      is treated as a hint to re-verify, never as a fact.
 */

const log = logger.child("razorpay");
const API_BASE = "https://api.razorpay.com/v1";

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
}

function authHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function callRazorpay(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const description =
      isRecord(payload) && isRecord(payload["error"]) && typeof payload["error"]["description"] === "string"
        ? payload["error"]["description"]
        : `HTTP ${response.status}`;
    throw new Error(`Razorpay request failed: ${description}`);
  }

  if (!isRecord(payload)) throw new Error("Razorpay returned an unexpected response.");
  return payload;
}

export interface RazorpaySubscription {
  id: string;
  planId: string;
  status: string;
  customerId: string | null;
  currentStart: Date | null;
  currentEnd: Date | null;
  chargeAt: Date | null;
  startAt: Date | null;
  endedAt: Date | null;
  shortUrl: string | null;
  totalCount: number;
}

function toDate(value: unknown): Date | null {
  return typeof value === "number" && value > 0 ? new Date(value * 1000) : null;
}

function parseSubscription(payload: Record<string, unknown>): RazorpaySubscription {
  return {
    id: typeof payload["id"] === "string" ? payload["id"] : "",
    planId: typeof payload["plan_id"] === "string" ? payload["plan_id"] : "",
    status: typeof payload["status"] === "string" ? payload["status"] : "created",
    customerId: typeof payload["customer_id"] === "string" ? payload["customer_id"] : null,
    currentStart: toDate(payload["current_start"]),
    currentEnd: toDate(payload["current_end"]),
    chargeAt: toDate(payload["charge_at"]),
    startAt: toDate(payload["start_at"]),
    endedAt: toDate(payload["ended_at"]),
    shortUrl: typeof payload["short_url"] === "string" ? payload["short_url"] : null,
    totalCount: typeof payload["total_count"] === "number" ? payload["total_count"] : 0,
  };
}

/** Resolve the Razorpay plan id for a plan code, preferring the admin config. */
export async function resolveRazorpayPlanId(planCode: PlanCode): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("plan_configurations")
    .select("razorpay_plan_id")
    .eq("plan_code", planCode)
    .maybeSingle();

  const configured = data?.razorpay_plan_id?.trim() || process.env.RAZORPAY_PRO_PLAN_ID?.trim();
  if (!configured) {
    throw new Error(
      `No Razorpay plan is configured for "${planCode}". Create the plan in Razorpay and set RAZORPAY_PRO_PLAN_ID, or configure it under /admin.`,
    );
  }
  return configured;
}

/**
 * Create a subscription with a 7-day free trial.
 *
 * The trial is implemented as `start_at` in the future: Razorpay registers the
 * payment mandate now and takes the first payment when the trial ends, which is
 * how a card-on-file trial is expressed in the Subscriptions API.
 */
export async function createSubscription(input: {
  planCode: PlanCode;
  trialDays: number;
  notes?: Record<string, string>;
  customerNotify?: boolean;
}): Promise<RazorpaySubscription> {
  const planId = await resolveRazorpayPlanId(input.planCode);
  const trialSeconds = Math.max(0, Math.floor(input.trialDays)) * 86_400;
  const startAt = Math.floor(Date.now() / 1000) + trialSeconds;

  const payload = await callRazorpay({
    path: "/subscriptions",
    method: "POST",
    body: {
      plan_id: planId,
      // 120 monthly cycles ≈ 10 years; Razorpay requires a finite count.
      total_count: 120,
      quantity: 1,
      customer_notify: input.customerNotify ?? true,
      ...(trialSeconds > 0 ? { start_at: startAt } : {}),
      notes: input.notes ?? {},
    },
  });

  return parseSubscription(payload);
}

export async function fetchSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  const payload = await callRazorpay({ path: `/subscriptions/${encodeURIComponent(subscriptionId)}` });
  return parseSubscription(payload);
}

export async function cancelSubscription(input: {
  subscriptionId: string;
  atCycleEnd: boolean;
}): Promise<RazorpaySubscription> {
  const payload = await callRazorpay({
    path: `/subscriptions/${encodeURIComponent(input.subscriptionId)}/cancel`,
    method: "POST",
    body: { cancel_at_cycle_end: input.atCycleEnd ? 1 : 0 },
  });
  return parseSubscription(payload);
}

/**
 * Verify a Razorpay webhook signature.
 *
 * HMAC-SHA256 over the raw request body with the webhook secret, compared in
 * constant time. The raw body must be used exactly as received, re-serialising
 * parsed JSON changes the bytes and invalidates the signature.
 */
export function verifyWebhookSignature(input: {
  rawBody: string;
  signature: string;
  secret?: string;
}): boolean {
  const secret = input.secret ?? process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    log.error("RAZORPAY_WEBHOOK_SECRET is not set; rejecting webhook");
    return false;
  }
  if (!input.signature) return false;

  const expected = createHmac("sha256", secret).update(input.rawBody, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(input.signature, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Verify the signature returned by Checkout after a subscription payment.
 * Signed as HMAC-SHA256(payment_id + "|" + subscription_id) with the key secret.
 */
export function verifySubscriptionPaymentSignature(input: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keySecret || !input.razorpaySignature) return false;

  const expected = createHmac("sha256", keySecret)
    .update(`${input.razorpayPaymentId}|${input.razorpaySubscriptionId}`, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(input.razorpaySignature, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/** Map a Razorpay subscription status onto ours. */
export function mapRazorpayStatus(
  status: string,
  trialEnd: Date | null,
): "created" | "authenticated" | "trialing" | "active" | "past_due" | "halted" | "paused" | "cancelled" | "expired" {
  const now = Date.now();
  switch (status) {
    case "created":
      return "created";
    case "authenticated":
      // A mandate is registered but the first charge has not happened yet -
      // that is exactly what an active free trial looks like.
      return trialEnd && trialEnd.getTime() > now ? "trialing" : "authenticated";
    case "active":
      return "active";
    case "pending":
      return "past_due";
    case "halted":
      return "halted";
    case "paused":
      return "paused";
    case "cancelled":
      return "cancelled";
    case "completed":
    case "expired":
      return "expired";
    default:
      return "created";
  }
}

export const RAZORPAY_PLAN_PRICE_MINOR = PLANS.pro.priceMinor;
