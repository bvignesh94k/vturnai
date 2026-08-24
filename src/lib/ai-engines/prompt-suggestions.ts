/**
 * Prompt suggestion generation.
 *
 * Prompts are generated from what the site and its Search Console data actually
 * say, never from a generic template list. A suggestion the user does not
 * recognise as their own business is a suggestion they will delete.
 */

import type { ExtractedPage } from "@/lib/crawler/extractor";
import type { PromptGroupDb } from "@/lib/db/types";
import { titleCase, truncate, unique } from "@/lib/utils";

export interface PromptSuggestion {
  promptText: string;
  group: PromptGroupDb;
  intent: string;
  topic: string | null;
  /** Where the suggestion came from, shown to the user so they can judge it. */
  source: "website_content" | "services" | "search_console" | "competitors" | "business_description" | "headings";
  priority: number;
}

export const PROMPT_GROUP_LABELS: Record<PromptGroupDb, string> = {
  awareness: "Awareness",
  problem: "Problem",
  solution: "Solution",
  comparison: "Comparison",
  alternative: "Alternative",
  recommendation: "Recommendation",
  commercial: "Commercial",
  transactional: "Transactional",
  local: "Local",
  brand: "Brand",
};

export const PROMPT_GROUP_DESCRIPTIONS: Record<PromptGroupDb, string> = {
  awareness: "Someone is learning the topic exists and what it means.",
  problem: "Someone is describing a problem, not yet a solution.",
  solution: "Someone is looking for the kind of thing that solves it.",
  comparison: "Someone is weighing named options against each other.",
  alternative: "Someone already knows a competitor and wants other options.",
  recommendation: "Someone is asking to be told what to pick.",
  commercial: "Someone is evaluating price, plans and fit before buying.",
  transactional: "Someone is ready to act and wants where and how.",
  local: "Someone wants an option in a specific place.",
  brand: "Someone is asking about you by name.",
};

export interface SuggestionInput {
  brandName: string;
  businessCategory: string | null;
  businessDescription: string | null;
  targetCountry: string;
  targetAudience: string | null;
  competitors: readonly string[];
  pages: readonly ExtractedPage[];
  /** Question-style queries pulled from Search Console, if connected. */
  searchConsoleQueries?: readonly { query: string; impressions: number }[];
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "your", "our", "you", "are", "how", "what", "why", "who",
  "best", "top", "new", "get", "all", "can", "from", "that", "this", "his", "her", "its",
  "about", "into", "more", "than", "then", "them", "they", "will", "have", "has", "was",
  "home", "page", "site", "welcome", "read", "learn", "click", "here", "contact", "services",
]);

/** Pull the phrases the site itself uses to describe what it sells. */
function extractOfferings(pages: readonly ExtractedPage[]): string[] {
  const candidates: string[] = [];

  for (const page of pages) {
    if (["product", "service", "pricing"].includes(page.contentClassification)) {
      const heading = page.h1[0] ?? page.title;
      if (heading) candidates.push(heading);
    }
    for (const heading of page.h2.slice(0, 4)) {
      if (heading.length > 8 && heading.length < 70 && !heading.endsWith("?")) {
        candidates.push(heading);
      }
    }
  }

  return unique(
    candidates
      .map((value) =>
        value
          .replace(/\s*[|–—-]\s*[^|–—-]*$/, "")
          .replace(/[^\p{L}\p{N}\s&+-]/gu, " ")
          .replace(/\s{2,}/g, " ")
          .trim(),
      )
      .filter((value) => {
        if (value.length < 8 || value.length > 60) return false;
        const words = value.toLowerCase().split(/\s+/);
        return words.some((word) => word.length > 3 && !STOP_WORDS.has(word));
      }),
  ).slice(0, 12);
}

/** Country name for prompt phrasing. Falls back to the code when unmapped. */
const COUNTRY_NAMES: Record<string, string> = {
  IN: "India",
  US: "the United States",
  GB: "the UK",
  AE: "the UAE",
  SG: "Singapore",
  AU: "Australia",
  CA: "Canada",
  DE: "Germany",
  FR: "France",
  ZA: "South Africa",
};

function countryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/**
 * Generate suggested prompts. The user reviews and edits these before any of
 * them become active, nothing here is executed automatically.
 */
