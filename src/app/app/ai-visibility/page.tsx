import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLinkIcon, InfoIcon, PlayIcon } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { AiActivationChecklist } from "@/components/app/ai-activation";
import { EngineGrid } from "@/components/app/engine-grid";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { AiVisibilityTrendChart, ShareOfVoiceChart } from "@/components/charts/dashboard-charts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { startAiScanAction } from "@/app/app/actions";
import { ENGINES, OBSERVATION_MODES, type EngineId } from "@/lib/config/engines";
import { loadPageContext } from "@/lib/data/project-context";
import { loadAiVisibility, loadScoreTrend } from "@/lib/data/dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatDateTime, relativeTime, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "AI Visibility" };

const SENTIMENT_VARIANT = {
  positive: "success",
  neutral: "muted",
  mixed: "warning",
  negative: "destructive",
  unknown: "muted",
} as const;

export default async function AiVisibilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project, canWrite } = await loadPageContext(searchParams);
  const supabase = await createServerSupabaseClient();

  const [aiData, trend, { count: suggestedPrompts }, { data: recentRuns }, { data: topCitations }] =
    await Promise.all([
    loadAiVisibility({ projectId: project.id, brandName: project.brand_name }),
    loadScoreTrend(project.id),
    supabase
      .from("prompts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("is_suggested", true)
      .eq("is_active", false),
    supabase
      .from("ai_runs")
      .select(
        "id, engine, model, prompt_text, answer, brand_mentioned, domain_cited, recommended, sentiment, is_valid, failure_reason, executed_at, citation_count",
      )
      .eq("project_id", project.id)
      .order("executed_at", { ascending: false })
      .limit(25),
    supabase
      .from("ai_citations")
      .select("url, domain, is_brand_domain")
      .eq("project_id", project.id)
      .eq("is_brand_domain", true)
      .limit(500),
  ]);

  const unconfigured = aiData.providerStatuses.filter((status) => !status.configured);

  // Which of our own pages AI engines cite most.
  const citationCounts = new Map<string, number>();
  for (const citation of topCitations ?? []) {
    citationCounts.set(citation.url, (citationCounts.get(citation.url) ?? 0) + 1);
  }
  const citedPages = [...citationCounts.entries()]
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Visibility"
        description="What AI answer engines say about you when someone asks a question in your category."
        actions={
          canWrite ? (
            <ActionButton
              action={startAiScanAction}
              fields={{ projectId: project.id }}
              variant="gradient"
              pendingLabel="Starting…"
            >
              <PlayIcon /> Run AI visibility scan
            </ActionButton>
          ) : null
        }
      />

      {aiData.summary === null ? (
        <AiActivationChecklist
          projectId={project.id}
          canWrite={canWrite}
          providerStatuses={aiData.providerStatuses}
          activePrompts={aiData.trackedPrompts}
          suggestedPrompts={suggestedPrompts ?? 0}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              metricKey="brandMentionRate"
              value={aiData.summary.mentionRate}
              format="percent"
              delta={
                aiData.previousSummary
                  ? aiData.summary.mentionRate - aiData.previousSummary.mentionRate
                  : null
              }
            />
            <MetricCard
              metricKey="citationRate"
              value={aiData.summary.citationRate}
              format="percent"
              delta={
                aiData.previousSummary
                  ? aiData.summary.citationRate - aiData.previousSummary.citationRate
                  : null
              }
            />
            <MetricCard
              metricKey="recommendationRate"
              value={aiData.summary.recommendationRate}
              format="percent"
              delta={
                aiData.previousSummary
                  ? aiData.summary.recommendationRate - aiData.previousSummary.recommendationRate
                  : null
              }
            />
            <MetricCard
              metricKey="engineConsistency"
              value={aiData.summary.engineConsistency}
              format="percent"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              metricKey="aiShareOfVoice"
              value={aiData.summary.shareOfVoice}
              format="percent"
            />
            <MetricCard
              metricKey="promptCoverage"
              value={aiData.summary.promptCoverage}
              format="percent"
              footnote={`${aiData.trackedPrompts} prompts tracked`}
            />
            <MetricCard
              metricKey="citationDiversity"
              value={aiData.summary.citationDiversity}
              format="raw"
              footnote="Distinct pages cited"
            />
            <MetricCard
              label="Valid responses"
              value={aiData.summary.validResponses}
              format="raw"
              footnote={`of ${aiData.summary.totalResponses} attempted in the last 30 days`}
            />
          </div>

          <EngineGrid rows={aiData.engineRows} providerStatuses={aiData.providerStatuses} />

          <div className="grid gap-4 lg:grid-cols-2">
            <AiVisibilityTrendChart data={trend} />
            <ShareOfVoiceChart data={aiData.shareOfVoice} />
          </div>

          {/* Pages AI engines actually cite */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your most cited pages</CardTitle>
              <CardDescription>
                The pages on your domain that AI engines linked to. These are the pages your AI
                visibility currently depends on.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {citedPages.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  No engine has cited your domain yet. Improving Citation Readiness on your key pages
                  is the fastest route to changing that.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Page</TableHead>
                      <TableHead className="pr-5 text-right">Citations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {citedPages.map((page) => (
                      <TableRow key={page.url}>
                        <TableCell className="pl-5">
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                          >
                            {truncate(page.url.replace(/^https?:\/\//, ""), 70)}
                            <ExternalLinkIcon className="size-3 shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell className="pr-5 text-right tabular-nums">{page.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Recent answers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent AI answers</CardTitle>
              <CardDescription>
                The actual text each engine returned. When a result looks wrong, this is where you
                find out why.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {(recentRuns ?? []).length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No runs recorded yet.</p>
              ) : (
                (recentRuns ?? []).map((run) => {
                  const engine = ENGINES[run.engine as EngineId];
                  return (
                    <details
                      key={run.id}
                      className="group rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-secondary/30"
                    >
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: engine.accent }}
                        >
                          {engine.monogram}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {run.prompt_text}
                        </span>
                        {!run.is_valid ? (
                          <Badge variant="destructive">Failed</Badge>
                        ) : (
                          <>
                            {run.brand_mentioned ? (
                              <Badge variant="success">Mentioned</Badge>
                            ) : (
                              <Badge variant="muted">Not mentioned</Badge>
                            )}
                            {run.domain_cited ? <Badge variant="info">Cited</Badge> : null}
                            {run.recommended ? <Badge variant="soft">Recommended</Badge> : null}
                            <Badge variant={SENTIMENT_VARIANT[run.sentiment]}>{run.sentiment}</Badge>
                          </>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(run.executed_at)}
                        </span>
                      </summary>

                      <div className="mt-3 border-t pt-3">
                        {run.is_valid ? (
                          <>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                              {run.answer ?? "No answer text stored."}
                            </p>
                            <p className="mt-3 text-[11px] text-muted-foreground/80">
                              {engine.name} · {run.model} · {formatDateTime(run.executed_at)} ·{" "}
                              {OBSERVATION_MODES.api_observation.label} · {run.citation_count} source
                              {run.citation_count === 1 ? "" : "s"}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-destructive">
                            {run.failure_reason ?? "The provider did not return an answer."}
                          </p>
                        )}
                      </div>
                    </details>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* The activation checklist already leads with connection state, so this
          alert is only for an account that has data and a gap in coverage. */}
      {unconfigured.length > 0 && aiData.summary !== null ? (
        <Alert variant="info">
          <InfoIcon />
          <AlertTitle>
            {unconfigured.length} engine{unconfigured.length === 1 ? " is" : "s are"} not connected
          </AlertTitle>
          <AlertDescription>
            <ul className="space-y-1">
              {unconfigured.map((status) => (
                <li key={status.id}>
                  <span className="font-medium text-foreground">{status.name}:</span> {status.message}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              Engines without an authorised connection show no data. We never estimate a number to
              fill the gap.
            </p>
            <Button size="sm" variant="outline" asChild className="mt-2 w-fit">
              <Link href="/app/integrations">Open integrations</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
