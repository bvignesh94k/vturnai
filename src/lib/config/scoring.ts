/**
 * Scoring configuration.
 *
 * Every weight the product uses to produce a score lives in this file. Nothing
 * elsewhere may hard-code a weight, the score breakdown UI reads these same
 * objects so what we show the user is provably what we computed.
 */

export interface WeightedComponent {
  key: string;
  label: string;
  /** Weight within its parent group. Weights in a group must sum to 1. */
  weight: number;
  description: string;
}

/** HEO, the unified V Score. */
export const HEO_WEIGHTS = {
  seo: 0.3,
  aeo: 0.2,
  geo: 0.35,
  experienceAuthority: 0.15,
} as const;

export type HeoComponentKey = keyof typeof HEO_WEIGHTS;

export const HEO_COMPONENT_LABELS: Record<HeoComponentKey, string> = {
  seo: "SEO: technical & on-page health",
  aeo: "AEO: answer readiness",
  geo: "GEO: generative engine readiness",
  experienceAuthority: "Experience & Authority",
};

/** SEO sub-scores. */
export const SEO_WEIGHTS: readonly WeightedComponent[] = [
  {
    key: "indexability",
    label: "Indexability & crawlability",
    weight: 0.22,
    description: "Whether search engines can reach, crawl and index your pages at all.",
  },
  {
    key: "metadata",
    label: "Titles & meta descriptions",
    weight: 0.18,
    description: "Presence, length and uniqueness of the text that appears in search results.",
  },
  {
    key: "structure",
    label: "Heading & content structure",
    weight: 0.16,
    description: "A single clear H1 and a logical heading hierarchy on every page.",
  },
  {
    key: "contentDepth",
    label: "Content depth",
    weight: 0.14,
    description: "Whether pages carry enough substance to be worth ranking.",
  },
  {
    key: "internalLinking",
    label: "Internal linking",
    weight: 0.12,
    description: "How well pages connect to each other so authority and crawlers flow through.",
  },
  {
    key: "media",
    label: "Images & media hygiene",
    weight: 0.08,
    description: "Alt text and media handling that make pages accessible and understandable.",
  },
  {
    key: "performance",
    label: "Performance & Core Web Vitals",
    weight: 0.1,
    description: "How fast and stable pages feel to a real visitor.",
  },
] as const;

/** AEO sub-scores, is this page usable as a direct answer? */
export const AEO_WEIGHTS: readonly WeightedComponent[] = [
  {
    key: "questionTargeting",
    label: "Question targeting",
    weight: 0.12,
    description: "Whether headings phrase the actual questions people ask.",
  },
  {
    key: "directAnswers",
    label: "Direct answer availability",
    weight: 0.14,
    description: "A concise, self-contained answer immediately after each question.",
  },
  {
    key: "definitionClarity",
    label: "Definition clarity",
    weight: 0.08,
    description: "Terms and entities defined plainly before they are discussed.",
  },
  {
    key: "headingStructure",
    label: "Heading structure",
    weight: 0.08,
    description: "Clean H1 to H3 nesting an answer engine can segment reliably.",
  },
  {
    key: "faqUsefulness",
    label: "FAQ usefulness",
    weight: 0.08,
    description: "Real visible FAQ content that resolves follow-up questions.",
  },
  {
    key: "schema",
    label: "Structured data",
    weight: 0.1,
    description: "Schema markup that matches the content actually on the page.",
  },
  {
    key: "lists",
    label: "Lists",
    weight: 0.05,
    description: "Scannable steps and bullet sets that extract cleanly.",
  },
  {
    key: "tables",
    label: "Tables",
    weight: 0.05,
    description: "Comparison tables that answer choice questions in one glance.",
  },
  {
    key: "conciseness",
    label: "Concise factual answers",
    weight: 0.07,
    description: "Answer paragraphs short enough to quote in full.",
  },
  {
    key: "entityClarity",
    label: "Entity clarity",
    weight: 0.06,
    description: "Unambiguous naming of your brand, products and people.",
  },
  {
    key: "semanticCompleteness",
    label: "Semantic completeness",
    weight: 0.06,
    description: "Coverage of the sub-topics a reader expects alongside the main one.",
  },
  {
    key: "evidence",
    label: "Supporting evidence",
    weight: 0.05,
    description: "Claims backed by data, sources or first-hand detail.",
  },
  {
    key: "authorInfo",
    label: "Author information",
    weight: 0.03,
    description: "A named, credible author attached to the content.",
  },
  {
    key: "freshness",
    label: "Freshness",
    weight: 0.02,
    description: "A visible published or updated date that is recent enough to trust.",
  },
  {
    key: "contextualLinks",
    label: "Internal contextual links",
    weight: 0.01,
    description: "In-body links that place the page inside a topic cluster.",
  },
] as const;

