import "server-only";

import {
  DEFAULT_PLAN_CODE,
  PLANS,
  resolvePlanFeatures,
  resolvePlanLimits,
  resolvePlanPriceMinor,
  resolveTrialDays,
  type PlanCode,
  type PlanFeatures,
  type PlanLimits,
} from "@/lib/config/plans";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import type { SubscriptionRow, SubscriptionStatus } from "@/lib/db/types";

/**
 * Billing entitlements.
 *
 * Everything that decides whether a user may spend money, start a scan, crawl
 * pages, call a provider, resolves through this module, on the server, from
 * the database. The browser's opinion of subscription status is never consulted.
 */

export interface Entitlements {
  organizationId: string;
  planCode: PlanCode;
  planName: string;
  priceMinor: number;
  currency: string;
  trialDays: number;
  status: SubscriptionStatus | "none";
  /** True when the account may use paid features right now. */
  isActive: boolean;
  isTrialing: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  daysRemainingInTrial: number | null;
  cancelAtPeriodEnd: boolean;
  limits: PlanLimits;
  features: PlanFeatures;
  subscription: SubscriptionRow | null;
  /** Reason shown to the user when `isActive` is false. */
  blockedReason?: string;
}

const ACTIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "trialing",
  "active",
  "authenticated",
]);

const BLOCKED_REASONS: Partial<Record<SubscriptionStatus | "none", string>> = {
  none: "Start your 7-day free trial to run scans and audits.",
  created: "Your subscription has not been authorised yet. Complete checkout to begin your trial.",
  past_due: "Your last payment failed. Update your payment method to restore access.",
  halted: "Your subscription is halted after repeated failed payments. Update your payment method to resume.",
  paused: "Your subscription is paused. Resume it to continue running scans.",
  cancelled: "Your subscription was cancelled. Resubscribe to continue.",
  expired: "Your subscription has expired. Resubscribe to continue.",
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function planCodeOf(value: string | null | undefined): PlanCode {
  return value && value in PLANS ? (value as PlanCode) : DEFAULT_PLAN_CODE;
}

/**
 * Resolve entitlements for an organization.
 *
 * Uses the service-role client deliberately: entitlement checks run inside job
 * workers and webhook handlers where there is no user session. The caller is
 * responsible for having established that the organization is the right one.
 */
export async function getEntitlements(organizationId: string): Promise<Entitlements> {
  const supabase = createServiceRoleClient();

  /**
   * An organisation owned by a platform admin is never gated.
   *
   * Platform admins operate the product: they need every feature reachable to
   * support customers and to see what a paying account sees, and blocking the
   * operator's own dashboard behind a lapsed trial helps nobody. Resolved here
   * rather than at each call site because every limit, quota and billing check
   * in the product funnels through this one function, including the ones that
   * run inside background jobs where there is no session to inspect.
   *
   * Deliberately keyed on membership rather than on a hardcoded address, so
   * promoting or demoting an operator is a `platform_role` change and nothing
   * else. `is_platform_admin` is the same predicate the database's own RLS
   * policies use, so UI access and data access cannot drift apart.
   */
  if (await isPlatformAdminOrganization(organizationId)) {
    return buildUnlimitedEntitlements(organizationId);
  }

  const [{ data: subscription }, { data: planConfigs }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("plan_configurations").select("*").eq("is_active", true),
  ]);

  const planCode = planCodeOf(subscription?.plan_code);
  const config = (planConfigs ?? []).find((entry) => entry.plan_code === planCode) ?? null;

  const limits = resolvePlanLimits(planCode, isRecord(config?.limits) ? config.limits : null);
  const features = resolvePlanFeatures(planCode, isRecord(config?.features) ? config.features : null);
  const priceMinor = resolvePlanPriceMinor(planCode, config?.price_minor);
  const trialDays = resolveTrialDays(planCode, config?.trial_days);

  const status: SubscriptionStatus | "none" = subscription?.status ?? "none";
  const trialEndsAt = toDate(subscription?.trial_end ?? null);
  const currentPeriodEnd = toDate(subscription?.current_period_end ?? null);
  const now = Date.now();

  const isTrialing = status === "trialing" && trialEndsAt !== null && trialEndsAt.getTime() > now;
  const trialExpired = status === "trialing" && trialEndsAt !== null && trialEndsAt.getTime() <= now;

  const isActive = ACTIVE_STATUSES.has(status as SubscriptionStatus) && !trialExpired;

  const daysRemainingInTrial =
    trialEndsAt && isTrialing
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now) / 86_400_000))
      : null;

  const entitlements: Entitlements = {
    organizationId,
    planCode,
    planName: config?.display_name ?? PLANS[planCode].name,
    priceMinor,
    currency: config?.currency ?? PLANS[planCode].currency,
    trialDays,
    status,
    isActive,
    isTrialing,
    trialEndsAt,
    currentPeriodEnd,
    daysRemainingInTrial,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    limits,
    features,
    subscription: subscription ?? null,
  };

  if (!isActive) {
    entitlements.blockedReason = trialExpired
      ? "Your 7-day free trial has ended. Add a payment method to continue."
      : (BLOCKED_REASONS[status] ?? "Your subscription is not active.");
  }

  return entitlements;
}

