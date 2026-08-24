import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLinkIcon, QuoteIcon } from "lucide-react";
import { FactorFixList } from "@/components/app/factor-fix-list";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { ScoreBreakdown } from "@/components/app/score-breakdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SUGGESTION_GROUP_LABELS } from "@/lib/analysis/types";
import { IDEAL_ANSWER_MAX_WORDS, IDEAL_ANSWER_MIN_WORDS } from "@/lib/analysis/aeo";
import { loadPageContext } from "@/lib/data/project-context";
import { loadProjectActivity, loadScoreSnapshot } from "@/lib/data/dashboard";
import { averageComponents, factorFixes, loadPageAnalysis } from "@/lib/data/page-analysis";
import { round, truncate, unique } from "@/lib/utils";

export const metadata: Metadata = { title: "AEO Analyzer" };

export default async function AeoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project } = await loadPageContext(searchParams);

  const [scores, activity] = await Promise.all([
    loadScoreSnapshot(project.id),
    loadProjectActivity(project.id),
  ]);

  const pages = await loadPageAnalysis({
    projectId: project.id,
    crawlId: activity.latestCrawl?.id ?? null,
    orderBy: "aeo_score",
    limit: 40,
  });

  const components = averageComponents(pages, (row) => row.aeoComponents);
  const suggestions = unique(
    pages
      .flatMap((page) => page.suggestions)
      .filter((suggestion) => suggestion.discipline === "aeo")
      .map((suggestion) => JSON.stringify({ group: suggestion.group, title: suggestion.title, detail: suggestion.detail, example: suggestion.example })),
  )
    .map((entry) => JSON.parse(entry) as { group: string; title: string; detail: string; example?: string })
    .slice(0, 8);

  const fixes = factorFixes(pages, (row) => row.aeoComponents, { limit: 4 });

  if (pages.length === 0) {
    return (
      <div>
        <PageHeader
          title="AEO Analyzer"
          description="How ready your pages are to be lifted as a direct answer to a question."
        />
        <EmptyState
          icon={<QuoteIcon className="size-5" />}
          title="No answer-readiness data yet"
          description="Run a website audit first. We score every crawled page on question targeting, direct answers, FAQs, tables, schema and supporting evidence."
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
        title="AEO Analyzer"
        description="Answer engines quote one passage. This page shows whether your pages have a passage worth quoting."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard metricKey="aeoScore" value={scores.aeo} format="score" delta={scores.deltas.aeo} />
        <MetricCard
          label="Pages analysed"
          value={pages.length}
          format="raw"
          footnote="From your most recent crawl"
        />
        <MetricCard
          label="Pages below 50"
          value={pages.filter((page) => page.aeoScore < 50).length}
          format="raw"
          footnote="These need work before they can be quoted"
        />
        <MetricCard
          label="Strong pages"
          value={pages.filter((page) => page.aeoScore >= 70).length}
          format="raw"
          footnote="Ready to be lifted as an answer"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ScoreBreakdown
          title="What is holding your AEO score back"
          description="Each factor averaged across the pages we analysed, with the weight it carries."
          score={scores.aeo ?? 0}
          components={components}
        />

        <div className="space-y-4">
          <FactorFixList fixes={fixes} currentScore={scores.aeo ?? 0} discipline="AEO" />

          {suggestions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recommended changes</CardTitle>
                <CardDescription>
                  Generated from what is actually missing on your pages, not from a template.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {suggestions.map((suggestion) => (
                  <div key={suggestion.title} className="rounded-lg border p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          suggestion.group === "must-fix"
                            ? "destructive"
                            : suggestion.group === "high-impact"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {SUGGESTION_GROUP_LABELS[
                          suggestion.group as keyof typeof SUGGESTION_GROUP_LABELS
                        ] ?? suggestion.group}
                      </Badge>
                      <p className="text-sm font-medium">{suggestion.title}</p>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {suggestion.detail}
                    </p>
                    {suggestion.example ? (
                      <pre className="scrollbar-thin mt-2 overflow-x-auto rounded-md border bg-secondary/50 p-2.5 text-[11px] leading-relaxed">
                        <code>{suggestion.example}</code>
                      </pre>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pages ranked by answer readiness</CardTitle>
          <CardDescription>
            A strong page has a question-style heading with a {IDEAL_ANSWER_MIN_WORDS}–
            {IDEAL_ANSWER_MAX_WORDS} word self-contained answer directly beneath it.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Page</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Words</TableHead>
                <TableHead className="pr-5 text-right">AEO score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.slice(0, 25).map((page) => (
                <TableRow key={page.pageId}>
                  <TableCell className="pl-5">
                    <p className="text-sm font-medium">
                      {truncate(page.title ?? page.url, 60)}
                    </p>
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
                  <TableCell>
                    <Badge variant="muted" className="capitalize">
                      {page.classification ?? "other"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {page.wordCount.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Badge
                      variant={
                        page.aeoScore >= 70 ? "success" : page.aeoScore >= 50 ? "warning" : "destructive"
                      }
                    >
                      {round(page.aeoScore, 0)}
                    </Badge>
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
