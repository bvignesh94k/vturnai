import "server-only";

import { DEFAULT_PLAN_CODE, PLANS, resolveTrialDays, type PlanCode } from "@/lib/config/plans";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  cancelSubscription,
  createSubscription,
  fetchSubscription,
  mapRazorpayStatus,
  type RazorpaySubscription,
} from "@/lib/billing/razorpay";
import { notifyOrganization } from "@/lib/notifications/service";
import { logger } from "@/lib/logger";
import { isRecord } from "@/lib/utils";
import type { Json, SubscriptionRow, SubscriptionStatus } from "@/lib/db/types";

const log = logger.child("subscriptions");

/**
 * Subscription lifecycle.
 *
 * Every write to `subscriptions` funnels through this module, and every path
 * into it starts from either a verified webhook or a direct fetch from
 * Razorpay's API. There is no code path where a browser can set status.
 */

export interface StartTrialInput {
  organizationId: string;
  planCode?: PlanCode;
  billingEmail?: string | null;
  notes?: Record<string, string>;
}

const LIVE_STATUSES: readonly SubscriptionStatus[] = [
  "created",
  "authenticated",
  "trialing",
  "active",
  "past_due",
  "paused",
];

/** The organization's current subscription row, whatever state it is in. */
async function findLiveSubscription(organizationId: string): Promise<SubscriptionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", LIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function resolveTrialDaysFor(planCode: PlanCode): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data: config } = await supabase
    .from("plan_configurations")
    .select("trial_days")
    .eq("plan_code", planCode)
    .maybeSingle();
  return resolveTrialDays(planCode, config?.trial_days);
}

/**
 * Begin the free trial.
 *
 * Deliberately does not touch Razorpay. A Razorpay subscription registers a
 * payment mandate, and registering a mandate means an authorisation charge:
 * the ₹5 that made an advertised-as-free trial ask for money at signup. A trial
 * costs nothing, so nothing about it needs a payment provider: it is a row with
 * a start and an end, and the entitlement layer already reads status from the
 * database rather than from Razorpay.
 *
 * The card is collected only when someone chooses to pay, in
 * `beginPaidSubscription` below.
 *
 * Idempotent: an organization that already has a live subscription keeps it.
 */
export async function startLocalTrial(input: StartTrialInput): Promise<SubscriptionRow> {
  const supabase = createServiceRoleClient();
  const planCode = input.planCode ?? DEFAULT_PLAN_CODE;

  const existing = await findLiveSubscription(input.organizationId);
  if (existing) return existing;

  const trialDays = await resolveTrialDaysFor(planCode);
  const trialStart = new Date();
  const trialEnd = addDays(trialStart, trialDays);

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .insert({
      organization_id: input.organizationId,
      plan_code: planCode,
      status: "trialing" as SubscriptionStatus,
      trial_start: trialStart.toISOString(),
      trial_end: trialEnd.toISOString(),
      current_period_start: trialStart.toISOString(),
      current_period_end: trialEnd.toISOString(),
      last_verified_at: trialStart.toISOString(),
    })
    .select("*")
    .single();

  if (error || !subscription) {
    throw new Error(`Could not start the trial: ${error?.message ?? "unknown error"}`);
  }

  await recordBillingEvent({
    organizationId: input.organizationId,
    subscriptionId: subscription.id,
    eventType: "trial.started",
    providerEventId: `local:trial:${subscription.id}`,
    payload: { trialEnd: trialEnd.toISOString(), trialDays },
  });

  log.info("Local trial started", {
    organizationId: input.organizationId,
    trialEnd: trialEnd.toISOString(),
  });

  return subscription;
}

export interface BeginPaidSubscriptionResult {
  subscription: SubscriptionRow;
  razorpaySubscriptionId: string;
  shortUrl: string | null;
  /** When the first charge falls due. */
  firstChargeAt: Date;
}

/**
 * Move an organization onto a paid plan.
 *
 * This is the only place a Razorpay subscription is created, and it runs when
 * someone has actively chosen to pay. If they are still inside a free trial the
 * remaining days are preserved: the mandate is registered now, the first charge
 * falls on the original trial end date, so upgrading on day 3 never costs
 * someone the four days they were promised.
 */