/** GEO sub-scores, can a generative engine understand, trust and cite you? */
export const GEO_WEIGHTS: readonly WeightedComponent[] = [
  {
    key: "entityConsistency",
    label: "Brand & entity consistency",
    weight: 0.12,
    description: "The same facts about your company stated the same way everywhere.",
  },
  {
    key: "companyDescription",
    label: "Clear company description",
    weight: 0.08,
    description: "A plain sentence stating what the company is and who it serves.",
  },
  {
    key: "offeringClarity",
    label: "Products & services clarity",
    weight: 0.09,
    description: "Named, described offerings rather than vague capability claims.",
  },
  {
    key: "citationWorthy",
    label: "Citation-worthy statements",
    weight: 0.1,
    description: "Specific, checkable statements a model can safely quote.",
  },
  {
    key: "originalData",
    label: "Original research & data",
    weight: 0.08,
    description: "Numbers or findings that exist only on your site.",
  },
  {
    key: "expertAuthorship",
    label: "Expert authorship",
    weight: 0.07,
    description: "Named experts with stated credentials behind the content.",
  },
  {
    key: "references",
    label: "References & source quality",
    weight: 0.07,
    description: "Outbound links to primary sources that corroborate your claims.",
  },
  {
    key: "pageStructure",
    label: "Page structure",
    weight: 0.07,
    description: "Predictable structure that survives being chunked by a model.",
  },
  {
    key: "organizationSchema",
    label: "Organization & person schema",
    weight: 0.08,
    description: "Machine-readable identity for your company and its people.",
  },
  {
    key: "sameAs",
    label: "sameAs & entity references",
    weight: 0.05,
    description: "Links that tie your site to the same entity elsewhere on the web.",
  },
  {
    key: "aboutContact",
    label: "About & contact completeness",
    weight: 0.06,
    description: "Verifiable company details an engine can cross-check.",
  },
  {
    key: "indexability",
    label: "Indexability & AI crawler access",
    weight: 0.07,
    description: "Whether AI crawlers are permitted to fetch your content at all.",
  },
  {
    key: "freshness",
    label: "Content freshness",
    weight: 0.03,
    description: "Recently reviewed content that models prefer over stale pages.",
  },
  {
    key: "comparisonUsefulness",
    label: "Comparison usefulness",
    weight: 0.03,
    description: "Honest comparisons that answer 'which should I choose?'.",
  },
] as const;

/** Experience & Authority, the fourth HEO pillar. */
export const EXPERIENCE_AUTHORITY_WEIGHTS: readonly WeightedComponent[] = [
  {
    key: "firstPartyExpertise",
    label: "First-party expertise",
    weight: 0.28,
    description: "Evidence the content comes from people who actually do the work.",
  },
  {
    key: "authorIdentity",
    label: "Author identity",
    weight: 0.2,
    description: "Named authors with bios and, where relevant, Person schema.",
  },
  {
    key: "trustSignals",
    label: "Trust signals",
    weight: 0.22,
    description: "Contact details, policies and company facts a buyer can verify.",
  },
  {
    key: "externalValidation",
    label: "External validation",
    weight: 0.16,
    description: "Recognisable third-party profiles and references pointing at you.",
  },
  {
    key: "performanceExperience",
    label: "Experience quality",
    weight: 0.14,
    description: "Speed, accessibility and mobile behaviour on the pages that matter.",
  },
] as const;

