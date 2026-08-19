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

export interface StartTrialResult {
  subscription: SubscriptionRow;
  razorpaySubscriptionId: string;
  shortUrl: string | null;
  trialEnd: Date;
}

export async function startTrialSubscription(input: StartTrialInput): Promise<StartTrialResult> {
  const supabase = createServiceRoleClient();
  const planCode = input.planCode ?? DEFAULT_PLAN_CODE;

  const { data: config } = await supabase
    .from("plan_configurations")
    .select("*")
    .eq("plan_code", planCode)
    .maybeSingle();

  const trialDays = resolveTrialDays(planCode, config?.trial_days);

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("organization_id", input.organizationId)
    .in("status", ["created", "authenticated", "trialing", "active", "past_due", "paused"])
    .maybeSingle();

  if (existing?.razorpay_subscription_id) {
    // Already has a live subscription; re-verify rather than creating a second.
    const refreshed = await syncSubscriptionFromRazorpay(existing.razorpay_subscription_id);
    return {
      subscription: refreshed ?? existing,
      razorpaySubscriptionId: existing.razorpay_subscription_id,
      shortUrl: existing.short_url,
      trialEnd: existing.trial_end ? new Date(existing.trial_end) : addDays(new Date(), trialDays),
    };
  }

  const razorpay = await createSubscription({
    planCode,
    trialDays,
    notes: { organization_id: input.organizationId, ...(input.notes ?? {}) },
  });

  const trialStart = new Date();
  const trialEnd = razorpay.startAt ?? addDays(trialStart, trialDays);

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        organization_id: input.organizationId,
        plan_code: planCode,
        status: mapRazorpayStatus(razorpay.status, trialEnd),
        razorpay_subscription_id: razorpay.id,
        razorpay_customer_id: razorpay.customerId,
        razorpay_plan_id: razorpay.planId,
        trial_start: trialStart.toISOString(),
        trial_end: trialEnd.toISOString(),
        current_period_start: razorpay.currentStart?.toISOString() ?? trialStart.toISOString(),
        current_period_end: razorpay.currentEnd?.toISOString() ?? trialEnd.toISOString(),
        short_url: razorpay.shortUrl,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: "razorpay_subscription_id" },
    )
    .select("*")
    .single();

  if (error || !subscription) {
    throw new Error(`Could not store subscription: ${error?.message ?? "unknown error"}`);
  }

  await recordBillingEvent({
    organizationId: input.organizationId,
    subscriptionId: subscription.id,
    eventType: "subscription.created",
    providerEventId: `local:created:${razorpay.id}`,
    payload: { razorpaySubscriptionId: razorpay.id, trialEnd: trialEnd.toISOString() },
  });

  return {
    subscription,
    razorpaySubscriptionId: razorpay.id,
    shortUrl: razorpay.shortUrl,
    trialEnd,
  };
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
      body: "Add a payment method to keep running audits and AI visibility scans.",
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
    await notifyOrganization(subscription.organization_id, {
      type: "trial_ending",
      title: "Your trial ends in 2 days",
      body: "Your first payment will be collected when the trial ends. Cancel before then if V Turn AI is not for you.",
      actionUrl: "/app/billing",
    });
  }

  return { expired, warned: (ending ?? []).length };
}
