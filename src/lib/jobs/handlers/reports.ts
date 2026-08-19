import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { assertWithinQuota, recordUsage } from "@/lib/billing/usage";
import { buildReportPayload } from "@/lib/reports/builder";
import { completeJob, payloadValue, updateJobProgress } from "@/lib/jobs/queue";
import { notifyOrganization } from "@/lib/notifications/service";
import { errorMessage } from "@/lib/logger";
import type { JobRow, Json } from "@/lib/db/types";

/**
 * Report generation.
 *
 * The report is assembled into a structured payload and stored. Rendering is a
 * separate concern (print-friendly HTML today, PDF later) so a change of output
 * format never means re-running the data collection.
 */
export async function handleReportGeneration(job: JobRow): Promise<void> {
  const supabase = createServiceRoleClient();
  const projectId = job.project_id;
  const reportId = payloadValue<string | null>(job.payload, "reportId", null);
  if (!projectId || !reportId) throw new Error("report_generation requires project_id and reportId");

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) throw new Error(`Project ${projectId} no longer exists`);

  const entitlements = await getEntitlements(project.organization_id);
  const quota = await assertWithinQuota({
    organizationId: project.organization_id,
    metric: "reports_generated",
    limits: entitlements.limits,
  });

  if (!quota.allowed) {
    await supabase
      .from("reports")
      .update({ status: "failed", error_message: quota.reason ?? "Report limit reached" })
      .eq("id", reportId);
    await completeJob({ jobId: job.id, label: quota.reason ?? "Report limit reached" });
    return;
  }

  await supabase.from("reports").update({ status: "generating" }).eq("id", reportId);
  await updateJobProgress({ jobId: job.id, label: "Assembling your report" });

  try {
    const payload = await buildReportPayload({
      projectId,
      periodDays: payloadValue<number>(job.payload, "periodDays", 30),
    });

    await supabase
      .from("reports")
      .update({
        status: "ready",
        payload: payload as unknown as Json,
        data_sources: payload.dataSources,
        period_start: payload.period.start,
        period_end: payload.period.end,
        generated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", reportId);

    await recordUsage(
      {
        organizationId: project.organization_id,
        projectId,
        metric: "reports_generated",
        quantity: 1,
        referenceId: reportId,
      },
      entitlements.limits,
    );

    await notifyOrganization(project.organization_id, {
      projectId,
      type: "report_ready",
      title: "Your report is ready",
      body: `${payload.title} has been generated and is ready to view or print.`,
      actionUrl: `/app/reports/${reportId}`,
    });

    await completeJob({ jobId: job.id, label: "Report ready", result: { reportId } });
  } catch (error) {
    await supabase
      .from("reports")
      .update({ status: "failed", error_message: errorMessage(error).slice(0, 500) })
      .eq("id", reportId);
    throw error;
  }
}
