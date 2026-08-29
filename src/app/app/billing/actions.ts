"use server";

import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/session";
import { isRazorpayConfigured, verifySubscriptionPaymentSignature } from "@/lib/billing/razorpay";
import {
  beginPaidSubscription,
  cancelOrganizationSubscription,
  startLocalTrial,
  syncSubscriptionFromRazorpay,
} from "@/lib/billing/subscription-service";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { cancelSubscriptionSchema, verifyCheckoutSchema } from "@/lib/validation/schemas";
import { errorMessage, logger } from "@/lib/logger";
import type { ActionResult } from "@/app/app/actions";

const log = logger.child("billing-actions");

/**
 * Billing actions.
 *
 * Only owners and admins may change billing. Every path that could change
 * subscription state either calls Razorpay directly or verifies a signature -
 * a value posted by the browser is never accepted as proof of payment.
 */
async function requireBillingAdmin() {
  const context = await requireUserContext();
  if (!["owner", "admin"].includes(context.activeRole)) {
    throw new Error("Only workspace owners and admins can manage billing.");
  }
  return context;
}

export interface StartSubscriptionResult extends ActionResult {
  subscriptionId?: string;
  keyId?: string;
  shortUrl?: string | null;
  /** ISO date of the first charge, so the UI can state it before checkout. */
  firstChargeAt?: string;
}

/**
 * Upgrade to a paid plan.
 *
 * This is the first point at which a card is requested. Anyone still inside a
 * free trial keeps the days they have left: the mandate registers now and the
 * first charge falls on the original trial end date.
 */

/**
 * Start the free trial from the billing page.
 *
 * Reachable only for the organisation with no subscription row at all, which
 * should be rare: onboarding already starts the trial for every new project.
 * The rare paths that land here (a trial that failed to create silently, an
 * older account) must not be routed into startSubscriptionAction, which talks
 * to Razorpay and would show the same checkout as a real upgrade. A button
 * labelled "free trial" must never send anyone toward a payment screen.
 */
export async function startFreeTrialAction(): Promise<ActionResult> {
  try {
    const context = await requireBillingAdmin();
    await startLocalTrial({
      organizationId: context.activeOrganization.id,
      billingEmail: context.activeOrganization.billing_email,
    });
    revalidatePath("/app/billing");
    return { ok: true, message: "Your free trial has started. No payment was taken." };
  } catch (error) {
    log.error("Could not start free trial from billing page", { error });
    return { ok: false, error: errorMessage(error) };
  }
}

export async function startSubscriptionAction(): Promise<StartSubscriptionResult> {
  try {
    const context = await requireBillingAdmin();

    if (!isRazorpayConfigured()) {
      return {
        ok: false,
        error: "Billing is not configured on this deployment. Set the Razorpay keys to enable it.",
      };
    }

    const result = await beginPaidSubscription({
      organizationId: context.activeOrganization.id,
      billingEmail: context.activeOrganization.billing_email,
    });

    revalidatePath("/app/billing");
    return {
      ok: true,
      subscriptionId: result.razorpaySubscriptionId,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() ?? "",
      shortUrl: result.shortUrl,
      firstChargeAt: result.firstChargeAt.toISOString(),
      message: "Complete checkout to activate your subscription.",
    };
  } catch (error) {
    log.error("Could not start subscription", { error });
    return { ok: false, error: errorMessage(error) };
  }
}

/**
 * Verify a completed Checkout handshake.
 *
 * The signature proves the payment came from Razorpay, but we still re-fetch
 * the subscription from their API before writing status, the signature only
 * proves authenticity, not the current state.
 */
export async function verifyCheckoutAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireBillingAdmin();

    const parsed = verifyCheckoutSchema.parse({
      razorpayPaymentId: formData.get("razorpay_payment_id"),
      razorpaySubscriptionId: formData.get("razorpay_subscription_id"),
      razorpaySignature: formData.get("razorpay_signature"),
    });

    if (!verifySubscriptionPaymentSignature(parsed)) {
      log.warn("Checkout signature verification failed", {
        subscriptionId: parsed.razorpaySubscriptionId,
      });
      return { ok: false, error: "That payment could not be verified. Please contact support." };
    }

    await syncSubscriptionFromRazorpay(parsed.razorpaySubscriptionId);

    revalidatePath("/app/billing");
    revalidatePath("/app");
    return { ok: true, message: "Payment verified. Your subscription is active." };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function refreshSubscriptionAction(): Promise<ActionResult> {
  try {
    const context = await requireBillingAdmin();
    const admin = createServiceRoleClient();

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("razorpay_subscription_id")
      .eq("organization_id", context.activeOrganization.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription?.razorpay_subscription_id) {
      return { ok: false, error: "There is no subscription to refresh." };
    }

    await syncSubscriptionFromRazorpay(subscription.razorpay_subscription_id);
    revalidatePath("/app/billing");
    return { ok: true, message: "Subscription status refreshed from Razorpay." };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function cancelSubscriptionAction(formData: FormData): Promise<ActionResult> {
  try {
    const context = await requireBillingAdmin();
    const parsed = cancelSubscriptionSchema.parse({
      atPeriodEnd: formData.get("atPeriodEnd") !== "false",
    });

    const result = await cancelOrganizationSubscription({
      organizationId: context.activeOrganization.id,
      atPeriodEnd: parsed.atPeriodEnd,
    });

    if (!result) return { ok: false, error: "There is no active subscription to cancel." };

    revalidatePath("/app/billing");
    return {
      ok: true,
      message: parsed.atPeriodEnd
        ? "Your plan will end at the end of the current period."
        : "Your subscription has been cancelled.",
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
