import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ScoreComponent } from "@/lib/metrics/scores";
import type { AnalysisSuggestion } from "@/lib/analysis/types";
import type { Json } from "@/lib/db/types";
import { round } from "@/lib/utils";

/**
 * Reads the per-page analysis written by the page_analysis job.
 *
 * The breakdown column stores the score components exactly as computed, so the
 * AEO and GEO pages render the real calculation rather than recomputing it with
 * a subtly different implementation.
 */

export interface PageAnalysisRow {
  pageId: string;
  url: string;
  title: string | null;
  classification: string | null;
  wordCount: number;
  seoScore: number;
  aeoScore: number;
  geoScore: number;
  heoScore: number;
  citationReadinessScore: number;
  aeoComponents: ScoreComponent[];
  geoComponents: ScoreComponent[];
  citationComponents: ScoreComponent[];
  citationRecommendations: string[];
  suggestions: AnalysisSuggestion[];
}

function readComponents(breakdown: Json, key: string): ScoreComponent[] {
  if (typeof breakdown !== "object" || breakdown === null || Array.isArray(breakdown)) return [];
  const value = (breakdown as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ScoreComponent =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as ScoreComponent).key === "string" &&
      typeof (entry as ScoreComponent).score === "number",
  );
}

function readStrings(breakdown: Json, key: string): string[] {
  if (typeof breakdown !== "object" || breakdown === null || Array.isArray(breakdown)) return [];
  const value = (breakdown as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readSuggestions(breakdown: Json): AnalysisSuggestion[] {
  if (typeof breakdown !== "object" || breakdown === null || Array.isArray(breakdown)) return [];
  const value = (breakdown as Record<string, unknown>)["suggestions"];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is AnalysisSuggestion =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as AnalysisSuggestion).title === "string" &&
      typeof (entry as AnalysisSuggestion).group === "string",
  );
}

export async function loadPageAnalysis(input: {
  projectId: string;
  crawlId: string | null;
  orderBy: "aeo_score" | "geo_score" | "citation_readiness_score" | "heo_score";
  limit?: number;
}): Promise<PageAnalysisRow[]> {
  if (!input.crawlId) return [];
  const supabase = await createServerSupabaseClient();

  const { data: scores } = await supabase
    .from("page_scores")
    .select("*")
    .eq("crawl_id", input.crawlId)
    .order(input.orderBy, { ascending: true })
    .limit(input.limit ?? 40);

  const rows = scores ?? [];
  if (rows.length === 0) return [];

  const { data: pages } = await supabase
    .from("crawl_pages")
    .select("id, url, title, content_classification, word_count")
    .in(
      "id",
      rows.map((row) => row.page_id),
    );

  const pageById = new Map((pages ?? []).map((page) => [page.id, page]));

  return rows.map((row) => {
    const page = pageById.get(row.page_id);
    return {
      pageId: row.page_id,
      url: page?.url ?? "",
      title: page?.title ?? null,
      classification: page?.content_classification ?? null,
      wordCount: page?.word_count ?? 0,
      seoScore: round(Number(row.seo_score), 1),
      aeoScore: round(Number(row.aeo_score), 1),
      geoScore: round(Number(row.geo_score), 1),
      heoScore: round(Number(row.heo_score), 1),
      citationReadinessScore: round(Number(row.citation_readiness_score), 1),
      aeoComponents: readComponents(row.breakdown, "aeo"),
      geoComponents: readComponents(row.breakdown, "geo"),
      citationComponents: readComponents(row.breakdown, "citationReadiness"),
      citationRecommendations: readStrings(row.breakdown, "citationRecommendations"),
      suggestions: readSuggestions(row.breakdown),
    };
  });
}

export interface FactorFix {
  key: string;
  label: string;
  description?: string;
  /** Site-wide average for this factor, 0 to 100. */
  score: number;
  /** Points the overall discipline score gains if this factor reaches 100. */
  pointsAvailable: number;
  /** How many analysed pages score below the passing threshold on it. */
  failingPages: number;
  totalPages: number;
  /** The worst offenders, so the work starts somewhere specific. */
  worstPages: Array<{ pageId: string; url: string; title: string | null; score: number }>;
}

/**
 * Turn a weak score component into a piece of work someone can start.
 *
 * A factor bar reading "Structured data 37" tells a marketer they are losing
 * points but not where the loss is or what recovering it is worth. This pairs
 * each factor with the pages that actually fail it and the points the discipline
 * score gains if it were fixed, so the list can be worked top-down by value.
 */
export function factorFixes(
  rows: readonly PageAnalysisRow[],
  pick: (row: PageAnalysisRow) => ScoreComponent[],
  options: { limit?: number; passingScore?: number; worstPagesPerFactor?: number } = {},
): FactorFix[] {
  const passing = options.passingScore ?? 60;
  const perFactor = options.worstPagesPerFactor ?? 3;

  const byKey = new Map<
    string,
    { component: ScoreComponent; sum: number; count: number; failing: number; pages: FactorFix["worstPages"] }
  >();

  for (const row of rows) {
    for (const component of pick(row)) {
      const entry = byKey.get(component.key) ?? {
        component,
        sum: 0,
        count: 0,
        failing: 0,
        pages: [] as FactorFix["worstPages"],
      };
      entry.sum += component.score;
      entry.count += 1;
      if (component.score < passing) {
        entry.failing += 1;
        entry.pages.push({
          pageId: row.pageId,
          url: row.url,
          title: row.title,
          score: round(component.score, 0),
        });
      }
      byKey.set(component.key, entry);
    }
  }

  return [...byKey.values()]
    .map(({ component, sum, count, failing, pages }) => {
      const score = round(sum / count, 1);
      return {
        key: component.key,
        label: component.label,
        description: component.description,
        score,
        // contribution is score * weight, so closing the gap to 100 is worth
        // exactly the remaining share of this factor's weight.
        pointsAvailable: round((100 - score) * component.weight, 1),
        failingPages: failing,
        totalPages: count,
        worstPages: pages.sort((a, b) => a.score - b.score).slice(0, perFactor),
      };
    })
    .filter((fix) => fix.pointsAvailable > 0)
    .sort((a, b) => b.pointsAvailable - a.pointsAvailable)
    .slice(0, options.limit ?? 4);
}

/**
 * Average each score component across pages, so a discipline page can show
 * where the whole site is weak rather than only one URL.
 */
export function averageComponents(
  rows: readonly PageAnalysisRow[],
  pick: (row: PageAnalysisRow) => ScoreComponent[],
): ScoreComponent[] {
  const totals = new Map<string, { component: ScoreComponent; sum: number; count: number }>();

  for (const row of rows) {
    for (const component of pick(row)) {
      const existing = totals.get(component.key);
      if (existing) {
        existing.sum += component.score;
        existing.count += 1;
      } else {
        totals.set(component.key, { component, sum: component.score, count: 1 });
      }
    }
  }

  return [...totals.values()]
    .map(({ component, sum, count }) => ({
      ...component,
      score: round(sum / count, 1),
      contribution: round((sum / count) * component.weight, 2),
      detail: `Averaged across ${count} page${count === 1 ? "" : "s"}.`,
    }))
    .sort((a, b) => b.weight - a.weight);
}
