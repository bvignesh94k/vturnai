import type { Metadata } from "next";
import Link from "next/link";
import { ListChecksIcon } from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { OpportunityBoard } from "@/app/app/opportunities/opportunity-board";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { loadPageContext } from "@/lib/data/project-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { round } from "@/lib/utils";
import type { Json } from "@/lib/db/types";

export const metadata: Metadata = { title: "Opportunities" };

interface PriorityComponent {
  key: string;
  label: string;
  weight: number;
  value: number;
  contribution: number;
}

function readPriorityComponents(breakdown: Json): PriorityComponent[] {
  if (typeof breakdown !== "object" || breakdown === null || Array.isArray(breakdown)) return [];
  const components = (breakdown as { components?: unknown }).components;
  if (!Array.isArray(components)) return [];
  return components.filter(
    (entry): entry is PriorityComponent =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as PriorityComponent).key === "string" &&
      typeof (entry as PriorityComponent).contribution === "number",
  );
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project, canWrite } = await loadPageContext(searchParams);
  const supabase = await createServerSupabaseClient();

  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("*")
    .eq("project_id", project.id)
    .order("priority_score", { ascending: false })
    .limit(200);

  const rows = opportunities ?? [];
  const open = rows.filter((row) => row.status === "open");
  const inProgress = rows.filter((row) => row.status === "in_progress");
  const completed = rows.filter((row) => row.status === "completed");

  if (rows.length === 0) {
    return (
      <div>
        <PageHeader
          title="Opportunities"
          description="Every finding turned into a ranked action, so you always know the best next task."
        />
        <EmptyState
          icon={<ListChecksIcon className="size-5" />}
          title="No opportunities yet"
          description="Run a website audit and an AI visibility scan. Every finding becomes a prioritised action scored on severity, visibility impact, pages affected, traffic potential and effort."
          action={
            <Button variant="gradient" asChild>
              <Link href="/app/audit">Run a website audit</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunities"
        description="Sorted by impact for the effort involved. Work top-down: this is the order that moves your V Score fastest."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open" value={open.length} format="raw" footnote="Waiting to be started" />
        <MetricCard
          label="In progress"
          value={inProgress.length}
          format="raw"
          footnote="Currently being worked on"
        />
        <MetricCard
          label="Completed"
          value={completed.length}
          format="raw"
          footnote="Done, re-run an audit to confirm"
        />
        <MetricCard
          metricKey="opportunityPriority"
          label="Top priority score"
          value={open.length > 0 ? round(Number(open[0]?.priority_score ?? 0), 1) : null}
          format="raw"
          emptyHint="Nothing open"
        />
      </div>

      <OpportunityBoard
        projectId={project.id}
        canWrite={canWrite}
        opportunities={rows.map((row) => ({
          id: row.id,
          title: row.title,
          type: row.opportunity_type,
          disciplines: row.disciplines,
          severity: row.severity,
          expectedImpact: row.expected_impact,
          effort: row.effort,
          priorityScore: round(Number(row.priority_score), 1),
          priorityComponents: readPriorityComponents(row.priority_breakdown),
          affectedUrls: row.affected_urls,
          affectedPageCount: row.affected_page_count,
          explanation: row.explanation,
          recommendation: row.recommendation,
          implementationGuidance: row.implementation_guidance,
          status: row.status,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        }))}
      />
    </div>
  );
}
