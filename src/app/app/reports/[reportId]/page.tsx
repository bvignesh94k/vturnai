import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing } from "@/components/app/score-ring";
import { PrintButton } from "@/app/app/reports/[reportId]/print-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUserContext } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SITE } from "@/lib/config/site";
import type { ReportPayload } from "@/lib/reports/builder";
import { formatDateTime, round, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Report", robots: { index: false, follow: false } };

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  await requireUserContext();
  const { reportId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: report } = await supabase.from("reports").select("*").eq("id", reportId).maybeSingle();

  if (!report) notFound();

  if (report.status !== "ready" || !report.payload) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h2 className="text-xl font-semibold tracking-tight">This report is not ready yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Status: {report.status}
          {report.error_message ? ` — ${report.error_message}` : ""}
        </p>
        <Button variant="outline" asChild className="mt-6">
          <Link href="/app/reports">
            <ArrowLeftIcon /> Back to reports
          </Link>
        </Button>
      </div>
    );
  }

  const payload = report.payload as unknown as ReportPayload;

  return (
    <article className="mx-auto max-w-4xl space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app/reports">
            <ArrowLeftIcon /> All reports
          </Link>
        </Button>
        <PrintButton>
          <PrinterIcon /> Print or save as PDF
        </PrintButton>
      </div>

      {/* Cover */}
      <header className="border-b pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {SITE.name} · Visibility Report
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{payload.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {payload.project.domain} · {payload.period.start} to {payload.period.end} · Generated{" "}
          {formatDateTime(payload.generatedAt)}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {payload.dataSources.map((source) => (
            <Badge key={source} variant="muted">
              {source}
            </Badge>
          ))}
        </div>
      </header>

      {/* Executive summary */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Executive summary</h2>
        <div className="mt-4 flex flex-wrap items-center gap-8 rounded-xl border bg-card p-6">
          <ScoreRing value={payload.executiveSummary.vScore} label="V Score" size={120} />
          <div className="min-w-0 flex-1">
            <p className="text-base leading-relaxed">{payload.executiveSummary.headline}</p>
            <ul className="mt-4 space-y-2">
              {payload.executiveSummary.keyFindings.map((finding) => (
                <li key={finding} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Scores */}
      <section className="print-break">
        <h2 className="text-lg font-semibold tracking-tight">Scores</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            { label: "SEO", value: payload.scores.seo },
            { label: "AEO", value: payload.scores.aeo },
            { label: "GEO", value: payload.scores.geo },
            { label: "Experience & Authority", value: payload.scores.experienceAuthority },
          ].map((entry) => (
            <Card key={entry.label}>
              <CardContent className="px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {entry.label}
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums">
                  {entry.value === null ? "—" : round(entry.value, 0)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{payload.scores.formula}</p>
      </section>

      {/* AI visibility */}
      <section className="print-break">
        <h2 className="text-lg font-semibold tracking-tight">AI visibility</h2>
        {!payload.aiVisibility.availability.available ? (
          <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {payload.aiVisibility.availability.reason}
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                { label: "Mention rate", value: payload.aiVisibility.summary?.mentionRate },
                { label: "Citation rate", value: payload.aiVisibility.summary?.citationRate },
                { label: "Recommendation rate", value: payload.aiVisibility.summary?.recommendationRate },
                { label: "Share of voice", value: payload.aiVisibility.summary?.shareOfVoice },
              ].map((entry) => (
                <Card key={entry.label}>
                  <CardContent className="px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {entry.label}
                    </p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums">
                      {entry.value === undefined || entry.value === null ? "—" : `${round(entry.value, 0)}%`}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">By engine</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Engine</TableHead>
                      <TableHead className="text-right">Visibility</TableHead>
                      <TableHead className="text-right">Mentions</TableHead>
                      <TableHead className="text-right">Citations</TableHead>
                      <TableHead className="pr-5">Sentiment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.aiVisibility.engines.map((engine) => (
                      <TableRow key={engine.engineId}>
                        <TableCell className="pl-5">
                          <p className="text-sm font-medium">{engine.name}</p>
                          <p className="text-xs text-muted-foreground">{engine.vendor}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {engine.validResponses > 0 ? round(engine.visibilityScore, 0) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {engine.validResponses > 0 ? engine.mentions : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {engine.validResponses > 0 ? engine.citations : "—"}
                        </TableCell>
                        <TableCell className="pr-5 capitalize">
                          {engine.validResponses > 0 ? engine.sentiment : "No data"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="border-t px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
                  All AI figures are API observations produced by calling each engine&rsquo;s official
                  developer API. They are not readings of the consumer products, and no figure here is
                  estimated.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      {/* Competitors */}
      <section className="print-break">
        <h2 className="text-lg font-semibold tracking-tight">Competitors</h2>
        {!payload.competitors.availability.available ? (
          <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {payload.competitors.availability.reason}
          </p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Mentions</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payload.competitors.rows.map((row) => (
                <TableRow key={row.brand}>
                  <TableCell>
                    {row.brand}
                    {row.isTrackedBrand ? (
                      <Badge variant="soft" className="ml-2">
                        You
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.mentions}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.share}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Search performance */}
      <section className="print-break">
        <h2 className="text-lg font-semibold tracking-tight">Organic search</h2>
        {!payload.search.availability.available || !payload.search.totals ? (
          <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {payload.search.availability.reason}
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                { label: "Clicks", value: payload.search.totals.clicks.toLocaleString("en-IN") },
                { label: "Impressions", value: payload.search.totals.impressions.toLocaleString("en-IN") },
                { label: "CTR", value: `${payload.search.totals.ctr}%` },
                { label: "Avg position", value: String(payload.search.totals.position) },
              ].map((entry) => (
                <Card key={entry.label}>
                  <CardContent className="px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {entry.label}
                    </p>
                    <p className="mt-1.5 text-xl font-semibold tabular-nums">{entry.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {payload.search.strikingDistance.length > 0 ? (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Queries ranking 4 to 20</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-5">Query</TableHead>
                        <TableHead className="text-right">Position</TableHead>
                        <TableHead className="pr-5 text-right">Impressions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payload.search.strikingDistance.map((row) => (
                        <TableRow key={row.query}>
                          <TableCell className="pl-5 text-sm">{truncate(row.query, 60)}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.position}</TableCell>
                          <TableCell className="pr-5 text-right tabular-nums">
                            {row.impressions.toLocaleString("en-IN")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </section>

      {/* AI referral traffic */}
      <section className="print-break">
        <h2 className="text-lg font-semibold tracking-tight">AI referral traffic</h2>
        {!payload.aiReferralTraffic.availability.available ? (
          <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {payload.aiReferralTraffic.availability.reason}
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm">
              <span className="text-2xl font-semibold tabular-nums">
                {payload.aiReferralTraffic.totalSessions.toLocaleString("en-IN")}
              </span>{" "}
              sessions arrived from identifiable AI assistants.
            </p>
            <ul className="mt-3 space-y-1.5">
              {payload.aiReferralTraffic.bySource.map((source) => (
                <li key={source.source} className="flex justify-between gap-4 text-sm">
                  <span>{source.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {source.sessions.toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {payload.aiReferralTraffic.caveat}
        </p>
      </section>

      {/* Issues */}
      <section className="print-break">
        <h2 className="text-lg font-semibold tracking-tight">Top issues</h2>
        <ul className="mt-4 space-y-3">
          {payload.topIssues.map((issue) => (
            <li key={issue.title} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    issue.severity === "critical"
                      ? "destructive"
                      : issue.severity === "high"
                        ? "warning"
                        : "muted"
                  }
                  className="capitalize"
                >
                  {issue.severity}
                </Badge>
                <p className="text-sm font-medium">{issue.title}</p>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {issue.recommendation}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Action plan */}
      <section className="print-break">
        <h2 className="text-lg font-semibold tracking-tight">Recommended action plan</h2>
        <ol className="mt-4 space-y-3">
          {payload.actionPlan.map((step) => (
            <li key={step.step} className="flex gap-4 rounded-lg border p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {step.step}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.why}</p>
                <p className="mt-2 text-sm leading-relaxed">{step.how}</p>
                <Badge variant="outline" className="mt-2 capitalize">
                  {step.effort}
                </Badge>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t pt-6 text-xs leading-relaxed text-muted-foreground">
        <p>
          Generated by {SITE.name} on {formatDateTime(payload.generatedAt)}. Data sources:{" "}
          {payload.dataSources.join(", ")}.
        </p>
        <p className="mt-2">
          {SITE.name} is an independent product and is not affiliated with, endorsed by, or sponsored
          by OpenAI, Google, Anthropic, Perplexity, xAI or Microsoft. Scores are analytical opinions
          derived from published methodology, and no result guarantees any ranking, mention or
          citation.
        </p>
      </footer>
    </article>
  );
}
