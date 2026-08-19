import { describe, expect, it } from "vitest";
import {
  aggregateSentiment,
  buildEngineRows,
  citationDiversity,
  citationRate,
  delta,
  engineConsistency,
  engineVisibilityScore,
  mentionRate,
  promptCoverage,
  recommendationRate,
  shareOfVoice,
  shareOfVoiceBreakdown,
  summariseAiVisibility,
  validRuns,
  type MeasurableRun,
} from "@/lib/metrics/ai-visibility";

function run(overrides: Partial<MeasurableRun> = {}): MeasurableRun {
  return {
    engineId: "openai",
    promptId: "prompt-1",
    valid: true,
    brandMentioned: false,
    domainCited: false,
    recommended: false,
    sentiment: "unknown",
    citedUrls: [],
    competitorMentions: [],
    ...overrides,
  };
}

/**
 * The central honesty guarantee of the product: failed provider calls must
 * never be counted as "the engine did not mention you". These tests pin that
 * invalid runs are excluded from both numerator and denominator.
 */
describe("valid run handling", () => {
  it("excludes invalid runs from the denominator", () => {
    const runs = [
      run({ brandMentioned: true }),
      run({ brandMentioned: false }),
      run({ valid: false }),
      run({ valid: false }),
    ];

    expect(validRuns(runs)).toHaveLength(2);
    // 1 of 2 valid runs, not 1 of 4.
    expect(mentionRate(runs)).toBe(50);
  });

  it("returns zero rather than NaN when there is nothing valid", () => {
    expect(mentionRate([run({ valid: false })])).toBe(0);
    expect(citationRate([])).toBe(0);
    expect(recommendationRate([])).toBe(0);
    expect(shareOfVoice([])).toBe(0);
  });
});

describe("mentionRate, citationRate, recommendationRate", () => {
  const runs = [
    run({ brandMentioned: true, domainCited: true, recommended: true }),
    run({ brandMentioned: true, domainCited: false, recommended: false }),
    run({ brandMentioned: false }),
    run({ brandMentioned: true, domainCited: true, recommended: false }),
  ];

  it("computes each rate over valid responses", () => {
    expect(mentionRate(runs)).toBe(75);
    expect(citationRate(runs)).toBe(50);
    expect(recommendationRate(runs)).toBe(25);
  });
});

describe("promptCoverage", () => {
  it("counts a prompt as covered when any engine mentions the brand", () => {
    const runs = [
      run({ promptId: "a", engineId: "openai", brandMentioned: false }),
      run({ promptId: "a", engineId: "gemini", brandMentioned: true }),
      run({ promptId: "b", engineId: "openai", brandMentioned: false }),
    ];
    expect(promptCoverage(runs)).toBe(50);
  });

  it("counts tracked prompts that produced no valid run as uncovered", () => {
    const runs = [run({ promptId: "a", brandMentioned: true })];
    // One covered out of five tracked, not one out of one executed.
    expect(promptCoverage(runs, 5)).toBe(20);
  });

  it("returns zero when nothing is tracked", () => {
    expect(promptCoverage([], 0)).toBe(0);
  });
});

describe("shareOfVoice", () => {
  it("divides brand mentions by brand plus competitor mentions", () => {
    const runs = [
      run({
        brandMentioned: true,
        competitorMentions: [
          { brand: "Beta", mentioned: true, recommended: false },
          { brand: "Gamma", mentioned: false, recommended: false },
        ],
      }),
      run({
        brandMentioned: false,
        competitorMentions: [{ brand: "Beta", mentioned: true, recommended: false }],
      }),
    ];
    // 1 brand mention against 2 competitor mentions.
    expect(shareOfVoice(runs)).toBeCloseTo(33.3, 1);
  });

  it("is 100% when no competitor is ever mentioned", () => {
    expect(shareOfVoice([run({ brandMentioned: true })])).toBe(100);
  });

  it("breaks the share down per brand, tracked brand first", () => {
    const breakdown = shareOfVoiceBreakdown(
      [
        run({
          brandMentioned: true,
          competitorMentions: [{ brand: "Beta", mentioned: true, recommended: false }],
        }),
        run({
          brandMentioned: true,
          competitorMentions: [{ brand: "Beta", mentioned: false, recommended: false }],
        }),
      ],
      "Acme",
    );

    expect(breakdown[0]).toMatchObject({ brand: "Acme", mentions: 2, isTrackedBrand: true });
    expect(breakdown[1]).toMatchObject({ brand: "Beta", mentions: 1, isTrackedBrand: false });
  });
});

