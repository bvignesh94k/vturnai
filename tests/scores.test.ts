import { describe, expect, it } from "vitest";
import {
  AEO_WEIGHTS,
  CITATION_READINESS_WEIGHTS,
  EXPERIENCE_AUTHORITY_WEIGHTS,
  GEO_WEIGHTS,
  HEO_WEIGHTS,
  SEO_WEIGHTS,
  scoreBand,
} from "@/lib/config/scoring";
import {
  bandScore,
  booleanScore,
  composeHeoScore,
  composeScore,
  issuePenaltyScore,
  passRateScore,
} from "@/lib/metrics/scores";
import {
  affectedPagesScore,
  calculatePriority,
  priorityBand,
  trafficPotentialScore,
} from "@/lib/metrics/opportunity-priority";

describe("scoring configuration", () => {
  it("keeps every weight group summing to 1", () => {
    const sum = (values: readonly { weight: number }[]) =>
      values.reduce((total, entry) => total + entry.weight, 0);

    expect(sum(SEO_WEIGHTS)).toBeCloseTo(1, 4);
    expect(sum(AEO_WEIGHTS)).toBeCloseTo(1, 4);
    expect(sum(GEO_WEIGHTS)).toBeCloseTo(1, 4);
    expect(sum(EXPERIENCE_AUTHORITY_WEIGHTS)).toBeCloseTo(1, 4);
    expect(sum(CITATION_READINESS_WEIGHTS)).toBeCloseTo(1, 4);
  });

  it("uses the published HEO weighting", () => {
    expect(HEO_WEIGHTS).toEqual({ seo: 0.3, aeo: 0.2, geo: 0.35, experienceAuthority: 0.15 });
    expect(Object.values(HEO_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
  });
});

describe("composeScore", () => {
  const weights = [
    { key: "a", label: "A", weight: 0.5, description: "" },
    { key: "b", label: "B", weight: 0.3, description: "" },
    { key: "c", label: "C", weight: 0.2, description: "" },
  ];

  it("computes the weighted total", () => {
    const result = composeScore(weights, { a: 100, b: 100, c: 100 });
    expect(result.score).toBe(100);
  });

  it("renormalises weights when a component is unmeasured", () => {
    // c is missing, so a and b share the full weight: 0.5/0.8 and 0.3/0.8.
    const result = composeScore(weights, { a: 100, b: 0, c: null });
    expect(result.score).toBeCloseTo(62.5, 1);

    const componentC = result.components.find((entry) => entry.key === "c");
    expect(componentC?.weight).toBe(0);
    expect(componentC?.detail).toBe("Not measured");
  });

  it("returns zero when nothing was measured", () => {
    const result = composeScore(weights, { a: null, b: null, c: null });
    expect(result.score).toBe(0);
    expect(result.components).toHaveLength(3);
  });

  it("clamps component scores into 0–100", () => {
    const result = composeScore(weights, { a: 150, b: -20, c: 50 });
    const componentA = result.components.find((entry) => entry.key === "a");
    const componentB = result.components.find((entry) => entry.key === "b");
    expect(componentA?.score).toBe(100);
    expect(componentB?.score).toBe(0);
  });

  it("always returns a breakdown that sums to the total", () => {
    const result = composeScore(weights, { a: 80, b: 60, c: 40 });
    const total = result.components.reduce((sum, entry) => sum + entry.contribution, 0);
    expect(total).toBeCloseTo(result.score, 1);
  });
});

describe("composeHeoScore", () => {
  it("applies the published weights", () => {
    const result = composeHeoScore({ seo: 80, aeo: 60, geo: 40, experienceAuthority: 20 });
    // 80*0.30 + 60*0.20 + 40*0.35 + 20*0.15 = 24 + 12 + 14 + 3
    expect(result.score).toBeCloseTo(53, 1);
    expect(result.vScore).toBe(result.score);
  });

  it("exposes a formula generated from the same weights it used", () => {
    const result = composeHeoScore({ seo: 0, aeo: 0, geo: 0, experienceAuthority: 0 });
    expect(result.formula).toBe("SEO 30% + AEO 20% + GEO 35% + Experience & Authority 15%");
  });

  it("returns 100 only when every pillar is perfect", () => {
    expect(composeHeoScore({ seo: 100, aeo: 100, geo: 100, experienceAuthority: 100 }).score).toBe(
      100,
    );
  });
});

describe("score helpers", () => {
  it("bandScore interpolates between a floor and an ideal", () => {
    expect(bandScore(0, 0, 10)).toBe(0);
    expect(bandScore(5, 0, 10)).toBe(50);
    expect(bandScore(10, 0, 10)).toBe(100);
    expect(bandScore(20, 0, 10)).toBe(100);
    expect(bandScore(-5, 0, 10)).toBe(0);
  });

  it("booleanScore maps a flag to a score", () => {
    expect(booleanScore(true)).toBe(100);
    expect(booleanScore(false)).toBe(0);
    expect(booleanScore(false, 100, 45)).toBe(45);
  });

  it("passRateScore returns null when there is nothing to measure", () => {
    expect(passRateScore(0, 0)).toBeNull();
    expect(passRateScore(5, 10)).toBe(50);
  });

  it("issuePenaltyScore punishes critical issues hardest", () => {
    const clean = issuePenaltyScore({ totalItems: 100 });
    const withCritical = issuePenaltyScore({ totalItems: 100, critical: 5 });
    const withLow = issuePenaltyScore({ totalItems: 100, low: 5 });

    expect(clean).toBe(100);
    expect(withCritical).toBeLessThan(withLow);
    expect(withCritical).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreBand", () => {
  it("labels each band", () => {
    expect(scoreBand(95).label).toBe("Excellent");
    expect(scoreBand(75).label).toBe("Good");
    expect(scoreBand(55).label).toBe("Needs work");
    expect(scoreBand(20).label).toBe("At risk");
  });
});

describe("opportunity priority", () => {
  it("scales affected pages logarithmically", () => {
    expect(affectedPagesScore(0, 100)).toBe(0);
    const one = affectedPagesScore(1, 100);
    const ten = affectedPagesScore(10, 100);
    const hundred = affectedPagesScore(100, 100);

    expect(one).toBeLessThan(ten);
    expect(ten).toBeLessThan(hundred);
    // The jump from 1 to 10 should matter more than 10 to 100 in volume terms.
    expect(ten - one).toBeGreaterThan(0);
  });

  it("returns null traffic potential when Search Console is not connected", () => {
    expect(trafficPotentialScore(null)).toBeNull();
    expect(trafficPotentialScore(undefined)).toBeNull();
    expect(trafficPotentialScore(0)).toBe(0);
    expect(trafficPotentialScore(10_000)).toBeCloseTo(100, 0);
  });

  it("ranks a critical, easy, high-impact fix above a low, hard, narrow one", () => {
    const urgent = calculatePriority({
      severity: "critical",
      visibilityImpact: 90,
      affectedPages: 40,
      totalPages: 100,
      effort: "easy",
      trafficPotential: 5000,
      aiPromptOpportunity: 80,
    });

    const minor = calculatePriority({
      severity: "low",
      visibilityImpact: 15,
      affectedPages: 1,
      totalPages: 100,
      effort: "advanced",
      trafficPotential: 5,
      aiPromptOpportunity: 5,
    });

    expect(urgent.score).toBeGreaterThan(minor.score);
    expect(priorityBand(urgent.score)).toBe("urgent");
    expect(priorityBand(minor.score)).toBe("low");
  });

  it("renormalises when Search Console and AI data are unavailable", () => {
    const result = calculatePriority({
      severity: "high",
      visibilityImpact: 70,
      affectedPages: 10,
      totalPages: 100,
      effort: "moderate",
      trafficPotential: null,
      aiPromptOpportunity: null,
    });

    const weightTotal = result.components.reduce((sum, entry) => sum + entry.weight, 0);
    expect(weightTotal).toBeCloseTo(1, 3);
    expect(result.components.some((entry) => entry.key === "trafficPotential")).toBe(false);
    expect(result.score).toBeGreaterThan(0);
  });

  it("always produces a breakdown that reconstructs the score", () => {
    const result = calculatePriority({
      severity: "medium",
      visibilityImpact: 50,
      affectedPages: 5,
      totalPages: 50,
      effort: "moderate",
      trafficPotential: 500,
      aiPromptOpportunity: 40,
    });

    const total = result.components.reduce((sum, entry) => sum + entry.contribution, 0);
    expect(total).toBeCloseTo(result.score, 1);
  });
});
