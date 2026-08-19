import { describe, expect, it } from "vitest";
import {
  analyseAnswer,
  brandVariants,
  citedUrlsForDomain,
  citesDomain,
  detectCompetitorMentions,
  detectRecommendation,
  detectSentiment,
  mentionsBrand,
} from "@/lib/metrics/detection";

/**
 * Detection decides every headline AI number. A false positive here inflates a
 * customer's metrics and destroys trust in the product, so these tests pin both
 * what must match and — more importantly — what must not.
 */

describe("brandVariants", () => {
  it("includes the collapsed and hyphenated forms", () => {
    const variants = brandVariants("V Turn AI");
    expect(variants).toContain("V Turn AI");
    expect(variants).toContain("VTurnAI");
    expect(variants).toContain("V-Turn-AI");
  });

  it("strips corporate suffixes", () => {
    expect(brandVariants("Acme Technologies Pvt Ltd")).toContain("Acme Technologies");
  });

  it("includes explicit aliases", () => {
    expect(brandVariants("Acme", ["AcmeCRM"])).toContain("AcmeCRM");
  });
});

describe("mentionsBrand", () => {
  it("matches on a word boundary", () => {
    expect(mentionsBrand("I would look at Zoho for this.", "Zoho")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(mentionsBrand("try zoho crm", "Zoho")).toBe(true);
  });

  it("tolerates spacing and punctuation variation", () => {
    expect(mentionsBrand("Consider V-Turn AI for this.", "V Turn AI")).toBe(true);
    expect(mentionsBrand("Consider VTurnAI for this.", "V Turn AI")).toBe(true);
  });

  it("does NOT match a brand embedded inside a longer word", () => {
    // The single most damaging class of false positive.
    expect(mentionsBrand("The zohoish approach", "Zoho")).toBe(false);
    expect(mentionsBrand("Freshdesking is not a word", "Freshdesk")).toBe(false);
  });

  it("does not match on an empty or one-character brand", () => {
    expect(mentionsBrand("anything at all", "")).toBe(false);
    expect(mentionsBrand("a b c", "a")).toBe(false);
  });

  it("matches an alias", () => {
    expect(mentionsBrand("We use AcmeCRM daily.", "Acme Technologies", ["AcmeCRM"])).toBe(true);
  });

  it("returns false for empty text", () => {
    expect(mentionsBrand("", "Acme")).toBe(false);
  });
});

describe("citesDomain and citedUrlsForDomain", () => {
  const citations = [
    { url: "https://www.acme.com/pricing", domain: "www.acme.com" },
    { url: "https://blog.acme.com/post", domain: "blog.acme.com" },
    { url: "https://notacme.com/page", domain: "notacme.com" },
    { url: "https://other.com/page", domain: "other.com" },
  ];

  it("matches the apex domain and its subdomains", () => {
    expect(citesDomain(citations, "acme.com")).toBe(true);
    expect(citedUrlsForDomain(citations, "acme.com")).toEqual([
      "https://www.acme.com/pricing",
      "https://blog.acme.com/post",
    ]);
  });

  it("does not match a domain that merely ends with the same string", () => {
    expect(citedUrlsForDomain(citations, "acme.com")).not.toContain("https://notacme.com/page");
  });

  it("returns false when nothing matches", () => {
    expect(citesDomain(citations, "example.org")).toBe(false);
  });

  it("returns false for an empty citation list", () => {
    expect(citesDomain([], "acme.com")).toBe(false);
  });
});

describe("detectRecommendation", () => {
  it("detects an explicit recommendation of the brand", () => {
    expect(detectRecommendation("I would recommend Acme for a small team.", "Acme")).toBe(true);
    expect(detectRecommendation("Acme is the best choice for SMEs.", "Acme")).toBe(true);
    expect(detectRecommendation("If budget matters, go with Acme.", "Acme")).toBe(true);
  });

  it("does NOT treat a negated recommendation as a recommendation", () => {
    expect(detectRecommendation("I would not recommend Acme for this.", "Acme")).toBe(false);
    expect(detectRecommendation("Avoid Acme if you need offline access.", "Acme")).toBe(false);
  });

  it("does not count a bare mention as a recommendation", () => {
    expect(detectRecommendation("Options include Acme, Beta and Gamma.", "Acme")).toBe(false);
  });

  it("does not attribute another brand's recommendation to this brand", () => {
    const answer = "Acme exists too. I would recommend Beta for a small team.";
    expect(detectRecommendation(answer, "Acme")).toBe(false);
    expect(detectRecommendation(answer, "Beta")).toBe(true);
  });

  it("returns false when the brand is absent", () => {
    expect(detectRecommendation("I would recommend Beta.", "Acme")).toBe(false);
  });
});

describe("detectSentiment", () => {
  it("returns unknown when the brand is not mentioned", () => {
    expect(detectSentiment("Beta is excellent.", "Acme")).toBe("unknown");
  });

  it("detects positive sentiment", () => {
    expect(detectSentiment("Acme is reliable and affordable.", "Acme")).toBe("positive");
  });

  it("detects negative sentiment", () => {
    expect(detectSentiment("Acme is expensive and clunky.", "Acme")).toBe("negative");
  });

  it("returns neutral for a factual mention with no evaluative language", () => {
    expect(detectSentiment("Acme was founded in 2015 and is based in Pune.", "Acme")).toBe("neutral");
  });

  it("inverts sentiment under negation", () => {
    expect(detectSentiment("Acme is not expensive.", "Acme")).toBe("positive");
  });
});

describe("detectCompetitorMentions", () => {
  it("reports each competitor independently", () => {
    const answer = "I would recommend Beta. Gamma is also available. Delta is not covered here.";
    const mentions = detectCompetitorMentions(answer, ["Beta", "Gamma", "Epsilon"]);

    expect(mentions).toHaveLength(3);
    expect(mentions.find((entry) => entry.brand === "Beta")).toEqual({
      brand: "Beta",
      mentioned: true,
      recommended: true,
    });
    expect(mentions.find((entry) => entry.brand === "Gamma")).toEqual({
      brand: "Gamma",
      mentioned: true,
      recommended: false,
    });
    expect(mentions.find((entry) => entry.brand === "Epsilon")).toEqual({
      brand: "Epsilon",
      mentioned: false,
      recommended: false,
    });
  });

  it("ignores blank competitor names", () => {
    expect(detectCompetitorMentions("anything", ["", "  "])).toHaveLength(0);
  });
});

describe("analyseAnswer", () => {
  it("produces a complete, consistent analysis", () => {
    const result = analyseAnswer({
      answer:
        "For a small Indian sales team I would recommend Acme CRM — it is affordable and reliable. Zoho is another option.",
      brand: "Acme CRM",
      domain: "acme.com",
      citations: [
        { url: "https://acme.com/pricing", domain: "acme.com" },
        { url: "https://zoho.com", domain: "zoho.com" },
      ],
      competitors: ["Zoho", "Freshworks"],
    });

    expect(result.brandMentioned).toBe(true);
    expect(result.domainCited).toBe(true);
    expect(result.recommended).toBe(true);
    expect(result.sentiment).toBe("positive");
    expect(result.citedBrandUrls).toEqual(["https://acme.com/pricing"]);
    expect(result.competitorMentions.find((entry) => entry.brand === "Zoho")?.mentioned).toBe(true);
    expect(result.competitorMentions.find((entry) => entry.brand === "Freshworks")?.mentioned).toBe(
      false,
    );
  });

  it("reports an omission honestly rather than guessing", () => {
    const result = analyseAnswer({
      answer: "The leading options are Zoho and Freshworks.",
      brand: "Acme CRM",
      domain: "acme.com",
      citations: [{ url: "https://zoho.com", domain: "zoho.com" }],
      competitors: ["Zoho"],
    });

    expect(result.brandMentioned).toBe(false);
    expect(result.domainCited).toBe(false);
    expect(result.recommended).toBe(false);
    expect(result.sentiment).toBe("unknown");
  });
});
