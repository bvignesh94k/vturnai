"use server";

import { revalidatePath } from "next/cache";
import { requireUserContext, getProjectForUser, canWrite } from "@/lib/auth/session";
import { getEntitlements, requireActiveBilling, BillingRequiredError } from "@/lib/billing/entitlements";
import { assertWithinQuota } from "@/lib/billing/usage";
import { enqueueJob } from "@/lib/jobs/queue";
import { runJobs } from "@/lib/jobs/runner";
import { getConfiguredEngineIds } from "@/lib/ai-engines/registry";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/security/rate-limit";
import { normalizeSiteUrl, toRegistrableHost } from "@/lib/crawler/url";
import {
  competitorInputSchema,
  createReportSchema,
  pagespeedScanSchema,
  projectSettingsSchema,
  promptBulkActivateSchema,
  promptInputSchema,
  promptUpdateSchema,
  startAiScanSchema,
  startCrawlSchema,
  updateOpportunitySchema,
} from "@/lib/validation/schemas";
import { logger, errorMessage } from "@/lib/logger";
import type { EngineId } from "@/lib/config/engines";
import type { PromptGroupDb } from "@/lib/db/types";

const log = logger.child("app-actions");

export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

/**
 * Server Actions for every mutation in the application.
 *
 * Each one re-establishes who the caller is, re-checks project membership,
 * re-checks role, and (for anything that spends money) re-checks billing and
 * quota. Nothing trusts a value the browser supplied about entitlement.
 */
async function requireProjectAccess(projectId: string) {
  const context = await requireUserContext();
  const project = await getProjectForUser(projectId);
  if (!project) throw new Error("That project could not be found.");
  if (!canWrite(context.activeRole)) throw new Error("Your role on this workspace is read-only.");
  return { context, project };
}

