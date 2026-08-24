import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon, ExternalLinkIcon, SparklesIcon } from "lucide-react";
import { FactorFixList } from "@/components/app/factor-fix-list";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { ScoreBreakdown } from "@/components/app/score-breakdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricInfo } from "@/components/ui/metric-info";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METRIC_EXPLANATIONS } from "@/lib/config/metric-explanations";
import { loadPageContext } from "@/lib/data/project-context";
import { loadProjectActivity, loadScoreSnapshot } from "@/lib/data/dashboard";
import { averageComponents, factorFixes, loadPageAnalysis } from "@/lib/data/page-analysis";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { round, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "GEO Analyzer" };

interface ConflictingValue {
  value: string;
  urls: string[];
}

export default async function GeoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project } = await loadPageContext(searchParams);
  const supabase = await createServerSupabaseClient();

  const [scores, activity, { data: entityProfile }, { data: entityIssues }] = await Promise.all([
    loadScoreSnapshot(project.id),
    loadProjectActivity(project.id),
    supabase.from("entity_profiles").select("*").eq("project_id", project.id).maybeSingle(),
    supabase
      .from("entity_issues")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const pages = await loadPageAnalysis({
    projectId: project.id,
    crawlId: activity.latestCrawl?.id ?? null,
    orderBy: "geo_score",
    limit: 40,
  });

  const components = averageComponents(pages, (row) => row.geoComponents);
  const geoFixes = factorFixes(pages, (row) => row.geoComponents, { limit: 4 });
  const citationComponents = averageComponents(pages, (row) => row.citationComponents);
  const blockedCrawlers = activity.latestCrawl?.ai_crawlers_blocked ?? [];

  const citationActions = [...new Set(pages.flatMap((page) => page.citationRecommendations))].slice(0, 6);

  if (pages.length === 0) {
    return (
      <div>
        <PageHeader
          title="GEO Analyzer"
          description="How easily a generative engine can understand who you are, trust what you say, and cite you."
        />
        <EmptyState
          icon={<SparklesIcon className="size-5" />}
          title="No generative-engine data yet"
          description="Run a website audit first. We score every page on entity clarity, citation-worthy statements, original data, expert authorship and AI crawler accessibility."
          action={
            <Button variant="gradient" asChild>
              <Link href="/app/audit">Go to Website Audit</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GEO Analyzer"
        description="Generative engines cite what they can verify. This page shows how verifiable you look to them."
      />

      {blockedCrawlers.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>
            robots.txt blocks {blockedCrawlers.length} AI crawler
            {blockedCrawlers.length === 1 ? "" : "s"} from your site
          </AlertTitle>
          <AlertDescription>
            <p>
              Blocked: {blockedCrawlers.join(", ")}. These are the crawlers AI answer engines use to
              read your pages. While they are blocked, those engines cannot cite you no matter how
              good your content is.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard metricKey="geoScore" value={scores.geo} format="score" delta={scores.deltas.geo} />
        <MetricCard
          metricKey="entityConsistency"
          value={entityProfile ? Number(entityProfile.consistency_score) : null}
          format="score"
          emptyHint="Run an audit to measure"
        />
        <MetricCard
          metricKey="citationReadiness"
          label="Avg citation readiness"
          value={
            pages.length > 0
              ? round(
                  pages.reduce((sum, page) => sum + page.citationReadinessScore, 0) / pages.length,
                  1,
                )
              : null
          }
          format="score"
        />
        <MetricCard
          label="Entity conflicts"
          value={(entityIssues ?? []).length}
          format="raw"
          footnote={
            (entityIssues ?? []).length === 0
              ? "Your pages agree with each other"
              : "Contradictions make engines hesitate"
          }
        />
      </div>

      {/* Entity consistency */}
      {(entityIssues ?? []).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              Entity consistency issues
              <MetricInfo explanation={METRIC_EXPLANATIONS.entityConsistency} />
            </CardTitle>
            <CardDescription>
              Your own pages state different facts about your company. An AI engine that cannot tell
              which is true will usually say nothing about you at all.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {(entityIssues ?? []).map((issue) => {
              const values = Array.isArray(issue.conflicting_values)
                ? (issue.conflicting_values as unknown as ConflictingValue[])
                : [];
              return (
                <div key={issue.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="warning" className="capitalize">
                      {issue.field.replace(/_/g, " ")}
                    </Badge>
                    <p className="text-sm font-medium">{issue.description}</p>
                  </div>

                  {values.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {values.slice(0, 5).map((entry) => (
                        <li key={entry.value} className="text-xs">
                          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">
                            {truncate(entry.value, 60)}
                          </span>
                          {entry.urls?.length ? (
                            <span className="ml-2 text-muted-foreground">
                              on {entry.urls.length} page{entry.urls.length === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {issue.recommendation}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <FactorFixList fixes={geoFixes} currentScore={scores.geo ?? 0} discipline="GEO" />

      <div className="grid gap-4 lg:grid-cols-2">
        <ScoreBreakdown
          title="Generative engine readiness"
          description="Each GEO factor averaged across the pages we analysed."
          score={scores.geo ?? 0}
          components={components}
        />
        <ScoreBreakdown
          title="Citation readiness"
          description="What makes your pages quotable, or not."
          score={
            pages.length > 0
              ? round(
                  pages.reduce((sum, page) => sum + page.citationReadinessScore, 0) / pages.length,
                  1,
                )
              : 0
          }
          components={citationComponents}
        />
      </div>

      {citationActions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How to become more citable</CardTitle>
            <CardDescription>
              Derived from what your pages are actually missing. We cannot guarantee a citation (no
              tool can), but these are the factors engines demonstrably reward.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2.5">
              {citationActions.map((action, index) => (
                <li key={action} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-relaxed">{action}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Entity profile */}
      {entityProfile ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What your site says about your company</CardTitle>
            <CardDescription>
              This is the entity picture an AI engine can build from your pages. Gaps here are gaps
              in how confidently you can be described.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Organization name", value: entityProfile.organization_name },
                { label: "Description", value: entityProfile.description },
                { label: "Contact email", value: entityProfile.contact_email },
                { label: "Contact phone", value: entityProfile.contact_phone },
                { label: "Address", value: entityProfile.contact_address },
                {
                  label: "Entity references (sameAs)",
                  value: entityProfile.same_as_urls.length
                    ? `${entityProfile.same_as_urls.length} linked profiles`
                    : null,
                },
                {
                  label: "Products",
                  value: entityProfile.products.length ? entityProfile.products.join(", ") : null,
                },
                {
                  label: "Services",
                  value: entityProfile.services.length ? entityProfile.services.join(", ") : null,
                },
              ].map((entry) => (
                <div key={entry.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {entry.label}
                  </dt>
                  <dd
                    className={
                      entry.value
                        ? "mt-1 text-sm leading-relaxed"
                        : "mt-1 text-sm text-muted-foreground/70"
                    }
                  >
                    {entry.value ? truncate(String(entry.value), 200) : "Not found on your site"}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pages hardest for AI engines to cite</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Page</TableHead>
                <TableHead className="text-right">GEO</TableHead>
                <TableHead className="pr-5 text-right">Citation readiness</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.slice(0, 20).map((page) => (
                <TableRow key={page.pageId}>
                  <TableCell className="pl-5">
                    <p className="text-sm font-medium">{truncate(page.title ?? page.url, 60)}</p>
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                    >
                      {truncate(page.url.replace(/^https?:\/\//, ""), 60)}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={
                        page.geoScore >= 70 ? "success" : page.geoScore >= 50 ? "warning" : "destructive"
                      }
                    >
                      {round(page.geoScore, 0)}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-5 text-right tabular-nums text-sm">
                    {round(page.citationReadinessScore, 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
