import type { Metadata } from "next";
import { TrophyIcon, UsersIcon } from "lucide-react";
import { CompetitorManager } from "@/app/app/competitors/competitor-manager";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { ShareOfVoiceChart } from "@/components/charts/dashboard-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadPageContext } from "@/lib/data/project-context";
import { loadAiVisibility } from "@/lib/data/dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { percentage, round } from "@/lib/utils";

export const metadata: Metadata = { title: "Competitors" };

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project, entitlements, canWrite } = await loadPageContext(searchParams);
  const supabase = await createServerSupabaseClient();

  const [aiData, { data: competitors }, { data: mentions }, { data: prompts }] = await Promise.all([
    loadAiVisibility({ projectId: project.id, brandName: project.brand_name }),
    supabase
      .from("competitors")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_competitor_mentions")
      .select("brand_name, mentioned, recommended, ai_run_id")
      .eq("project_id", project.id)
      .limit(4000),
    supabase
      .from("prompts")
      .select("id, prompt_text")
      .eq("project_id", project.id)
      .eq("is_active", true)
      .limit(100),
  ]);

  const competitorRows = competitors ?? [];
  const mentionRows = mentions ?? [];

  // Per-competitor performance across every recorded run.
  const totalRuns = new Set(mentionRows.map((row) => row.ai_run_id)).size;
  const perCompetitor = competitorRows.map((competitor) => {
    const rows = mentionRows.filter((row) => row.brand_name === competitor.brand_name);
    const mentioned = rows.filter((row) => row.mentioned).length;
    const recommended = rows.filter((row) => row.recommended).length;
    return {
      id: competitor.id,
      brandName: competitor.brand_name,
      domain: competitor.domain,
      siteUrl: competitor.site_url,
      mentions: mentioned,
      recommendations: recommended,
      mentionRate: percentage(mentioned, totalRuns),
      recommendationRate: percentage(recommended, totalRuns),
    };
  });

  const brandMentionRate = aiData.summary?.mentionRate ?? 0;
  const brandRecommendationRate = aiData.summary?.recommendationRate ?? 0;

  // "Why they win": competitors ahead of you, and by how much.
  const ahead = perCompetitor
    .filter((entry) => entry.mentionRate > brandMentionRate)
    .sort((a, b) => b.mentionRate - a.mentionRate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competitors"
        description="Who gets named instead of you, on which questions, and what you can do about it."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          metricKey="aiShareOfVoice"
          value={aiData.summary?.shareOfVoice ?? null}
          format="percent"
          emptyHint="Run an AI scan to measure"
        />
        <MetricCard
          label="Your mention rate"
          value={aiData.summary?.mentionRate ?? null}
          format="percent"
          emptyHint="No AI data yet"
        />
        <MetricCard
          label="Competitors tracked"
          value={competitorRows.length}
          format="raw"
          footnote={`of ${entitlements.limits.competitors} on your plan`}
        />
        <MetricCard
          label="Ahead of you"
          value={ahead.length}
          format="raw"
          footnote={
            ahead.length === 0
              ? "You lead on mention rate"
              : "Competitors named more often than you"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <ShareOfVoiceChart data={aiData.shareOfVoice} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Head to head</CardTitle>
            <CardDescription>
              Mention and recommendation rates across every AI answer we have recorded.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {totalRuns === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">
                No AI runs recorded yet. Run an AI visibility scan to populate this comparison.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Brand</TableHead>
                    <TableHead className="text-right">Mentioned</TableHead>
                    <TableHead className="pr-5 text-right">Recommended</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="pl-5">
                      <span className="flex items-center gap-2">
                        <Badge variant="soft">You</Badge>
                        <span className="text-sm font-medium">{project.brand_name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-semibold">
                      {round(brandMentionRate, 0)}%
                    </TableCell>
                    <TableCell className="pr-5 text-right tabular-nums text-sm font-semibold">
                      {round(brandRecommendationRate, 0)}%
                    </TableCell>
                  </TableRow>

                  {perCompetitor
                    .sort((a, b) => b.mentionRate - a.mentionRate)
                    .map((competitor) => (
                      <TableRow key={competitor.id}>
                        <TableCell className="pl-5">
                          <p className="text-sm">{competitor.brandName}</p>
                          {competitor.domain ? (
                            <p className="text-xs text-muted-foreground">{competitor.domain}</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {round(competitor.mentionRate, 0)}%
                          {competitor.mentionRate > brandMentionRate ? (
                            <Badge variant="destructive" className="ml-2">
                              +{round(competitor.mentionRate - brandMentionRate, 0)}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="pr-5 text-right tabular-nums text-sm">
                          {round(competitor.recommendationRate, 0)}%
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Why they win / how to compete */}
      {totalRuns > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrophyIcon className="size-4 text-[var(--warning)]" />
                Why they win
              </CardTitle>
              <CardDescription>
                Based on the answers we recorded, not on generic advice.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {ahead.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tracked competitor is mentioned more often than you. Keep the lead by widening
                  prompt coverage.
                </p>
              ) : (
                ahead.slice(0, 4).map((competitor) => (
                  <div key={competitor.id} className="rounded-lg border bg-secondary/40 p-3.5">
                    <p className="text-sm font-medium">{competitor.brandName}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Named in {round(competitor.mentionRate, 0)}% of answers against your{" "}
                      {round(brandMentionRate, 0)}%, and recommended in{" "}
                      {round(competitor.recommendationRate, 0)}%. Engines are finding enough about
                      them to state an opinion, and less about you.
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersIcon className="size-4 text-primary" />
                How you can compete
              </CardTitle>
              <CardDescription>Concrete moves, drawn from your own gaps.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2.5">
                {[
                  aiData.summary && aiData.summary.citationRate < 20
                    ? "Your citation rate is low. Add specific facts, statistics, sources, a named author and a visible updated date to the pages you want cited."
                    : null,
                  aiData.summary && aiData.summary.promptCoverage < 60
                    ? `You are absent from ${round(100 - (aiData.summary.promptCoverage ?? 0), 0)}% of your tracked prompts. Publish a page that genuinely answers each one you are missing.`
                    : null,
                  ahead.length > 0
                    ? `Create an honest comparison page covering ${ahead
                        .slice(0, 2)
                        .map((entry) => entry.brandName)
                        .join(" and ")}. Comparison pages are quoted heavily by answer engines.`
                    : null,
                  aiData.summary && aiData.summary.engineConsistency < 60
                    ? "You appear on some engines and not others. That is usually a source-coverage gap: strengthen your presence on the third-party sites those engines cite."
                    : null,
                  "Add original data only you have. A single proprietary statistic is quoted far more often than a page of well-written description.",
                ]
                  .filter((entry): entry is string => entry !== null)
                  .map((action, index) => (
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
        </div>
      ) : null}

      <CompetitorManager
        projectId={project.id}
        competitors={competitorRows.map((competitor) => ({
          id: competitor.id,
          brandName: competitor.brand_name,
          domain: competitor.domain,
          siteUrl: competitor.site_url,
          notes: competitor.notes,
        }))}
        limit={entitlements.limits.competitors}
        canWrite={canWrite}
        activePrompts={(prompts ?? []).length}
      />
    </div>
  );
}
