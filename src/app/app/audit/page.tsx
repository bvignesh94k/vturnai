import type { Metadata } from "next";
import { GaugeIcon, PlayIcon, RefreshCwIcon, ZapIcon } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { IssueList, type IssueView } from "@/components/app/issue-list";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { ScanBanner } from "@/components/app/scan-banner";
import { SeoHealthChart } from "@/components/charts/dashboard-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { startCrawlAction, startPagespeedAction } from "@/app/app/actions";
import { loadPageContext } from "@/lib/data/project-context";
import { loadProjectActivity, loadScoreSnapshot, loadScoreTrend } from "@/lib/data/dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatDateTime, round, truncate } from "@/lib/utils";
import type { Json } from "@/lib/db/types";

export const metadata: Metadata = { title: "Website Audit" };

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "information"] as const;

function affectedUrlsFrom(evidence: Json): string[] {
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence)) return [];
  const urls = (evidence as { affectedUrls?: unknown }).affectedUrls;
  return Array.isArray(urls) ? urls.filter((url): url is string => typeof url === "string") : [];
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project, canWrite } = await loadPageContext(searchParams);
  const supabase = await createServerSupabaseClient();

  const [scores, activity, trend] = await Promise.all([
    loadScoreSnapshot(project.id),
    loadProjectActivity(project.id),
    loadScoreTrend(project.id),
  ]);

  const crawlId = activity.latestCrawl?.id ?? null;

  const [{ data: issues }, { data: pagespeed }, { data: worstPages }] = await Promise.all([
    crawlId
      ? supabase.from("page_issues").select("*").eq("crawl_id", crawlId).limit(200)
      : { data: [] },
    supabase
      .from("pagespeed_runs")
      .select("*")
      .eq("project_id", project.id)
      .order("fetched_at", { ascending: false })
      .limit(4),
    crawlId
      ? supabase
          .from("page_scores")
          .select("heo_score, seo_score, aeo_score, geo_score, citation_readiness_score, page_id")
          .eq("crawl_id", crawlId)
          .order("heo_score", { ascending: true })
          .limit(10)
      : { data: [] },
  ]);

  const issueRows = (issues ?? []).map(
    (issue): IssueView => ({
      id: issue.id,
      code: issue.issue_code,
      title: issue.title,
      description: issue.description,
      severity: issue.severity,
      disciplines: issue.disciplines,
      whyItMatters: issue.why_it_matters,
      seoImpact: issue.seo_impact,
      aeoImpact: issue.aeo_impact,
      geoImpact: issue.geo_impact,
      recommendation: issue.recommendation,
      implementationExample: issue.implementation_example,
      effort: issue.effort,
      affectedUrls: affectedUrlsFrom(issue.evidence),
    }),
  );

  const sorted = [...issueRows].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  const counts = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: issueRows.filter((issue) => issue.severity === severity).length,
  }));

  // Resolve page URLs for the lowest-scoring pages.
  const pageIds = (worstPages ?? []).map((row) => row.page_id);
  const { data: pageUrls } = pageIds.length
    ? await supabase.from("crawl_pages").select("id, url, title").in("id", pageIds)
    : { data: [] };
  const urlById = new Map((pageUrls ?? []).map((row) => [row.id, row]));

  const mobilePagespeed = (pagespeed ?? []).find((run) => run.strategy === "mobile");
  const desktopPagespeed = (pagespeed ?? []).find((run) => run.strategy === "desktop");

  return (
    <div className="space-y-6">
      {activity.activeJob ? (
        <ScanBanner
          projectId={project.id}
          initialLabel={activity.activeJob.progress_label ?? "Auditing your site…"}
          initialCurrent={activity.activeJob.progress_current}
          initialTotal={activity.activeJob.progress_total}
        />
      ) : null}

      <PageHeader
        title="Website Audit"
        description={
          activity.latestCrawl?.completed_at
            ? `Last audit ${formatDateTime(activity.latestCrawl.completed_at)} · ${activity.latestCrawl.urls_crawled} pages crawled, ${activity.latestCrawl.urls_failed} failed.`
            : "Crawl your site to find what is blocking search and AI engines."
        }
        actions={
          canWrite ? (
            <>
              <ActionButton
                action={startPagespeedAction}
                fields={{ projectId: project.id }}
                variant="outline"
                pendingLabel="Queueing…"
              >
                <ZapIcon /> Check performance
              </ActionButton>
              <ActionButton
                action={startCrawlAction}
                fields={{ projectId: project.id }}
                variant="gradient"
                pendingLabel="Starting…"
                disabled={Boolean(activity.activeJob)}
              >
                <RefreshCwIcon /> Run audit
              </ActionButton>
            </>
          ) : null
        }
      />

      {!activity.latestCrawl ? (
        <EmptyState
          icon={<GaugeIcon className="size-5" />}
          title="No audit has run yet"
          description="We will crawl your site, check indexability, metadata, headings, structured data, internal links and performance, then rank every finding by impact."
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard metricKey="seoScore" value={scores.seo} format="score" delta={scores.deltas.seo} />
            <MetricCard
              label="Pages crawled"
              value={activity.latestCrawl.urls_crawled}
              format="raw"
              footnote={`${activity.latestCrawl.urls_failed} could not be fetched`}
            />
            <MetricCard
              metricKey="criticalIssues"
              value={counts.find((entry) => entry.severity === "critical")?.count ?? 0}
              format="raw"
            />
            <MetricCard
              label="Mobile performance"
              value={mobilePagespeed?.performance_score ?? null}
              format="score"
              emptyHint="Run a performance check"
              footnote={
                mobilePagespeed
                  ? `LCP ${mobilePagespeed.lcp_ms ? `${round(mobilePagespeed.lcp_ms / 1000, 1)}s` : "—"} · CLS ${mobilePagespeed.cls ?? "—"}`
                  : undefined
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <SeoHealthChart data={trend} />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Findings by severity</CardTitle>
                <CardDescription>Work top-down. Critical issues block everything else.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-0">
                {counts.map((entry) => (
                  <div key={entry.severity} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm capitalize">
                      <Badge
                        variant={
                          entry.severity === "critical"
                            ? "destructive"
                            : entry.severity === "high"
                              ? "warning"
                              : entry.severity === "medium"
                                ? "info"
                                : "muted"
                        }
                      >
                        {entry.severity}
                      </Badge>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{entry.count}</span>
                  </div>
                ))}
                {(pagespeed ?? []).length > 0 ? (
                  <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                    Desktop performance{" "}
                    {desktopPagespeed?.performance_score !== null &&
                    desktopPagespeed?.performance_score !== undefined
                      ? round(desktopPagespeed.performance_score, 0)
                      : "—"}
                    , measured on your key pages only to stay inside API quota.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Findings */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              All findings ({sorted.length})
            </h3>
            {sorted.length === 0 ? (
              <EmptyState
                title="No issues found"
                description="Nothing was flagged in the last crawl. That is genuinely good news — check the AEO and GEO analyzers for content-level opportunities."
              />
            ) : (
              <IssueList issues={sorted} />
            )}
          </div>

          {/* Weakest pages */}
          {(worstPages ?? []).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lowest scoring pages</CardTitle>
                <CardDescription>
                  These pages drag your site average down the most. Fixing a top-traffic page here
                  usually moves the V Score fastest.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Page</TableHead>
                      <TableHead className="text-right">SEO</TableHead>
                      <TableHead className="text-right">AEO</TableHead>
                      <TableHead className="text-right">GEO</TableHead>
                      <TableHead className="text-right">Citation</TableHead>
                      <TableHead className="pr-5 text-right">V Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(worstPages ?? []).map((row) => {
                      const page = urlById.get(row.page_id);
                      return (
                        <TableRow key={row.page_id}>
                          <TableCell className="pl-5">
                            <p className="text-sm font-medium">
                              {truncate(page?.title ?? page?.url ?? "Unknown page", 60)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {truncate((page?.url ?? "").replace(/^https?:\/\//, ""), 70)}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {round(Number(row.seo_score), 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {round(Number(row.aeo_score), 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {round(Number(row.geo_score), 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {round(Number(row.citation_readiness_score), 0)}
                          </TableCell>
                          <TableCell className="pr-5 text-right">
                            <Badge variant={Number(row.heo_score) < 50 ? "destructive" : "warning"}>
                              {round(Number(row.heo_score), 0)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