export function generatePromptSuggestions(input: SuggestionInput): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = [];
  const category = input.businessCategory?.trim() || null;
  const country = countryName(input.targetCountry);
  const audience = input.targetAudience?.trim() || null;
  const offerings = extractOfferings(input.pages);
  const primary = category ?? offerings[0] ?? null;

  const push = (suggestion: PromptSuggestion): void => {
    const normalized = suggestion.promptText.replace(/\s{2,}/g, " ").trim();
    if (normalized.length < 12) return;
    if (suggestions.some((entry) => entry.promptText.toLowerCase() === normalized.toLowerCase())) return;
    suggestions.push({ ...suggestion, promptText: normalized });
  };

  // ---- Category-led prompts ------------------------------------------------
  if (primary) {
    const subject = primary.toLowerCase();
    push({
      promptText: `What are the best ${subject} options${audience ? ` for ${audience.toLowerCase()}` : ""} in ${country}?`,
      group: "recommendation",
      intent: "Find the leading options in the category",
      topic: primary,
      source: "business_description",
      priority: 1,
    });
    push({
      promptText: `Which ${subject} should a small business choose?`,
      group: "solution",
      intent: "Narrow the category down to a fit",
      topic: primary,
      source: "business_description",
      priority: 1,
    });
    push({
      promptText: `How much does ${subject} cost in ${country}?`,
      group: "commercial",
      intent: "Understand pricing before buying",
      topic: primary,
      source: "business_description",
      priority: 2,
    });
    push({
      promptText: `What should I look for when choosing ${subject}?`,
      group: "awareness",
      intent: "Learn the evaluation criteria",
      topic: primary,
      source: "business_description",
      priority: 3,
    });
    push({
      promptText: `Is ${subject} worth it for a small team?`,
      group: "problem",
      intent: "Decide whether to solve the problem at all",
      topic: primary,
      source: "business_description",
      priority: 3,
    });
    push({
      promptText: `Best ${subject} near me in ${country}`,
      group: "local",
      intent: "Find a local provider",
      topic: primary,
      source: "business_description",
      priority: 4,
    });
  }

  // ---- Offering-led prompts ------------------------------------------------
  for (const offering of offerings.slice(0, 5)) {
    push({
      promptText: `Who provides ${offering.toLowerCase()}${audience ? ` for ${audience.toLowerCase()}` : ""}?`,
      group: "solution",
      intent: `Find providers of ${offering}`,
      topic: offering,
      source: "services",
      priority: 2,
    });
  }

  // ---- Competitor-led prompts ---------------------------------------------
  for (const competitor of input.competitors.slice(0, 5)) {
    push({
      promptText: `Best alternatives to ${competitor}`,
      group: "alternative",
      intent: `Find options other than ${competitor}`,
      topic: competitor,
      source: "competitors",
      priority: 1,
    });
    if (primary) {
      push({
        promptText: `${competitor} vs other ${primary.toLowerCase()}, which is better?`,
        group: "comparison",
        intent: `Compare ${competitor} against the field`,
        topic: competitor,
        source: "competitors",
        priority: 2,
      });
    }
  }

  // ---- Question headings already on the site ------------------------------
  const siteQuestions = unique(input.pages.flatMap((page) => page.questionHeadings)).slice(0, 8);
  for (const question of siteQuestions) {
    push({
      promptText: truncate(question, 160),
      group: "problem",
      intent: "A question this site already answers",
      topic: null,
      source: "headings",
      priority: 3,
    });
  }

  // ---- Search Console question queries ------------------------------------
  const questionQueries = (input.searchConsoleQueries ?? [])
    .filter((entry) => /^(what|why|how|when|where|which|who|can|should|is|are|does|do)\b/i.test(entry.query))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 8);

  for (const entry of questionQueries) {
    push({
      promptText: `${titleCase(entry.query.slice(0, 1))}${entry.query.slice(1)}${entry.query.endsWith("?") ? "" : "?"}`,
      group: "problem",
      intent: `Real Google query with ${entry.impressions.toLocaleString("en-IN")} impressions`,
      topic: null,
      source: "search_console",
      priority: 1,
    });
  }

  // ---- Brand prompts -------------------------------------------------------
  push({
    promptText: `What is ${input.brandName}?`,
    group: "brand",
    intent: "Check how engines describe your brand",
    topic: input.brandName,
    source: "website_content",
    priority: 2,
  });
  push({
    promptText: `Is ${input.brandName} any good?`,
    group: "brand",
    intent: "Check the sentiment engines express about you",
    topic: input.brandName,
    source: "website_content",
    priority: 2,
  });

  return suggestions.sort((a, b) => a.priority - b.priority);
}
