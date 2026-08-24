import { describe, expect, it } from "vitest";
import { factorFixes } from "@/lib/data/page-analysis";
import type { PageAnalysisRow } from "@/lib/data/page-analysis";
import type { ScoreComponent } from "@/lib/metrics/scores";

function component(key: string, score: number, weight: number): ScoreComponent {
  return {
    key,
    label: key,
    description: `${key} description`,
    score,
    weight,
    contribution: score * weight,
  };
}

function page(id: string, components: ScoreComponent[]): PageAnalysisRow {
  return {
    pageId: id,
    url: `https://example.com/${id}`,
    title: id,
    classification: "article",
    wordCount: 500,
    seoScore: 0,
    aeoScore: 0,
    geoScore: 0,
    heoScore: 0,
    citationReadinessScore: 0,
    aeoComponents: components,
    geoComponents: [],
    citationComponents: [],
    citationRecommendations: [],
    suggestions: [],
  };
}

const pick = (row: PageAnalysisRow) => row.aeoComponents;

describe("factorFixes", () => {
  it("values a factor at the weight it can still recover, not its current score", () => {
    // A factor scoring 40 at weight 0.10 leaves 60 * 0.10 = 6 points. A factor
    // scoring 80 at weight 0.50 leaves 20 * 0.50 = 10, so the higher-scoring
    // factor is worth more work. Ordering by raw score would invert this.
    const rows = [page("a", [component("structured", 40, 0.1), component("headings", 80, 0.5)])];

    const [first, second] = factorFixes(rows, pick);

    expect(first.key).toBe("headings");
    expect(first.pointsAvailable).toBe(10);
    expect(second.key).toBe("structured");
    expect(second.pointsAvailable).toBe(6);
  });

  it("counts only pages below the passing threshold as failing", () => {
    const rows = [
      page("a", [component("structured", 20, 0.1)]),
      page("b", [component("structured", 59, 0.1)]),
      page("c", [component("structured", 60, 0.1)]),
      page("d", [component("structured", 90, 0.1)]),
    ];

    const [fix] = factorFixes(rows, pick, { passingScore: 60 });

    expect(fix.failingPages).toBe(2);
    expect(fix.totalPages).toBe(4);
  });

  it("lists the worst pages first so the work starts somewhere specific", () => {
    const rows = [
      page("mid", [component("structured", 40, 0.1)]),
      page("worst", [component("structured", 5, 0.1)]),
      page("bad", [component("structured", 25, 0.1)]),
      page("passing", [component("structured", 95, 0.1)]),
    ];

    const [fix] = factorFixes(rows, pick, { worstPagesPerFactor: 2 });

    expect(fix.worstPages.map((entry) => entry.pageId)).toEqual(["worst", "bad"]);
    expect(fix.worstPages[0].score).toBe(5);
  });

  it("drops a factor that is already at 100, since there is nothing to recover", () => {
    const rows = [page("a", [component("perfect", 100, 0.3), component("weak", 50, 0.2)])];

    const fixes = factorFixes(rows, pick);

    expect(fixes.map((fix) => fix.key)).toEqual(["weak"]);
  });

  it("averages a factor across every page before valuing it", () => {
    const rows = [
      page("a", [component("structured", 0, 0.2)]),
      page("b", [component("structured", 100, 0.2)]),
    ];

    const [fix] = factorFixes(rows, pick);

    expect(fix.score).toBe(50);
    expect(fix.pointsAvailable).toBe(10);
  });
});