export async function beginPaidSubscription(
  input: StartTrialInput,
): Promise<BeginPaidSubscriptionResult> {
  const supabase = createServiceRoleClient();
  const planCode = input.planCode ?? DEFAULT_PLAN_CODE;

  const existing = await findLiveSubscription(input.organizationId);

  if (existing?.razorpay_subscription_id) {
    // Already on a paid mandate; re-verify rather than creating a second.
    const refreshed = await syncSubscriptionFromRazorpay(existing.razorpay_subscription_id);
    const row = refreshed ?? existing;
    return {
      subscription: row,
      razorpaySubscriptionId: existing.razorpay_subscription_id,
      shortUrl: existing.short_url,
      firstChargeAt: toDateOr(row.current_period_end, new Date()),
    };
  }

  // Honour whatever is left of the trial rather than restarting or dropping it.
  const existingTrialEnd = existing?.trial_end ? new Date(existing.trial_end) : null;
  const remainingDays =
    existingTrialEnd && existingTrialEnd.getTime() > Date.now()
      ? (existingTrialEnd.getTime() - Date.now()) / 86_400_000
      : 0;

  const razorpay = await createSubscription({
    planCode,
    trialDays: remainingDays,
    notes: { organization_id: input.organizationId, ...(input.notes ?? {}) },
  });

  const now = new Date();
  const firstChargeAt = razorpay.startAt ?? existingTrialEnd ?? now;

  const patch = {
    organization_id: input.organizationId,
    plan_code: planCode,
    status: mapRazorpayStatus(razorpay.status, existingTrialEnd),
    razorpay_subscription_id: razorpay.id,
    razorpay_customer_id: razorpay.customerId,
    razorpay_plan_id: razorpay.planId,
    // Preserve the original trial window; upgrading does not restart it.
    trial_start: existing?.trial_start ?? now.toISOString(),
    trial_end: existingTrialEnd?.toISOString() ?? null,
    current_period_start: razorpay.currentStart?.toISOString() ?? now.toISOString(),
    current_period_end: razorpay.currentEnd?.toISOString() ?? firstChargeAt.toISOString(),
    short_url: razorpay.shortUrl,
    last_verified_at: now.toISOString(),
  };

  const { data: subscription, error } = existing
    ? await supabase.from("subscriptions").update(patch).eq("id", existing.id).select("*").single()
    : await supabase.from("subscriptions").insert(patch).select("*").single();

  if (error || !subscription) {
    throw new Error(`Could not store subscription: ${error?.message ?? "unknown error"}`);
  }

  await recordBillingEvent({
    organizationId: input.organizationId,
    subscriptionId: subscription.id,
    eventType: "subscription.created",
    providerEventId: `local:created:${razorpay.id}`,
    payload: {
      razorpaySubscriptionId: razorpay.id,
      firstChargeAt: firstChargeAt.toISOString(),
      preservedTrialDays: remainingDays,
    },
  });

  return {
    subscription,
    razorpaySubscriptionId: razorpay.id,
    shortUrl: razorpay.shortUrl,
    firstChargeAt,
  };
}