/** True when any member of this organisation is a platform admin. */
async function isPlatformAdminOrganization(organizationId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("organization_members")
    .select("user_id, profiles!inner(platform_role)")
    .eq("organization_id", organizationId)
    .eq("profiles.platform_role", "admin")
    .limit(1);

  return (data ?? []).length > 0;
}

/**
 * Entitlements for an operator's own workspace.
 *
 * Every limit is `Number.MAX_SAFE_INTEGER` rather than a large round number so
 * nothing has to guess where a ceiling sits, and every feature flag is on. The
 * status reads `active` with no trial and no end date, which is what keeps the
 * trial gate, the billing banner and the upgrade prompts from ever appearing.
 */
function buildUnlimitedEntitlements(organizationId: string): Entitlements {
  const unlimited = Number.MAX_SAFE_INTEGER;

  return {
    organizationId,
    planCode: DEFAULT_PLAN_CODE,
    planName: "Platform administrator",
    priceMinor: 0,
    currency: PLANS[DEFAULT_PLAN_CODE].currency,
    trialDays: 0,
    status: "active",
    isActive: true,
    isTrialing: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    daysRemainingInTrial: null,
    cancelAtPeriodEnd: false,
    limits: {
      projects: unlimited,
      crawledUrls: unlimited,
      activePrompts: unlimited,
      competitors: unlimited,
      scheduledAiScansPerMonth: unlimited,
      manualAiScansPerMonth: unlimited,
      aiPromptExecutionsPerMonth: unlimited,
      pagespeedRunsPerMonth: unlimited,
      reportsPerMonth: unlimited,
      websiteAuditsPerMonth: unlimited,
    },
    features: {
      manualAudits: true,
      searchConsole: true,
      bingWebmaster: true,
      googleAnalytics: true,
      pagespeed: true,
      aiVisibility: true,
      competitorAnalysis: true,
      contentOptimizer: true,
      reports: true,
      apiAccess: true,
    },
    subscription: null,
  };
}

export class BillingRequiredError extends Error {
  readonly status: SubscriptionStatus | "none";
  constructor(message: string, status: SubscriptionStatus | "none") {
    super(message);
    this.name = "BillingRequiredError";
    this.status = status;
  }
}

/** Throw unless the organization currently has an active plan or trial. */
export async function requireActiveBilling(organizationId: string): Promise<Entitlements> {
  const entitlements = await getEntitlements(organizationId);
  if (!entitlements.isActive) {
    throw new BillingRequiredError(
      entitlements.blockedReason ?? "An active subscription is required.",
      entitlements.status,
    );
  }
  return entitlements;
}

/** Throw unless a specific plan feature is enabled. */
export function requireFeature(entitlements: Entitlements, feature: keyof PlanFeatures): void {
  if (!entitlements.features[feature]) {
    throw new BillingRequiredError(
      "That feature is not included in your current plan.",
      entitlements.status,
    );
  }
}