describe("engineConsistency", () => {
  it("averages per-prompt engine agreement", () => {
    const runs = [
      // Prompt a: 2 of 2 engines mention the brand.
      run({ promptId: "a", engineId: "openai", brandMentioned: true }),
      run({ promptId: "a", engineId: "gemini", brandMentioned: true }),
      // Prompt b: 1 of 2 engines mention the brand.
      run({ promptId: "b", engineId: "openai", brandMentioned: true }),
      run({ promptId: "b", engineId: "gemini", brandMentioned: false }),
    ];
    // (100 + 50) / 2
    expect(engineConsistency(runs)).toBe(75);
  });

  it("returns zero with no runs", () => {
    expect(engineConsistency([])).toBe(0);
  });
});

describe("citationDiversity", () => {
  it("counts distinct cited URLs", () => {
    const runs = [
      run({ citedUrls: ["https://acme.com/a", "https://acme.com/b"] }),
      run({ citedUrls: ["https://acme.com/a"] }),
    ];
    expect(citationDiversity(runs)).toBe(2);
  });

  it("ignores invalid runs", () => {
    expect(citationDiversity([run({ valid: false, citedUrls: ["https://acme.com/a"] })])).toBe(0);
  });
});

describe("engineVisibilityScore", () => {
  it("weights mention, citation and recommendation", () => {
    expect(
      engineVisibilityScore({ mentionRate: 100, citationRate: 100, recommendationRate: 100 }),
    ).toBe(100);
    expect(engineVisibilityScore({ mentionRate: 0, citationRate: 0, recommendationRate: 0 })).toBe(0);
    // Mention alone carries 40% of the score.
    expect(
      engineVisibilityScore({ mentionRate: 100, citationRate: 0, recommendationRate: 0 }),
    ).toBe(40);
  });
});

describe("aggregateSentiment", () => {
  it("returns unknown when the brand is never mentioned", () => {
    expect(aggregateSentiment([run({ brandMentioned: false, sentiment: "unknown" })])).toBe("unknown");
  });

  it("returns positive when most mentions are positive", () => {
    expect(
      aggregateSentiment([
        run({ brandMentioned: true, sentiment: "positive" }),
        run({ brandMentioned: true, sentiment: "positive" }),
        run({ brandMentioned: true, sentiment: "neutral" }),
      ]),
    ).toBe("positive");
  });

  it("returns negative when a significant share is negative", () => {
    expect(
      aggregateSentiment([
        run({ brandMentioned: true, sentiment: "negative" }),
        run({ brandMentioned: true, sentiment: "negative" }),
        run({ brandMentioned: true, sentiment: "neutral" }),
      ]),
    ).toBe("negative");
  });
});

describe("buildEngineRows", () => {
  it("builds a row per engine, including engines with no data", () => {
    const rows = buildEngineRows(
      [
        run({ engineId: "openai", brandMentioned: true, domainCited: true }),
        run({ engineId: "openai", valid: false }),
      ],
      ["openai", "gemini"],
      { openai: "2026-08-01T00:00:00.000Z", gemini: null },
    );

    expect(rows).toHaveLength(2);

    const openai = rows.find((row) => row.engineId === "openai");
    expect(openai).toMatchObject({
      validResponses: 1,
      failedResponses: 1,
      mentions: 1,
      citations: 1,
      mentionRate: 100,
    });

    const gemini = rows.find((row) => row.engineId === "gemini");
    expect(gemini).toMatchObject({ validResponses: 0, mentions: 0, mentionRate: 0 });
    expect(gemini?.lastCheckedAt).toBeNull();
  });
});

describe("summariseAiVisibility", () => {
  it("returns a consistent summary", () => {
    const summary = summariseAiVisibility(
      [
        run({ brandMentioned: true, domainCited: true, recommended: true, sentiment: "positive" }),
        run({ brandMentioned: false }),
        run({ valid: false }),
      ],
      4,
    );

    expect(summary.validResponses).toBe(2);
    expect(summary.totalResponses).toBe(3);
    expect(summary.mentionRate).toBe(50);
    expect(summary.citationRate).toBe(50);
    expect(summary.recommendationRate).toBe(50);
    expect(summary.promptCoverage).toBe(25);
  });
});

describe("delta", () => {
  it("returns the point change", () => {
    expect(delta(60, 50)).toBe(10);
    expect(delta(40, 50)).toBe(-10);
  });

  it("returns null with no baseline", () => {
    expect(delta(60, null)).toBeNull();
    expect(delta(60, undefined)).toBeNull();
  });
});
