import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { expireLapsedTrials } from "@/lib/billing/subscription-service";
import { getEntitlements } from "@/lib/billing/entitlements";
import { assertWithinQuota } from "@/lib/billing/usage";
import { enqueueJob } from "@/lib/jobs/queue";
import { safeEqual } from "@/lib/security/encryption";
import { notifyOrganization } from "@/lib/notifications/service";
import { round } from "@/lib/utils";
import { logger, errorMessage } from "@/lib/logger";

const log = logger.child("cron-daily");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer && safeEqual(bearer, secret)) return true;
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  return Boolean(headerSecret) && safeEqual(headerSecret, secret);
}

/**
 * Daily maintenance.
 *
 * Expires lapsed trials, schedules the recurring AI visibility scans a plan
 * includes, refreshes connected data sources, and raises a notification when a
 * project's visibility has dropped sharply.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const summary = {
    trialsExpired: 0,
    trialsWarned: 0,
    scansScheduled: 0,
    syncsScheduled: 0,
    dropsNotified: 0,
    errors: [] as string[],
  };

  // ---- Trials --------------------------------------------------------------
  try {
    const trials = await expireLapsedTrials();
    summary.trialsExpired = trials.expired;
    summary.trialsWarned = trials.warned;
  } catch (error) {
    summary.errors.push(`trials: ${errorMessage(error)}`);
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, organization_id, last_ai_scan_at, name")
    .eq("is_active", true)
    .limit(500);

  const now = Date.now();

  for (const project of projects ?? []) {
    try {
      const entitlements = await getEntitlements(project.organization_id);
      if (!entitlements.isActive) continue;

      // ---- Scheduled AI visibility scans ----------------------------------
      const scansPerMonth = entitlements.limits.scheduledAiScansPerMonth;
      if (scansPerMonth > 0) {
        const intervalDays = Math.max(1, Math.floor(30 / scansPerMonth));
        const lastScan = project.last_ai_scan_at ? new Date(project.last_ai_scan_at).getTime() : 0;
        const dueDays = (now - lastScan) / 86_400_000;

        if (dueDays >= intervalDays) {
          const quota = await assertWithinQuota({
            organizationId: project.organization_id,
            metric: "ai_prompt_executions",
            limits: entitlements.limits,
            requested: entitlements.limits.activePrompts,
          });

          if (quota.allowed) {
            const dayKey = new Date().toISOString().slice(0, 10);
            await enqueueJob({
              jobType: "ai_visibility_scan",
              projectId: project.id,
              organizationId: project.organization_id,
              payload: { triggerSource: "scheduled" },
              idempotencyKey: `scheduled_ai_scan:${project.id}:${dayKey}`,
              priority: 6,
              progressLabel: "Scheduled AI visibility scan",
            });
            summary.scansScheduled += 1;
          }
        }
      }

      // ---- Refresh connected data sources ---------------------------------
      const dayKey = new Date().toISOString().slice(0, 10);
      const [{ data: gsc }, { data: bing }, { data: ga4 }] = await Promise.all([
        supabase.from("search_console_connections").select("project_id").eq("project_id", project.id).maybeSingle(),
        supabase.from("bing_connections").select("project_id").eq("project_id", project.id).maybeSingle(),
        supabase.from("analytics_connections").select("project_id").eq("project_id", project.id).maybeSingle(),
      ]);

      if (gsc) {
        await enqueueJob({
          jobType: "search_console_sync",
          projectId: project.id,
          organizationId: project.organization_id,
          payload: { days: 28 },
          idempotencyKey: `gsc_daily:${project.id}:${dayKey}`,
          priority: 7,
        });
        summary.syncsScheduled += 1;
      }
      if (bing) {
        await enqueueJob({
          jobType: "bing_sync",
          projectId: project.id,
          organizationId: project.organization_id,
          idempotencyKey: `bing_daily:${project.id}:${dayKey}`,
          priority: 7,
        });
        summary.syncsScheduled += 1;
      }
      if (ga4) {
        await enqueueJob({
          jobType: "analytics_sync",
          projectId: project.id,
          organizationId: project.organization_id,
          payload: { days: 28 },
          idempotencyKey: `ga4_daily:${project.id}:${dayKey}`,
          priority: 7,
        });
        summary.syncsScheduled += 1;
      }

      // ---- Visibility drop detection --------------------------------------
      const { data: scores } = await supabase
        .from("project_scores")
        .select("v_score, captured_at")
        .eq("project_id", project.id)
        .order("captured_at", { ascending: false })
        .limit(2);

      if (scores && scores.length === 2) {
        const latest = Number(scores[0]?.v_score ?? 0);
        const previous = Number(scores[1]?.v_score ?? 0);
        const drop = previous - latest;

        // Only a material fall is worth interrupting someone for.
        if (drop >= 8) {
          await notifyOrganization(project.organization_id, {
            projectId: project.id,
            type: "visibility_drop",
            title: `${project.name} visibility dropped ${round(drop, 1)} points`,
            body: `Your V Score fell from ${round(previous, 0)} to ${round(latest, 0)}. Open the dashboard to see which discipline moved.`,
            actionUrl: "/app",
          });
          summary.dropsNotified += 1;
        }
      }
    } catch (error) {
      summary.errors.push(`project ${project.id}: ${errorMessage(error)}`);
    }
  }

  log.info("Daily cron complete", summary);
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}

export const POST = GET;