function fail(error: unknown): ActionResult {
  if (error instanceof BillingRequiredError) return { ok: false, error: error.message };
  const message = errorMessage(error);
  log.warn("Action failed", { message });
  return { ok: false, error: message || "Something went wrong. Please try again." };
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

export async function startCrawlAction(formData: FormData): Promise<ActionResult> {
  try {
    const parsed = startCrawlSchema.parse({ projectId: formData.get("projectId") });
    const { context, project } = await requireProjectAccess(parsed.projectId);

    const entitlements = await requireActiveBilling(project.organization_id);

    const limit = await consumeRateLimit(RATE_LIMITS.crawlStart, project.id);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `You have started several audits recently. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      };
    }

    const quota = await assertWithinQuota({
      organizationId: project.organization_id,
      metric: "website_audits",
      limits: entitlements.limits,
    });
    if (!quota.allowed) return { ok: false, error: quota.reason ?? "Audit limit reached." };

    // A stable key per hour means double-clicking cannot queue two crawls.
    const hourKey = new Date().toISOString().slice(0, 13);
    await enqueueJob({
      jobType: "website_crawl",
      projectId: project.id,
      organizationId: project.organization_id,
      payload: { triggerSource: "manual", triggeredBy: context.user.id },
      idempotencyKey: `crawl:${project.id}:${hourKey}`,
      priority: 2,
      progressLabel: "Starting audit…",
    });

    revalidatePath("/app");
    revalidatePath("/app/audit");
    return { ok: true, message: "Audit started. You can leave this page. It keeps running." };
  } catch (error) {
    return fail(error);
  }
}

export async function startAiScanAction(formData: FormData): Promise<ActionResult> {
  try {
    const enginesRaw = formData.getAll("engines").filter((value): value is string => typeof value === "string");
    const parsed = startAiScanSchema.parse({
      projectId: formData.get("projectId"),
      engines: enginesRaw.length > 0 ? enginesRaw : undefined,
    });

    const { context, project } = await requireProjectAccess(parsed.projectId);
    const entitlements = await requireActiveBilling(project.organization_id);

    const configured = getConfiguredEngineIds();
    if (configured.length === 0) {
      return {
        ok: false,
        error:
          "No AI engines are connected. Add at least one provider API key under Integrations before running a scan.",
      };
    }

    const limit = await consumeRateLimit(RATE_LIMITS.aiScan, project.id);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `AI scans are limited to protect your quota. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      };
    }

    const supabase = await createServerSupabaseClient();
    const { count: activePrompts } = await supabase
      .from("prompts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("is_active", true);

    if ((activePrompts ?? 0) === 0) {
      return {
        ok: false,
        error: "Activate at least one prompt in Prompt Tracker before running a scan.",
      };
    }

    const engines = (parsed.engines ?? configured).filter((engine) =>
      configured.includes(engine as EngineId),
    );

    const [manualQuota, executionQuota] = await Promise.all([
      assertWithinQuota({
        organizationId: project.organization_id,
        metric: "manual_scans",
        limits: entitlements.limits,
      }),
      assertWithinQuota({
        organizationId: project.organization_id,
        metric: "ai_prompt_executions",
        limits: entitlements.limits,
        requested: (activePrompts ?? 0) * engines.length,
      }),
    ]);

    if (!manualQuota.allowed) return { ok: false, error: manualQuota.reason ?? "Manual scan limit reached." };
    if (!executionQuota.allowed) {
      return { ok: false, error: executionQuota.reason ?? "AI execution limit reached." };
    }

    const hourKey = new Date().toISOString().slice(0, 13);
    await enqueueJob({
      jobType: "ai_visibility_scan",
      projectId: project.id,
      organizationId: project.organization_id,
      payload: { triggerSource: "manual", triggeredBy: context.user.id, engines },
      idempotencyKey: `ai_scan:${project.id}:${hourKey}`,
      priority: 3,
      progressLabel: "Starting AI visibility scan…",
    });

    revalidatePath("/app");
    revalidatePath("/app/ai-visibility");
    return {
      ok: true,
      message: `AI visibility scan started across ${engines.length} engine${engines.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function startPagespeedAction(formData: FormData): Promise<ActionResult> {
  try {
    const parsed = pagespeedScanSchema.parse({
      projectId: formData.get("projectId"),
      strategies: ["mobile", "desktop"],
    });
    const { project } = await requireProjectAccess(parsed.projectId);
    const entitlements = await requireActiveBilling(project.organization_id);

    const limit = await consumeRateLimit(RATE_LIMITS.pagespeed, project.id);
    if (!limit.allowed) {
      return { ok: false, error: "PageSpeed checks are rate limited. Try again shortly." };
    }

    const quota = await assertWithinQuota({
      organizationId: project.organization_id,
      metric: "pagespeed_checks",
      limits: entitlements.limits,
      requested: 4,
    });
    if (!quota.allowed) return { ok: false, error: quota.reason ?? "PageSpeed quota reached." };

    await enqueueJob({
      jobType: "pagespeed_scan",
      projectId: project.id,
      organizationId: project.organization_id,
      payload: { limit: 2, strategies: parsed.strategies },
      idempotencyKey: `pagespeed:${project.id}:${new Date().toISOString().slice(0, 13)}`,
      priority: 5,
    });

    revalidatePath("/app/audit");
    return { ok: true, message: "Performance check queued for your key pages." };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Advance the job queue from the UI.
 *
 * Deployments should run the cron endpoint, but this lets a user unblock their
 * own work immediately, and makes local development usable without a scheduler.
 */
export async function runQueuedJobsAction(): Promise<ActionResult> {
  try {
    await requireUserContext();
    const result = await runJobs({ limit: 2, budgetMs: 40_000 });
    if (result.claimed === 0) return { ok: true, message: "No queued work right now." };
    revalidatePath("/app");
    return {
      ok: true,
      message: `Processed ${result.succeeded} of ${result.claimed} queued job${result.claimed === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export async function createPromptAction(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const { context, project } = await requireProjectAccess(projectId);

    const parsed = promptInputSchema.parse({
      promptText: formData.get("promptText"),
      intent: formData.get("intent") || undefined,
      topic: formData.get("topic") || undefined,
      promptGroup: formData.get("promptGroup") || "awareness",
      country: formData.get("country") || project.target_country,
      language: formData.get("language") || project.primary_language,
      priority: Number(formData.get("priority") ?? 3),
      isActive: formData.get("isActive") !== "false",
      tags: [],
    });

    const entitlements = await getEntitlements(project.organization_id);
    const supabase = await createServerSupabaseClient();

    if (parsed.isActive) {
      const { count } = await supabase
        .from("prompts")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .eq("is_active", true);

      if ((count ?? 0) >= entitlements.limits.activePrompts) {
        return {
          ok: false,
          error: `Your plan allows ${entitlements.limits.activePrompts} active prompts. Deactivate one first, or add this prompt as inactive.`,
        };
      }
    }

    const { error } = await supabase.from("prompts").insert({
      project_id: project.id,
      prompt_text: parsed.promptText,
      intent: parsed.intent ?? null,
      topic: parsed.topic ?? null,
      prompt_group: parsed.promptGroup as PromptGroupDb,
      country: parsed.country,
      language: parsed.language,
      priority: parsed.priority,
      is_active: parsed.isActive,
      is_suggested: false,
      created_by: context.user.id,
    });

    if (error) {
      if (error.code === "23505") return { ok: false, error: "You are already tracking that prompt." };
      throw new Error(error.message);
    }

    revalidatePath("/app/prompts");
    return { ok: true, message: "Prompt added." };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePromptAction(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const { project } = await requireProjectAccess(projectId);

    const parsed = promptUpdateSchema.parse({
      id: formData.get("promptId"),
      promptText: formData.get("promptText") || undefined,
      promptGroup: formData.get("promptGroup") || undefined,
      priority: formData.get("priority") ? Number(formData.get("priority")) : undefined,
      isActive: formData.get("isActive") ? formData.get("isActive") === "true" : undefined,
    });

    const supabase = await createServerSupabaseClient();
    const update: Record<string, unknown> = {};
    if (parsed.promptText) update["prompt_text"] = parsed.promptText;
    if (parsed.promptGroup) update["prompt_group"] = parsed.promptGroup;
    if (parsed.priority !== undefined) update["priority"] = parsed.priority;
    if (parsed.isActive !== undefined) {
      update["is_active"] = parsed.isActive;
      // Activating a suggestion promotes it to a real tracked prompt.
      if (parsed.isActive) update["is_suggested"] = false;
    }

    if (parsed.isActive === true) {
      const entitlements = await getEntitlements(project.organization_id);
      const { count } = await supabase
        .from("prompts")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .eq("is_active", true);
      if ((count ?? 0) >= entitlements.limits.activePrompts) {
        return {
          ok: false,
          error: `Your plan allows ${entitlements.limits.activePrompts} active prompts at a time.`,
        };
      }
    }

    const { error } = await supabase
      .from("prompts")
      .update(update as never)
      .eq("id", parsed.id)
      .eq("project_id", project.id);

    if (error) throw new Error(error.message);

    revalidatePath("/app/prompts");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function bulkActivatePromptsAction(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const { project } = await requireProjectAccess(projectId);

    const promptIds = formData
      .getAll("promptIds")
      .filter((value): value is string => typeof value === "string");
    const parsed = promptBulkActivateSchema.parse({
      promptIds,
      isActive: formData.get("isActive") === "true",
    });

    const supabase = await createServerSupabaseClient();

    if (parsed.isActive) {
      const entitlements = await getEntitlements(project.organization_id);
      const { count } = await supabase
        .from("prompts")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .eq("is_active", true);

      const available = entitlements.limits.activePrompts - (count ?? 0);
      if (available <= 0) {
        return {
          ok: false,
          error: `You already have ${entitlements.limits.activePrompts} active prompts, which is your plan limit.`,
        };
      }
      if (parsed.promptIds.length > available) {
        return {
          ok: false,
          error: `You can activate ${available} more prompt${available === 1 ? "" : "s"} on your plan. Select fewer, or deactivate some first.`,
        };
      }
    }

    const { error } = await supabase
      .from("prompts")
      .update({ is_active: parsed.isActive, is_suggested: parsed.isActive ? false : undefined } as never)
      .in("id", parsed.promptIds)
      .eq("project_id", project.id);

    if (error) throw new Error(error.message);

    revalidatePath("/app/prompts");
    return {
      ok: true,
      message: `${parsed.promptIds.length} prompt${parsed.promptIds.length === 1 ? "" : "s"} ${parsed.isActive ? "activated" : "deactivated"}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePromptAction(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const promptId = String(formData.get("promptId") ?? "");
    const { project } = await requireProjectAccess(projectId);

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("prompts")
      .delete()
      .eq("id", promptId)
      .eq("project_id", project.id);

    if (error) throw new Error(error.message);
    revalidatePath("/app/prompts");
    return { ok: true, message: "Prompt removed." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

export async function addCompetitorAction(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const { project } = await requireProjectAccess(projectId);

    const parsed = competitorInputSchema.parse({
      brandName: formData.get("brandName"),
      siteUrl: formData.get("siteUrl") || undefined,
      notes: formData.get("notes") || undefined,
    });

    const entitlements = await getEntitlements(project.organization_id);
    const supabase = await createServerSupabaseClient();

    const { count } = await supabase
      .from("competitors")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("is_active", true);

    if ((count ?? 0) >= entitlements.limits.competitors) {
      return {
        ok: false,
        error: `Your plan tracks up to ${entitlements.limits.competitors} competitors. Remove one to add another.`,
      };
    }

    const siteUrl = parsed.siteUrl ? normalizeSiteUrl(parsed.siteUrl) : null;
    const { error } = await supabase.from("competitors").insert({
      project_id: project.id,
      brand_name: parsed.brandName,
      site_url: siteUrl,
      domain: siteUrl ? toRegistrableHost(siteUrl) : null,
      notes: parsed.notes ?? null,
    });

    if (error) {
      if (error.code === "23505") return { ok: false, error: "You are already tracking that competitor." };
      throw new Error(error.message);
    }

    revalidatePath("/app/competitors");
    return { ok: true, message: `${parsed.brandName} added.` };
  } catch (error) {
    return fail(error);
  }
}

export async function removeCompetitorAction(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const competitorId = String(formData.get("competitorId") ?? "");
    const { project } = await requireProjectAccess(projectId);

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("competitors")
      .delete()
      .eq("id", competitorId)
      .eq("project_id", project.id);

    if (error) throw new Error(error.message);
    revalidatePath("/app/competitors");
    return { ok: true, message: "Competitor removed." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export async function updateOpportunityStatusAction(formData: FormData): Promise<ActionResult> {
  try {
    const projectId = String(formData.get("projectId") ?? "");
    const { project } = await requireProjectAccess(projectId);

    const parsed = updateOpportunitySchema.parse({
      opportunityId: formData.get("opportunityId"),
      status: formData.get("status"),
    });

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("opportunities")
      .update({
        status: parsed.status,
        completed_at: parsed.status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.opportunityId)
      .eq("project_id", project.id);

    if (error) throw new Error(error.message);

    revalidatePath("/app/opportunities");
    revalidatePath("/app");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function createReportAction(formData: FormData): Promise<ActionResult> {
  try {
    const parsed = createReportSchema.parse({
      projectId: formData.get("projectId"),
      title: formData.get("title") || undefined,
      periodDays: Number(formData.get("periodDays") ?? 30),
    });

    const { context, project } = await requireProjectAccess(parsed.projectId);
    const entitlements = await requireActiveBilling(project.organization_id);

    const limit = await consumeRateLimit(RATE_LIMITS.reportGeneration, project.id);
    if (!limit.allowed) {
      return { ok: false, error: "Report generation is rate limited. Try again shortly." };
    }

    const quota = await assertWithinQuota({
      organizationId: project.organization_id,
      metric: "reports_generated",
      limits: entitlements.limits,
    });
    if (!quota.allowed) return { ok: false, error: quota.reason ?? "Report limit reached." };

    const admin = createServiceRoleClient();
    const { data: report, error } = await admin
      .from("reports")
      .insert({
        project_id: project.id,
        created_by: context.user.id,
        title: parsed.title ?? `${project.name}: Visibility Report`,
        report_type: "full",
        status: "queued",
      })
      .select("id")
      .single();

    if (error || !report) throw new Error(error?.message ?? "Could not create the report.");

    await enqueueJob({
      jobType: "report_generation",
      projectId: project.id,
      organizationId: project.organization_id,
      payload: { reportId: report.id, periodDays: parsed.periodDays },
      idempotencyKey: `report:${report.id}`,
      priority: 4,
    });

    revalidatePath("/app/reports");
    return { ok: true, message: "Report queued. It will appear here in a moment." };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateProjectSettingsAction(formData: FormData): Promise<ActionResult> {
  try {
    const parsed = projectSettingsSchema.parse({
      projectId: formData.get("projectId"),
      name: formData.get("name") || undefined,
      brandName: formData.get("brandName") || undefined,
      brandAliases: formData.get("brandAliases")
        ? String(formData.get("brandAliases"))
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 10)
        : undefined,
      businessCategory: formData.get("businessCategory") || undefined,
      businessDescription: formData.get("businessDescription") || undefined,
      targetCountry: formData.get("targetCountry") || undefined,
      targetAudience: formData.get("targetAudience") || undefined,
      maxCrawlUrls: formData.get("maxCrawlUrls") ? Number(formData.get("maxCrawlUrls")) : undefined,
      respectRobots: formData.get("respectRobots") ? formData.get("respectRobots") === "true" : undefined,
      notificationEmail: formData.get("notificationEmail")
        ? formData.get("notificationEmail") === "true"
        : undefined,
      notificationInApp: formData.get("notificationInApp")
        ? formData.get("notificationInApp") === "true"
        : undefined,
    });

    const { project } = await requireProjectAccess(parsed.projectId);
    const entitlements = await getEntitlements(project.organization_id);
    const supabase = await createServerSupabaseClient();

    const projectUpdate: Record<string, unknown> = {};
    if (parsed.name) projectUpdate["name"] = parsed.name;
    if (parsed.brandName) projectUpdate["brand_name"] = parsed.brandName;
    if (parsed.brandAliases) projectUpdate["brand_aliases"] = parsed.brandAliases;
    if (parsed.businessCategory !== undefined) projectUpdate["business_category"] = parsed.businessCategory;
    if (parsed.businessDescription !== undefined) {
      projectUpdate["business_description"] = parsed.businessDescription;
    }
    if (parsed.targetCountry) projectUpdate["target_country"] = parsed.targetCountry;
    if (parsed.targetAudience !== undefined) projectUpdate["target_audience"] = parsed.targetAudience;

    if (Object.keys(projectUpdate).length > 0) {
      const { error } = await supabase
        .from("projects")
        .update(projectUpdate as never)
        .eq("id", project.id);
      if (error) throw new Error(error.message);
    }

    const settingsUpdate: Record<string, unknown> = {};
    if (parsed.maxCrawlUrls !== undefined) {
      // The plan limit is the ceiling; a project setting may only lower it.
      settingsUpdate["max_crawl_urls"] = Math.min(parsed.maxCrawlUrls, entitlements.limits.crawledUrls);
    }
    if (parsed.respectRobots !== undefined) settingsUpdate["respect_robots"] = parsed.respectRobots;
    if (parsed.notificationEmail !== undefined) {
      settingsUpdate["notification_email"] = parsed.notificationEmail;
    }
    if (parsed.notificationInApp !== undefined) {
      settingsUpdate["notification_in_app"] = parsed.notificationInApp;
    }

    if (Object.keys(settingsUpdate).length > 0) {
      const { error } = await supabase
        .from("project_settings")
        .update(settingsUpdate as never)
        .eq("project_id", project.id);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/app/settings");
    revalidatePath("/app");
    return { ok: true, message: "Settings saved." };
  } catch (error) {
    return fail(error);
  }
}
