import { describe, expect, it } from "vitest";
import { categoryFromPage } from "@/lib/analysis/quick-check";

/**
 * Category extraction for the public free check.
 *
 * The phrase this returns is quoted straight back to an anonymous visitor
 * inside a question ("Which <category> should a small business choose?"), so a
 * bad extraction is not a silent scoring wobble, it is a broken sentence on
 * the highest-traffic page in the funnel. Left to its own fallback the prompt
 * generator reads the first H2, which on a marketing homepage is a slogan and
 * produced "Who provides the backbone of global commerce?".
 */
describe("categoryFromPage", () => {
  it("takes the descriptive half of a brand-separated title", () => {
    expect(categoryFromPage("Stripe | Financial Infrastructure to Grow Your Revenue")).toBe(
      "financial infrastructure",
    );
    expect(categoryFromPage("Zoho | Cloud Software Suite for Businesses")).toBe(
      "cloud software suite",
    );
  });

  it("reads the descriptive half whichever side of the separator it is on", () => {
    expect(categoryFromPage("The AI workspace that works for you. | Notion")).toBe("ai workspace");
  });

  it("strips a leading article so the phrase survives being put in a sentence", () => {
    // "Which the ai workspace should a small business choose?" is the failure.
    expect(categoryFromPage("The AI workspace | Notion")).toBe("ai workspace");
    expect(categoryFromPage("Your Accounting Software for Small Teams")).toBe(
      "accounting software",
    );
  });

  it("cuts the title at the first connective rather than keeping the pitch", () => {
    expect(categoryFromPage("Email Marketing Software that converts subscribers")).toBe(
      "email marketing software",
    );
  });

  it("returns null when nothing usable is there, so the generator keeps its own fallback", () => {
    expect(categoryFromPage(null)).toBeNull();
    expect(categoryFromPage("")).toBeNull();
    expect(categoryFromPage("Home")).toBeNull();
    expect(categoryFromPage("Acme")).toBeNull();
  });

  it("never returns a phrase too long to read inside a question", () => {
    const long =
      "The Complete End To End Enterprise Resource Planning And Analytics Platform";
    const result = categoryFromPage(long);
    if (result !== null) {
      expect(result.length).toBeLessThanOrEqual(42);
      expect(result.split(" ").length).toBeLessThanOrEqual(4);
    }
  });
});
