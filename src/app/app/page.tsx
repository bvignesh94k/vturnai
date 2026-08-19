import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BotIcon,
  ListChecksIcon,
  PlayIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { EngineGrid } from "@/components/app/engine-grid";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { ScanBanner } from "@/components/app/scan-banner";
import { ScoreCards } from "@/components/app/score-cards";
import {
  AiVisibilityTrendChart,
  EngineComparisonChart,
  ScoreTrendChart,
  ShareOfVoiceChart,
} from "@/components/charts/dashboard-charts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { startAiScanAction, startCrawlAction } from "@/app/app/actions";
import { ENGINES, type EngineId } from "@/lib/config/engines";
import { loadPageContext } from "@/lib/data/project-context";
import {
  loadAiVisibility,
  loadProjectActivity,
  loadScoreSnapshot,
  loadScoreTrend,
  loadSearchSnapshot,
} from "@/lib/data/dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PRIORITY_BAND_LABELS, priorityBand } from "@/lib/metrics/opportunity-priority";
import { formatDateTime, round } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project, entitlements, canWrite } = await loadPageContext(searchParams);

  const supabase = await createServerSupabaseClient();
  const [scores, aiData, search, trend, activity, { data: topOpportunities }] = await Promise.all([
    loadScoreSnapshot(project.id),
    loadAiVisibility({ projectId: project.id, brandName: project.brand_name }),
    loadSearchSnapshot(project.id),
    loadScoreTrend(project.id),
    loadProjectActivity(project.id),
    supabase
      .from("opportunities")
      .select("id, title, priority_score, expected_impact, effort, affected_page_count, disciplines")
      .eq("project_id", project.id)
      .eq("status", "open")
      .order("priority_score", { ascending: false })
      .limit(5),
  ]);

  const hasScanned = scores.vScore !== null;
  const hasAiData = aiData.summary !== null;
  const opportunities = topOpportunities ?? [];

  return (
    <div className="space-y-6">
      {activity.activeJob ? (
        <ScanBanner
          projectId={project.id}
          initialLabel={activity.activeJob.progress_label ?? "Working on your site…"}
          initialCurrent={activity.activeJob.progress_current}
          initialTotal={activity.activeJob.progress_total}
        />
      ) : null}

      <PageHeader
        title={`How visible is ${project.brand_name}?`}
        description={
          scores.capturedAt
            ? `Last measured ${formatDateTime(scores.capturedAt)} across ${activity.totalPages.toLocaleString("en-IN")} crawled pages.`
            : "Run your first audit to establish a baseline."
        }
        actions={
          canWrite ? (
            <>
              <ActionButton
                action={startCrawlAction}
                fields={{ projectId: project.id }}
                variant="outline"
                pendingLabel="Starting…"
                disabled={Boolean(activity.activeJob)}
              >
                <RefreshCwIcon /> Run audit
              </ActionButton>
              <ActionButton
                action={startAiScanAction}
                fields={{ projectId: project.id }}
                variant="gradient"
                pendingLabel="Starting…"
                disabled={Boolean(activity.activeJob)}
              >
                <PlayIcon /> Run AI visibility scan
              </ActionButton>
            </>
          ) : null
        }
      />

      {!entitlements.isActive ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>Your plan is not active</AlertTitle>
          <AlertDescription>
            <p>{entitlements.blockedReason}</p>
            <Button size="sm" variant="outline" asChild className="mt-2 w-fit">
              <Link href="/app/billing">Go to billing</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!hasScanned ? (
        <EmptyState
          icon={<RefreshCwIcon className="size-5" />}
          title="No scores yet"
          description="Run your first website audit. We will crawl your pages, score them for SEO, AEO and GEO, and build your prioritised action list."
          action={
            canWrite ? (
              <ActionButton action={startCrawlAction} fields={{ projectId: project.id }} variant="gradient">
                <PlayIcon /> Run first audit
              </ActionButton>
            ) : null
          }
        />
      ) : (
        <>
          {/* How visible am I? */}
          <ScoreCards snapshot={scores} />

          {/* Where am I visible? */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              metricKey="aiShareOfVoice"
              value={aiData.summary?.shareOfVoice ?? null}
              format="percent"
              delta={
                aiData.summary && aiData.previousSummary
                  ? round(aiData.summary.shareOfVoice - aiData.previousSummary.shareOfVoice, 1)
                  : null
              }
              emptyHint="Run an AI scan with competitors to measure"
            />
            <MetricCard
              metricKey="brandMentionRate"
              value={aiData.summary?.mentionRate ?? null}
              format="percent"
              delta={
                aiData.summary && aiData.previousSummary
                  ? round(aiData.summary.mentionRate - aiData.previousSummary.mentionRate, 1)
                  : null
              }
              emptyHint="No AI visibility data yet"
            />
            <MetricCard
              metricKey="citationRate"
              value={aiData.summary?.citationRate ?? null}
              format="percent"
              delta={
                aiData.summary && aiData.previousSummary
                  ? round(aiData.summary.citationRate - aiData.previousSummary.citationRate, 1)
                  : null
              }
              emptyHint="No AI visibility data yet"
            />
            <MetricCard
              metricKey="recommendationRate"
              value={aiData.summary?.recommendationRate ?? null}
              format="percent"
              delta={
                aiData.summary && aiData.previousSummary
                  ? round(
                      aiData.summary.recommendationRate - aiData.previousSummary.recommendationRate,
                      1,
                    )
                  : null
              }
              emptyHint="No AI visibility data yet"
            />
            <MetricCard
              metricKey="citationReadiness"
              label="Prompt coverage"
              value={aiData.summary?.promptCoverage ?? null}
              format="percent"
              emptyHint="No AI visibility data yet"
              footnote={`${aiData.trackedPrompts} prompts active`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              metricKey="trackedPrompts"
              value={aiData.trackedPrompts}
              format="raw"
              footnote={`of ${entitlements.limits.activePrompts} on your plan`}
            />
            <MetricCard
              metricKey="enginesMonitoring"
              value={aiData.activeEngines}
              format="raw"
              footnote={aiData.lastScanLabel ?? "No scan completed yet"}
            />
            <MetricCard
              metricKey="googleClicks"
              value={search.connected ? search.clicks : null}
              delta={search.deltas.clicks}
              emptyHint="Connect Google Search Console"
            />
            <MetricCard
              metricKey="googleImpressions"
              value={search.connected ? search.impressions : null}
              delta={search.deltas.impressions}
              emptyHint="Connect Google Search Console"
            />
            <MetricCard
              metricKey="averagePosition"
              value={search.connected && search.position > 0 ? search.position : null}
              format="raw"
              delta={search.deltas.position}
              deltaDirection="higher-is-better"
              emptyHint="Connect Google Search Console"
              footnote="Lower is better"
            />
          </div>

          {/* What is wrong? What next? */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecksIcon className="size-4 text-primary" />
                  What to do next
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {opportunities.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No open opportunities. Run an audit to generate your action list.
                  </p>
                ) : (
                  <ol className="divide-y">
                    {opportunities.map((opportunity, index) => {
                      const band = priorityBand(Number(opportunity.priority_score));
                      return (
                        <li key={opportunity.id} className="flex items-start gap-4 py-3.5 first:pt-0">
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug">{opportunity.title}</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {opportunity.expected_impact}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant={
                                  band === "urgent"
                                    ? "destructive"
                                    : band === "high"
                                      ? "warning"
                                      : "muted"
                                }
                              >
                                {PRIORITY_BAND_LABELS[band]}
                              </Badge>
                              <Badge variant="outline">{opportunity.effort}</Badge>
                              {opportunity.affected_page_count > 0 ? (
                                <Badge variant="muted">
                                  {opportunity.affected_page_count} page
                                  {opportunity.affected_page_count === 1 ? "" : "s"}
                                </Badge>
                              ) : null}
                              {opportunity.disciplines.map((discipline) => (
                                <Badge key={discipline} variant="soft" className="uppercase">
                                  {discipline}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                <Button variant="outline" size="sm" asChild className="mt-4 w-full">
                  <Link href="/app/opportunities">
                    See all {activity.openOpportunities} opportunities <ArrowRightIcon />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <MetricCard
                metricKey="criticalIssues"
                value={activity.criticalIssues}
                format="raw"
                footnote={
                  activity.criticalIssues === 0
                    ? "Nothing critical is blocking you"
                    : "Fix these before anything else"
                }
              />
              <Card>
                <CardContent className="px-5 py-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Do first
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {activity.urgentOpportunities}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    High-priority actions waiting. These move your V Score fastest for the effort.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* AI engine grid */}
          {hasAiData ? (
            <EngineGrid rows={aiData.engineRows} providerStatuses={aiData.providerStatuses} />
          ) : (
            <EmptyState
              icon={<BotIcon className="size-5" />}
              title="No AI visibility data yet."
              description="Run your first AI visibility scan to see whether ChatGPT, Gemini, Claude, Perplexity and Grok mention or cite your brand."
              action={
                canWrite ? (
                  <ActionButton
                    action={startAiScanAction}
                    fields={{ projectId: project.id }}
                    variant="gradient"
                  >
                    <PlayIcon /> Run AI Visibility Scan
                  </ActionButton>
                ) : null
              }
              secondaryAction={
                <Button variant="outline" asChild>
                  <Link href="/app/prompts">Review tracked prompts</Link>
                </Button>
              }
            />
          )}

          {/* Charts — kept to four so the screen stays readable */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ScoreTrendChart data={trend} />
            <AiVisibilityTrendChart data={trend} />
            <ShareOfVoiceChart data={aiData.shareOfVoice} />
            <EngineComparisonChart
              data={aiData.engineRows
                .filter((row) => row.validResponses > 0)
                .map((row) => ({
                  engine: ENGINES[row.engineId as EngineId].name,
                  mentionRate: row.mentionRate,
                  citationRate: row.citationRate,
                  recommendationRate: row.recommendationRate,
                }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
