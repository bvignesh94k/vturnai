import { describe, expect, it } from "vitest";
import {
  PRO_PLAN,
  resolvePlanFeatures,
  resolvePlanLimits,
  resolvePlanPriceMinor,
  resolveTrialDays,
} from "@/lib/config/plans";
import {
  buildUsageLine,
  buildUsageReport,
  checkQuota,
  crossedThresholds,
  currentUsagePeriod,
  usageState,
} from "@/lib/metrics/usage";

describe("plan configuration", () => {
  it("ships the documented Pro plan defaults", () => {
    expect(PRO_PLAN.priceMinor).toBe(49900);
    expect(PRO_PLAN.currency).toBe("INR");
    expect(PRO_PLAN.trialDays).toBe(7);
    expect(PRO_PLAN.limits.projects).toBe(1);
    expect(PRO_PLAN.limits.crawledUrls).toBe(500);
    expect(PRO_PLAN.limits.activePrompts).toBe(25);
    expect(PRO_PLAN.limits.competitors).toBe(5);
    expect(PRO_PLAN.limits.scheduledAiScansPerMonth).toBe(2);
  });
});

describe("admin overrides", () => {
  it("applies a valid numeric override", () => {
    const limits = resolvePlanLimits("pro", { crawledUrls: 2000 });
    expect(limits.crawledUrls).toBe(2000);
    // Unrelated limits are untouched.
    expect(limits.activePrompts).toBe(PRO_PLAN.limits.activePrompts);
  });

  it("ignores invalid overrides so a bad admin edit cannot unlock unlimited spend", () => {
    const limits = resolvePlanLimits("pro", {
      crawledUrls: -50,
      activePrompts: Number.NaN,
      competitors: Number.POSITIVE_INFINITY,
      aiPromptExecutionsPerMonth: "lots",
    });

    expect(limits.crawledUrls).toBe(PRO_PLAN.limits.crawledUrls);
    expect(limits.activePrompts).toBe(PRO_PLAN.limits.activePrompts);
    expect(limits.competitors).toBe(PRO_PLAN.limits.competitors);
    expect(limits.aiPromptExecutionsPerMonth).toBe(PRO_PLAN.limits.aiPromptExecutionsPerMonth);
  });

  it("floors fractional overrides", () => {
    expect(resolvePlanLimits("pro", { competitors: 7.9 }).competitors).toBe(7);
  });

  it("returns defaults when there are no overrides", () => {
    expect(resolvePlanLimits("pro", null)).toEqual(PRO_PLAN.limits);
    expect(resolvePlanLimits("pro")).toEqual(PRO_PLAN.limits);
  });

  it("applies boolean feature overrides only", () => {
    const features = resolvePlanFeatures("pro", { apiAccess: true, reports: "yes" });
    expect(features.apiAccess).toBe(true);
    expect(features.reports).toBe(PRO_PLAN.features.reports);
  });

  it("guards price and trial overrides", () => {
    expect(resolvePlanPriceMinor("pro", 99900)).toBe(99900);
    expect(resolvePlanPriceMinor("pro", -1)).toBe(PRO_PLAN.priceMinor);
    expect(resolvePlanPriceMinor("pro", "free")).toBe(PRO_PLAN.priceMinor);

    expect(resolveTrialDays("pro", 14)).toBe(14);
    expect(resolveTrialDays("pro", 0)).toBe(0);
    expect(resolveTrialDays("pro", -3)).toBe(PRO_PLAN.trialDays);
  });
});

describe("usageState", () => {
  it("classifies usage against the limit", () => {
    expect(usageState(0, 100)).toBe("ok");
    expect(usageState(79, 100)).toBe("ok");
    expect(usageState(80, 100)).toBe("warning");
    expect(usageState(100, 100)).toBe("exhausted");
    expect(usageState(150, 100)).toBe("exhausted");
    expect(usageState(5, null)).toBe("uncapped");
    expect(usageState(0, 0)).toBe("exhausted");
  });
});

describe("checkQuota", () => {
  const limits = PRO_PLAN.limits;

  it("allows a request inside the limit", () => {
    const decision = checkQuota({ metric: "pages_crawled", used: 100, limits });
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(400);
  });

  it("refuses a request that would exceed the limit", () => {
    const decision = checkQuota({ metric: "pages_crawled", used: 500, limits });
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.reason).toContain("used all");
  });

  it("refuses partial consumption outright", () => {
    // A half-executed scan would produce misleading metrics, so asking for more
    // than remains is refused rather than silently truncated.
    const decision = checkQuota({
      metric: "ai_prompt_executions",
      used: limits.aiPromptExecutionsPerMonth - 3,
      limits,
      requested: 10,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(3);
    expect(decision.reason).toContain("only 3 remain");
  });

  it("allows a request that exactly consumes the remainder", () => {
    const decision = checkQuota({
      metric: "reports_generated",
      used: limits.reportsPerMonth - 1,
      limits,
      requested: 1,
    });
    expect(decision.allowed).toBe(true);
  });

  it("treats uncapped metrics as always allowed", () => {
    const decision = checkQuota({ metric: "ai_engine_executions", used: 10_000, limits });
    expect(decision.allowed).toBe(true);
    expect(decision.limit).toBeNull();
  });

  it("never counts negative prior usage as headroom", () => {
    const decision = checkQuota({ metric: "reports_generated", used: -5, limits });
    expect(decision.used).toBe(0);
  });
});

describe("crossedThresholds", () => {
  it("reports a newly crossed 80% threshold", () => {
    expect(crossedThresholds(70, 85, 100)).toEqual([80]);
  });

  it("reports both thresholds when a single jump crosses them", () => {
    expect(crossedThresholds(10, 100, 100)).toEqual([80, 100]);
  });

  it("does not re-report a threshold already passed", () => {
    expect(crossedThresholds(85, 90, 100)).toEqual([]);
  });

  it("reports nothing for an uncapped metric", () => {
    expect(crossedThresholds(0, 1000, null)).toEqual([]);
  });
});

describe("usage report", () => {
  it("builds a line per metric with limits resolved from the plan", () => {
    const report = buildUsageReport({ pages_crawled: 250, reports_generated: 20 }, PRO_PLAN.limits);

    const pages = report.find((line) => line.metric === "pages_crawled");
    expect(pages).toMatchObject({ used: 250, limit: 500, percentUsed: 50, state: "ok" });

    const reports = report.find((line) => line.metric === "reports_generated");
    expect(reports?.state).toBe("exhausted");

    const uncapped = report.find((line) => line.metric === "ai_engine_executions");
    expect(uncapped?.limit).toBeNull();
    expect(uncapped?.state).toBe("uncapped");
  });

  it("floors fractional usage", () => {
    expect(buildUsageLine("pages_crawled", 10.7, PRO_PLAN.limits).used).toBe(10);
  });
});

describe("currentUsagePeriod", () => {
  it("produces a stable calendar-month key in UTC", () => {
    const period = currentUsagePeriod(new Date("2026-08-19T22:30:00.000Z"));
    expect(period.key).toBe("2026-08");
    expect(period.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rolls over correctly at a year boundary", () => {
    const period = currentUsagePeriod(new Date("2026-12-31T23:59:59.000Z"));
    expect(period.key).toBe("2026-12");
    expect(period.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