function toDateOr(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

/**
 * Re-read a subscription from Razorpay and reconcile our copy.
 * This is the authoritative check used by the billing page and by
 * `requireActiveBilling` when a record looks stale.
 */
export async function syncSubscriptionFromRazorpay(
  razorpaySubscriptionId: string,
): Promise<SubscriptionRow | null> {
  const supabase = createServiceRoleClient();

  let remote: RazorpaySubscription;
  try {
    remote = await fetchSubscription(razorpaySubscriptionId);
  } catch (error) {
    log.error("Could not verify subscription with Razorpay", { razorpaySubscriptionId, error });
    return null;
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("razorpay_subscription_id", razorpaySubscriptionId)
    .maybeSingle();

  if (!existing) return null;

  const trialEnd = existing.trial_end ? new Date(existing.trial_end) : null;
  const status = mapRazorpayStatus(remote.status, trialEnd);

  const { data: updated } = await supabase
    .from("subscriptions")
    .update({
      status,
      razorpay_customer_id: remote.customerId ?? existing.razorpay_customer_id,
      current_period_start: remote.currentStart?.toISOString() ?? existing.current_period_start,
      current_period_end: remote.currentEnd?.toISOString() ?? existing.current_period_end,
      ended_at: remote.endedAt?.toISOString() ?? existing.ended_at,
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select("*")
    .maybeSingle();

  return updated ?? existing;
}

export async function cancelOrganizationSubscription(input: {
  organizationId: string;
  atPeriodEnd: boolean;
}): Promise<SubscriptionRow | null> {
  const supabase = createServiceRoleClient();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .in("status", ["created", "authenticated", "trialing", "active", "past_due", "paused"])
    .maybeSingle();

  if (!subscription?.razorpay_subscription_id) return null;

  const remote = await cancelSubscription({
    subscriptionId: subscription.razorpay_subscription_id,
    atCycleEnd: input.atPeriodEnd,
  });

  const { data: updated } = await supabase
    .from("subscriptions")
    .update({
      status: input.atPeriodEnd ? subscription.status : "cancelled",
      cancel_at_period_end: input.atPeriodEnd,
      cancelled_at: input.atPeriodEnd ? null : new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", subscription.id)
    .select("*")
    .maybeSingle();

  await recordBillingEvent({
    organizationId: input.organizationId,
    subscriptionId: subscription.id,
    eventType: input.atPeriodEnd ? "subscription.cancel_scheduled" : "subscription.cancelled",
    providerEventId: `local:cancel:${remote.id}:${Date.now()}`,
    payload: { atPeriodEnd: input.atPeriodEnd },
  });

  await notifyOrganization(input.organizationId, {
    type: "trial_ending",
    title: input.atPeriodEnd ? "Subscription will end at the period end" : "Subscription cancelled",
    body: input.atPeriodEnd
      ? "Your plan stays active until the end of the current billing period. You can resume any time before then."
      : "Your subscription has been cancelled. Scans and audits are paused until you resubscribe.",
    actionUrl: "/app/billing",
  });

  return updated ?? subscription;
}

export interface WebhookHandlingResult {
  handled: boolean;
  duplicate: boolean;
  eventType: string;
}

/**
 * Apply a verified Razorpay webhook.
 *
 * Idempotent by construction: `billing_events.provider_event_id` is unique, so
 * a replayed delivery is detected and discarded before any state changes.
 */
export async function applyRazorpayWebhook(input: {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<WebhookHandlingResult> {
  const supabase = createServiceRoleClient();

  const subscriptionEntity = readEntity(input.payload, "subscription");
  const paymentEntity = readEntity(input.payload, "payment");

  const razorpaySubscriptionId =
    (subscriptionEntity && typeof subscriptionEntity["id"] === "string" ? subscriptionEntity["id"] : null) ??
    (paymentEntity && typeof paymentEntity["subscription_id"] === "string"
      ? paymentEntity["subscription_id"]
      : null);

  const { data: subscription } = razorpaySubscriptionId
    ? await supabase
        .from("subscriptions")
        .select("*")
        .eq("razorpay_subscription_id", razorpaySubscriptionId)
        .maybeSingle()
    : { data: null };

  // Record first: the unique constraint is what makes replays safe.
  const { error: eventError } = await supabase.from("billing_events").insert({
    organization_id: subscription?.organization_id ?? null,
    subscription_id: subscription?.id ?? null,
    event_type: input.eventType,
    provider_event_id: input.eventId,
    amount_minor:
      paymentEntity && typeof paymentEntity["amount"] === "number" ? paymentEntity["amount"] : null,
    currency:
      paymentEntity && typeof paymentEntity["currency"] === "string" ? paymentEntity["currency"] : null,
    status: paymentEntity && typeof paymentEntity["status"] === "string" ? paymentEntity["status"] : null,
    payload: input.payload as Json,
  });

  if (eventError) {
    if (eventError.code === "23505") {
      return { handled: false, duplicate: true, eventType: input.eventType };
    }
    log.error("Failed to record billing event", { eventId: input.eventId, error: eventError });
  }

  if (!subscription || !razorpaySubscriptionId) {
    return { handled: false, duplicate: false, eventType: input.eventType };
  }

  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end) : null;
  const update: Partial<SubscriptionRow> = { last_verified_at: new Date().toISOString() };

  switch (input.eventType) {
    case "subscription.authenticated": {
      update.status = mapRazorpayStatus("authenticated", trialEnd);
      break;
    }
    case "subscription.activated":
    case "subscription.charged": {
      update.status = "active";
      if (subscriptionEntity) {
        const start = numberToDate(subscriptionEntity["current_start"]);
        const end = numberToDate(subscriptionEntity["current_end"]);
        if (start) update.current_period_start = start.toISOString();
        if (end) update.current_period_end = end.toISOString();
      }
      await notifyOrganization(subscription.organization_id, {
        type: "payment_failed",
        title: "Payment received",
        body: `Your ${PLANS[(subscription.plan_code as PlanCode) ?? "pro"].name} subscription is active.`,
        actionUrl: "/app/billing",
      });
      break;
    }
    case "subscription.pending":
    case "payment.failed": {
      update.status = "past_due";
      await notifyOrganization(subscription.organization_id, {
        type: "payment_failed",
        title: "Payment failed",
        body: "We could not collect your subscription payment. Update your payment method to keep your scans running.",
        actionUrl: "/app/billing",
      });
      break;
    }
    case "subscription.halted": {
      update.status = "halted";
      await notifyOrganization(subscription.organization_id, {
        type: "payment_failed",
        title: "Subscription halted",
        body: "Repeated payment failures have halted your subscription. Update your payment method to resume.",
        actionUrl: "/app/billing",
      });
      break;
    }
    case "subscription.paused": {
      update.status = "paused";
      break;
    }
    case "subscription.resumed": {
      update.status = "active";
      break;
    }
    case "subscription.cancelled": {
      update.status = "cancelled";
      update.cancelled_at = new Date().toISOString();
      break;
    }
    case "subscription.completed":
    case "subscription.expired": {
      update.status = "expired";
      update.ended_at = new Date().toISOString();
      break;
    }
    default: {
      return { handled: false, duplicate: false, eventType: input.eventType };
    }
  }

  await supabase.from("subscriptions").update(update).eq("id", subscription.id);
  return { handled: true, duplicate: false, eventType: input.eventType };
}

function readEntity(payload: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const container = payload["payload"];
  if (!isRecord(container)) return null;
  const wrapper = container[key];
  if (!isRecord(wrapper)) return null;
  const entity = wrapper["entity"];
  return isRecord(entity) ? entity : null;
}

function numberToDate(value: unknown): Date | null {
  return typeof value === "number" && value > 0 ? new Date(value * 1000) : null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

async function recordBillingEvent(input: {
  organizationId: string;
  subscriptionId: string;
  eventType: string;
  providerEventId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("billing_events").insert({
    organization_id: input.organizationId,
    subscription_id: input.subscriptionId,
    event_type: input.eventType,
    provider_event_id: input.providerEventId,
    payload: input.payload as Json,
  });
  if (error && error.code !== "23505") {
    log.warn("Could not record billing event", { eventType: input.eventType, error });
  }
}

/** Expire trials that have run out. Called from the daily cron. */
export async function expireLapsedTrials(): Promise<{ expired: number; warned: number }> {
  const supabase = createServiceRoleClient();
  const now = new Date();

  const { data: trialing } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("status", "trialing")
    .lte("trial_end", now.toISOString());

  let expired = 0;
  for (const subscription of trialing ?? []) {
    // Confirm with Razorpay before downgrading: the first charge may have gone
    // through moments ago and our copy simply has not caught up.
    const synced = subscription.razorpay_subscription_id
      ? await syncSubscriptionFromRazorpay(subscription.razorpay_subscription_id)
      : null;

    if (synced && (synced.status === "active" || synced.status === "authenticated")) continue;

    await supabase
      .from("subscriptions")
      .update({ status: "expired" as SubscriptionStatus, ended_at: now.toISOString() })
      .eq("id", subscription.id);

    await notifyOrganization(subscription.organization_id, {
      type: "trial_ending",
      title: "Your free trial has ended",
      body: "Your projects, crawls and reports are safe. Upgrade to continue monitoring your visibility.",
      actionUrl: "/app/billing",
    });
    expired += 1;
  }

  // Warn two days before the trial ends.
  const warnFrom = new Date(now.getTime() + 47 * 3_600_000);
  const warnTo = new Date(now.getTime() + 49 * 3_600_000);
  const { data: ending } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("status", "trialing")
    .gte("trial_end", warnFrom.toISOString())
    .lte("trial_end", warnTo.toISOString());

  for (const subscription of ending ?? []) {
    // Someone still on a free trial has given us no payment method, so telling
    // them a payment is about to be collected would be false. Only an account
    // that has actually authorised a mandate gets that warning.
    const hasMandate = Boolean(subscription.razorpay_subscription_id);
    await notifyOrganization(subscription.organization_id, {
      type: "trial_ending",
      title: "Your trial ends in 2 days",
      body: hasMandate
        ? "Your first payment will be collected when the trial ends. Cancel before then if V Turn AI is not for you."
        : "No payment has been taken. Upgrade before it ends to keep your audits, prompts and reports running.",
      actionUrl: "/app/billing",
    });
  }

  return { expired, warned: (ending ?? []).length };
}
