import type { Metadata } from "next";
import Link from "next/link";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createReportAction } from "@/app/app/actions";
import { loadPageContext } from "@/lib/data/project-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

const STATUS_VARIANT = {
  queued: "muted",
  generating: "info",
  ready: "success",
  failed: "destructive",
} as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project, entitlements, canWrite } = await loadPageContext(searchParams);
  const supabase = await createServerSupabaseClient();

  const { data: reports } = await supabase
    .from("reports")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = reports ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="A complete visibility report you can print, save as PDF from your browser, or hand to a client."
        actions={
          canWrite ? (
            <ActionButton
              action={createReportAction}
              fields={{ projectId: project.id, periodDays: "30" }}
              variant="gradient"
              pendingLabel="Queueing…"
            >
              <PlusIcon /> Generate report
            </ActionButton>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon className="size-5" />}
          title="No reports yet"
          description={`Generate a report covering your executive summary, all four scores, the AI engine breakdown, competitors, top issues and a recommended action plan. Your plan includes ${entitlements.limits.reportsPerMonth} reports per month.`}
          action={
            canWrite ? (
              <ActionButton
                action={createReportAction}
                fields={{ projectId: project.id, periodDays: "30" }}
                variant="gradient"
              >
                <PlusIcon /> Generate your first report
              </ActionButton>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((report) => (
            <li key={report.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{report.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {relativeTime(report.created_at)}
                      {report.generated_at ? ` · Generated ${formatDateTime(report.generated_at)}` : ""}
                      {report.period_start && report.period_end
                        ? ` · Covering ${report.period_start} to ${report.period_end}`
                        : ""}
                    </p>
                    {report.data_sources.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {report.data_sources.map((source) => (
                          <Badge key={source} variant="muted">
                            {source}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {report.status === "failed" && report.error_message ? (
                      <p className="mt-2 text-xs text-destructive">{report.error_message}</p>
                    ) : null}
                  </div>

                  <Badge variant={STATUS_VARIANT[report.status]} className="capitalize">
                    {report.status}
                  </Badge>

                  {report.status === "ready" ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/app/reports/${report.id}`}>Open report</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
