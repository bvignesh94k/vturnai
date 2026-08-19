import { describe, expect, it } from "vitest";
import {
  AI_CRAWLER_AGENTS,
  crawlDelayMs,
  detectBlockedAiCrawlers,
  isAllowed,
  matchGroup,
  parseRobotsTxt,
  type RobotsTxt,
} from "@/lib/crawler/robots";

function robots(raw: string): RobotsTxt {
  return { found: true, raw, ...parseRobotsTxt(raw) };
}

describe("parseRobotsTxt", () => {
  it("parses groups, rules and sitemaps", () => {
    const parsed = parseRobotsTxt(`
      User-agent: *
      Disallow: /admin/
      Disallow: /cart
      Allow: /admin/public
      Crawl-delay: 2

      User-agent: GPTBot
      Disallow: /

      Sitemap: https://example.com/sitemap.xml
    `);

    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0]?.disallow).toEqual(["/admin/", "/cart"]);
    expect(parsed.groups[0]?.allow).toEqual(["/admin/public"]);
    expect(parsed.groups[0]?.crawlDelaySeconds).toBe(2);
    expect(parsed.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("ignores comments and blank lines", () => {
    const parsed = parseRobotsTxt(`
      # a comment
      User-agent: *   # inline comment
      Disallow: /private
    `);
    expect(parsed.groups[0]?.disallow).toEqual(["/private"]);
  });

  it("treats an empty Disallow as allow-everything rather than a rule", () => {
    const parsed = parseRobotsTxt("User-agent: *\nDisallow:");
    expect(parsed.groups[0]?.disallow).toEqual([]);
  });

  it("shares one rule set across consecutive user-agent lines", () => {
    const parsed = parseRobotsTxt("User-agent: A\nUser-agent: B\nDisallow: /x");
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]?.userAgents).toEqual(["a", "b"]);
  });

  it("normalises rules that omit the leading slash", () => {
    const parsed = parseRobotsTxt("User-agent: *\nDisallow: private");
    expect(parsed.groups[0]?.disallow).toEqual(["/private"]);
  });
});

describe("matchGroup", () => {
  const txt = robots("User-agent: *\nDisallow: /a\n\nUser-agent: GPTBot\nDisallow: /b");

  it("prefers the most specific matching group", () => {
    expect(matchGroup(txt, "GPTBot")?.disallow).toEqual(["/b"]);
  });

  it("falls back to the wildcard group", () => {
    expect(matchGroup(txt, "SomeOtherBot")?.disallow).toEqual(["/a"]);
  });
});

describe("isAllowed", () => {
  it("allows everything when there is no robots.txt", () => {
    const none: RobotsTxt = { found: false, raw: null, groups: [], sitemaps: [] };
    expect(isAllowed(none, "https://example.com/anything")).toBe(true);
  });

  it("honours a simple disallow", () => {
    const txt = robots("User-agent: *\nDisallow: /private");
    expect(isAllowed(txt, "https://example.com/private/page")).toBe(false);
    expect(isAllowed(txt, "https://example.com/public/page")).toBe(true);
  });

  it("uses longest-match so a specific Allow beats a broad Disallow", () => {
    const txt = robots("User-agent: *\nDisallow: /docs\nAllow: /docs/public");
    expect(isAllowed(txt, "https://example.com/docs/private")).toBe(false);
    expect(isAllowed(txt, "https://example.com/docs/public/page")).toBe(true);
  });

  it("supports wildcards", () => {
    const txt = robots("User-agent: *\nDisallow: /*.pdf");
    expect(isAllowed(txt, "https://example.com/files/report.pdf")).toBe(false);
    expect(isAllowed(txt, "https://example.com/files/report.html")).toBe(true);
  });

  it("supports end-of-path anchoring", () => {
    const txt = robots("User-agent: *\nDisallow: /page$");
    expect(isAllowed(txt, "https://example.com/page")).toBe(false);
    expect(isAllowed(txt, "https://example.com/page/child")).toBe(true);
  });

  it("applies agent-specific rules", () => {
    const txt = robots("User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /");
    expect(isAllowed(txt, "https://example.com/page", "VTurnAIBot")).toBe(true);
    expect(isAllowed(txt, "https://example.com/page", "GPTBot")).toBe(false);
  });

  it("blocks a malformed URL rather than assuming it is allowed", () => {
    expect(isAllowed(robots("User-agent: *\nDisallow: /x"), "not-a-url")).toBe(false);
  });
});

describe("detectBlockedAiCrawlers", () => {
  it("reports a site-wide block on a named AI crawler", () => {
    const txt = robots("User-agent: GPTBot\nDisallow: /");
    const blocked = detectBlockedAiCrawlers(txt, "https://example.com/");

    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ agent: "GPTBot", engine: "OpenAI", scope: "site" });
  });

  it("reports a partial block", () => {
    const txt = robots("User-agent: PerplexityBot\nDisallow: /pricing");
    const blocked = detectBlockedAiCrawlers(txt, "https://example.com/");
    expect(blocked[0]).toMatchObject({ agent: "PerplexityBot", scope: "partial" });
  });

  it("reports nothing when no AI crawler is restricted", () => {
    const txt = robots("User-agent: *\nAllow: /");
    expect(detectBlockedAiCrawlers(txt, "https://example.com/")).toHaveLength(0);
  });

  it("reports nothing when robots.txt is absent", () => {
    const none: RobotsTxt = { found: false, raw: null, groups: [], sitemaps: [] };
    expect(detectBlockedAiCrawlers(none)).toHaveLength(0);
  });

  it("catches every AI crawler when a wildcard group blocks the whole site", () => {
    const txt = robots("User-agent: *\nDisallow: /");
    const blocked = detectBlockedAiCrawlers(txt, "https://example.com/");
    expect(blocked).toHaveLength(AI_CRAWLER_AGENTS.length);
    expect(blocked.every((entry) => entry.scope === "site")).toBe(true);
  });
});

describe("crawlDelayMs", () => {
  it("uses the declared crawl delay when it exceeds our own", () => {
    const txt = robots("User-agent: *\nCrawl-delay: 3");
    expect(crawlDelayMs(txt, 400)).toBe(3000);
  });

  it("keeps our own delay when robots.txt asks for less", () => {
    const txt = robots("User-agent: *\nCrawl-delay: 0.1");
    expect(crawlDelayMs(txt, 400)).toBe(400);
  });

  it("caps an absurd crawl delay so one site cannot stall a crawl forever", () => {
    const txt = robots("User-agent: *\nCrawl-delay: 3600");
    expect(crawlDelayMs(txt, 400)).toBe(10_000);
  });

  it("falls back to our own delay when none is declared", () => {
    expect(crawlDelayMs(robots("User-agent: *\nDisallow: /x"), 400)).toBe(400);
  });
});
