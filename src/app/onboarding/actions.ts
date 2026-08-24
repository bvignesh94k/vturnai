"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { startTrialSubscription } from "@/lib/billing/subscription-service";
import { isRazorpayConfigured } from "@/lib/billing/razorpay";
import { enqueueJob } from "@/lib/jobs/queue";
import { completeOnboardingSchema } from "@/lib/validation/schemas";
import { normalizeSiteUrl, toRegistrableHost } from "@/lib/crawler/url";
import { resolveAndAssertPublicHost, BlockedRequestError } from "@/lib/security/ssrf";
import { logger, errorMessage } from "@/lib/logger";

const log = logger.child("onboarding");

export interface OnboardingState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

interface CompetitorInput {
  brandName: string;
  siteUrl?: string;
}

/**
 * Complete onboarding.
 *
 * Creates the project, its settings and competitors, registers the trial
 * subscription, and queues the initial scan. Everything is server-side: the
 * browser posts the wizard's answers and nothing else.
 */
export async function completeOnboardingAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const context = await requireUserContext();

  let competitors: CompetitorInput[] = [];
  const rawCompetitors = formData.get("competitors");
  if (typeof rawCompetitors === "string" && rawCompetitors.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawCompetitors);
      if (Array.isArray(parsed)) {
        competitors = parsed
          .filter(
            (entry): entry is CompetitorInput =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as CompetitorInput).brandName === "string",
          )
          .slice(0, 5);
      }
    } catch {
      return { error: "Your competitor list could not be read. Please re-enter it." };
    }
  }

  const parsed = completeOnboardingSchema.safeParse({
    siteUrl: formData.get("siteUrl"),
    brandName: formData.get("brandName"),
    businessCategory: formData.get("businessCategory") || undefined,
    businessDescription: formData.get("businessDescription") || undefined,
    targetCountry: formData.get("targetCountry") || "IN",
    targetAudience: formData.get("targetAudience") || undefined,
    primaryLanguage: formData.get("primaryLanguage") || "en",
    competitors,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const input = parsed.data;

  // Confirm the site is a real, public host before we commit anything.
  try {
    await resolveAndAssertPublicHost(input.siteUrl);
  } catch (error) {
    if (error instanceof BlockedRequestError) {
      return { fieldErrors: { siteUrl: error.message } };
    }
    return { fieldErrors: { siteUrl: "That website could not be reached. Check the address." } };
  }

  const domain = toRegistrableHost(input.siteUrl);
  if (!domain) return { fieldErrors: { siteUrl: "That website address could not be understood." } };

  const organizationId = context.activeOrganization.id;
  const entitlements = await getEntitlements(organizationId);
  const supabase = await createServerSupabaseClient();

  // Enforce the project limit server-side.
  const { count: projectCount } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if ((projectCount ?? 0) >= entitlements.limits.projects) {
    return {
      error: `Your plan includes ${entitlements.limits.projects} website project. Remove the existing project before adding another.`,
    };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      organization_id: organizationId,
      created_by: context.user.id,
      name: input.brandName,
      site_url: input.siteUrl,
      domain,
      brand_name: input.brandName,
      business_category: input.businessCategory ?? null,
      business_description: input.businessDescription ?? null,
      target_country: input.targetCountry,
      target_audience: input.targetAudience ?? null,
      primary_language: input.primaryLanguage,
      onboarding_step: 5,
      onboarding_completed_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (projectError || !project) {
    if (projectError?.code === "23505") {
      return { fieldErrors: { siteUrl: "That website is already set up in this workspace." } };
    }
    log.error("Could not create project", { error: projectError });
    return { error: "We could not create your project. Please try again." };
  }

  const admin = createServiceRoleClient();

  await admin.from("project_settings").insert({
    project_id: project.id,
    max_crawl_urls: entitlements.limits.crawledUrls,
  });

  if (input.competitors.length > 0) {
    const competitorRows = input.competitors
      .map((competitor) => {
        const siteUrl = competitor.siteUrl ? normalizeSiteUrl(competitor.siteUrl) : null;
        return {
          project_id: project.id,
          brand_name: competitor.brandName.trim(),
          site_url: siteUrl,
          domain: siteUrl ? toRegistrableHost(siteUrl) : null,
        };
      })
      .filter((row) => row.brand_name.length > 1);

    if (competitorRows.length > 0) {
      const { error: competitorError } = await admin.from("competitors").insert(competitorRows);
      // A competitor failing to save must not lose the whole onboarding.
      if (competitorError) log.warn("Some competitors could not be saved", { error: competitorError });
    }
  }

  await admin
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", context.user.id);

  // Register the trial. If Razorpay is not configured (local development), the
  // project is still usable, we log it rather than blocking onboarding.
  if (isRazorpayConfigured() && !entitlements.subscription) {
    try {
      await startTrialSubscription({
        organizationId,
        billingEmail: context.activeOrganization.billing_email,
        notes: { project_id: project.id },
      });
    } catch (error) {
      log.error("Trial subscription could not be created during onboarding", {
        organizationId,
        error: errorMessage(error),
      });
    }
  }

  /**
   * The scan must actually be on the queue before we send anyone to watch it.
   *
   * `enqueueJob` reports a failure by returning null, and ignoring that return
   * is how a misconfigured deployment turns into a progress screen that spins
   * for ever: the project exists, the page polls, and there is no job behind it
   * to ever finish. Better to say so here, while the person is still in a
   * screen that can explain itself.
   */
  const job = await enqueueJob({
    jobType: "initial_scan",
    projectId: project.id,
    organizationId,
    payload: { stage: "crawl", triggeredBy: context.user.id },
    idempotencyKey: `initial_scan:${project.id}`,
    priority: 1,
    progressLabel: "Building your visibility profile…",
  });

  if (!job) {
    log.error("Initial scan could not be queued", { projectId: project.id, organizationId });
    return {
      error:
        "Your workspace was created, but we could not start the first scan. Open the dashboard and start it from there, or contact support if it keeps happening.",
    };
  }

  revalidatePath("/app");
  redirect(`/onboarding/building?project=${project.id}`);
}

/** Validate a URL from step 1 without committing anything. */
export async function validateSiteUrlAction(siteUrl: string): Promise<{ ok: boolean; message?: string }> {
  await requireUserContext();
  const normalized = normalizeSiteUrl(siteUrl);
  if (!normalized) return { ok: false, message: "Enter a valid website address, for example example.com" };

  try {
    await resolveAndAssertPublicHost(normalized);
    return { ok: true };
  } catch (error) {
    if (error instanceof BlockedRequestError) return { ok: false, message: error.message };
    return { ok: false, message: "That website could not be reached." };
  }
}