/** Citation readiness, scored per page. */
export const CITATION_READINESS_WEIGHTS: readonly WeightedComponent[] = [
  { key: "factualStatements", label: "Clear factual statements", weight: 0.12, description: "Statements a model can lift without hedging." },
  { key: "uniqueInformation", label: "Unique information", weight: 0.11, description: "Content that is not a restatement of what is already ranked." },
  { key: "statistics", label: "Statistics", weight: 0.1, description: "Concrete figures with units and context." },
  { key: "research", label: "Research", weight: 0.07, description: "Described method or dataset behind the numbers." },
  { key: "sources", label: "Sources", weight: 0.09, description: "Outbound citations to credible primary sources." },
  { key: "author", label: "Author", weight: 0.08, description: "A named author the reader can evaluate." },
  { key: "lastUpdated", label: "Last updated date", weight: 0.07, description: "A visible date showing the page is maintained." },
  { key: "definitions", label: "Definitions", weight: 0.07, description: "Key terms defined in one sentence." },
  { key: "tables", label: "Tables", weight: 0.06, description: "Structured comparisons that survive extraction." },
  { key: "faqs", label: "FAQs", weight: 0.06, description: "Question and answer pairs covering follow-ups." },
  { key: "structuredData", label: "Structured data", weight: 0.07, description: "Schema that matches the visible content." },
  { key: "entityClarity", label: "Entity clarity", weight: 0.05, description: "Unambiguous naming of the subject." },
  { key: "originalExpertise", label: "Original expertise", weight: 0.05, description: "First-hand experience rather than summary." },
] as const;

/** Opportunity priority formula inputs. */
export const OPPORTUNITY_PRIORITY_WEIGHTS = {
  severity: 0.3,
  visibilityImpact: 0.25,
  affectedPages: 0.15,
  trafficPotential: 0.15,
  aiPromptOpportunity: 0.1,
  effort: 0.05,
} as const;

export const SEVERITY_SCORES = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  information: 10,
} as const;

export type IssueSeverity = keyof typeof SEVERITY_SCORES;

export const EFFORT_SCORES = {
  easy: 100,
  moderate: 60,
  advanced: 25,
} as const;

export type EffortLevel = keyof typeof EFFORT_SCORES;

export const SCORE_BANDS = [
  { min: 85, label: "Excellent", tone: "success" as const },
  { min: 70, label: "Good", tone: "info" as const },
  { min: 50, label: "Needs work", tone: "warning" as const },
  { min: 0, label: "At risk", tone: "destructive" as const },
];

export function scoreBand(score: number): (typeof SCORE_BANDS)[number] {
  return SCORE_BANDS.find((band) => score >= band.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]!;
}

/** Assert at module load that every weight group is internally consistent. */
function assertWeightsSumToOne(name: string, components: readonly WeightedComponent[]): void {
  const total = components.reduce((sum, component) => sum + component.weight, 0);
  if (Math.abs(total - 1) > 0.0005) {
    throw new Error(`${name} weights must sum to 1, got ${total.toFixed(4)}`);
  }
}

assertWeightsSumToOne("SEO_WEIGHTS", SEO_WEIGHTS);
assertWeightsSumToOne("AEO_WEIGHTS", AEO_WEIGHTS);
assertWeightsSumToOne("GEO_WEIGHTS", GEO_WEIGHTS);
assertWeightsSumToOne("EXPERIENCE_AUTHORITY_WEIGHTS", EXPERIENCE_AUTHORITY_WEIGHTS);
assertWeightsSumToOne("CITATION_READINESS_WEIGHTS", CITATION_READINESS_WEIGHTS);

const heoTotal = Object.values(HEO_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
if (Math.abs(heoTotal - 1) > 0.0005) {
  throw new Error(`HEO_WEIGHTS must sum to 1, got ${heoTotal}`);
}
