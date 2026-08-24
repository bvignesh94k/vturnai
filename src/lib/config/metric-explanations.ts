/**
 * Plain-language explanations attached to every metric in the product.
 *
 * The rule the whole product follows: if a number is on screen, a business
 * owner who has never done SEO must be able to hover it and understand what it
 * means, why it matters, how we worked it out and what to do about it.
 */

export interface MetricExplanation {
  label: string;
  whatItMeans: string;
  whyItMatters: string;
  howCalculated: string;
  howToImprove: string;
}

export const METRIC_EXPLANATIONS = {
  vScore: {
    label: "V Score",
    whatItMeans:
      "A single 0–100 rating of how visible and citable your website is across search engines and AI answer engines.",
    whyItMatters:
      "It is the one number to watch. If it rises, more of the places people look for answers can find, understand and recommend you.",
    howCalculated:
      "The weighted average of your SEO, AEO, GEO and Experience & Authority scores, using the published HEO weights (SEO 30%, AEO 20%, GEO 35%, Experience & Authority 15%). The full breakdown is shown on the score card.",
    howToImprove:
      "Work the Opportunities list from the top. It is already sorted by how much each fix moves this score for the effort involved.",
  },
  seoScore: {
    label: "SEO Score",
    whatItMeans:
      "How well traditional search engines like Google and Bing can crawl, understand and rank your pages.",
    whyItMatters:
      "Classic search is still where most buying journeys start, and AI engines lean heavily on pages that already rank well.",
    howCalculated:
      "Weighted from indexability, titles and descriptions, heading structure, content depth, internal linking, image hygiene and page performance, measured across every page in your last crawl.",
    howToImprove:
      "Clear the Critical and High issues in Website Audit first: missing titles, blocked pages and broken links cost the most.",
  },
  aeoScore: {
    label: "AEO Score",
    whatItMeans:
      "How ready your pages are to be lifted as a direct answer to a question, by featured snippets and answer engines.",
    whyItMatters:
      "Answer surfaces quote one short passage. If your page has no clean answer to quote, a competitor's does.",
    howCalculated:
      "Weighted from question-style headings, whether a concise answer follows each question, definitions, FAQ content, lists, tables, structured data and supporting evidence.",
    howToImprove:
      "Add a 40–70 word direct answer immediately under each question heading, and a comparison table on pages that help people choose.",
  },
  geoScore: {
    label: "GEO Score",
    whatItMeans:
      "How easily a generative AI engine can understand who you are, trust what you say, and cite you as a source.",
    whyItMatters:
      "AI engines summarise rather than list. Being understandable and verifiable is what gets you into the summary.",
    howCalculated:
      "Weighted from brand and entity consistency, clarity of your company and offerings, citation-worthy statements, original data, expert authorship, references, structured identity data and AI crawler accessibility.",
    howToImprove:
      "State the same company facts everywhere, publish something only you know, and back specific claims with a primary source.",
  },
  heoScore: {
    label: "HEO Score",
    whatItMeans:
      "Hybrid Engine Optimization: your combined readiness across classic search, answer engines and generative engines.",
    whyItMatters:
      "People move between Google, ChatGPT and Perplexity in a single decision. Being strong in only one of them leaks demand.",
    howCalculated:
      "The same weighted combination as your V Score: SEO 30%, AEO 20%, GEO 35%, Experience & Authority 15%.",
    howToImprove:
      "Look at which pillar is lowest on the breakdown, and prioritise opportunities tagged with that discipline.",
  },
  experienceAuthority: {
    label: "Experience & Authority",
    whatItMeans:
      "How much evidence your site gives that real, identifiable experts stand behind the content.",
    whyItMatters:
      "Both Google and AI engines discount anonymous content. Named expertise is the cheapest trust signal to add.",
    howCalculated:
      "Weighted from first-party expertise signals, author identity, trust signals such as contact and policy pages, external validation and page experience quality.",
    howToImprove:
      "Add real author bylines with bios, publish verifiable company details, and link your recognised external profiles.",
  },
  aiShareOfVoice: {
    label: "AI Share of Voice",
    whatItMeans:
      "Out of every time your brand or a tracked competitor is named in an AI answer, the share that was you.",
    whyItMatters:
      "It shows whether you are winning the conversation, not just present in it. Rising share means you are taking ground.",
    howCalculated:
      "Your mentions divided by the total mentions of you plus your tracked competitors, across every valid AI response in the period.",
    howToImprove:
      "Target the prompts where competitors appear and you do not. Competitors → Content Gaps lists exactly which topics those are.",
  },
  brandMentionRate: {
    label: "Brand Mention Rate",
    whatItMeans: "How often AI engines name your brand when answering the prompts you track.",
    whyItMatters:
      "Being named is the entry ticket. An engine cannot recommend a brand it never brings up.",
    howCalculated:
      "Valid AI responses that mention your brand, divided by all valid AI responses in the period. Failed or errored runs are excluded.",
    howToImprove:
      "Publish clear pages for the topics behind your tracked prompts, and make sure your brand name appears alongside the category it belongs to.",
  },
  citationRate: {
    label: "Citation Rate",
    whatItMeans: "How often AI engines link to your domain as a source in their answers.",
    whyItMatters:
      "Citations are the AI equivalent of a ranking position: they send real visitors and prove the engine trusts the page.",
    howCalculated:
      "Valid AI responses citing at least one URL on your domain, divided by all valid AI responses. Only engines that return source lists contribute.",
    howToImprove:
      "Raise Citation Readiness on your key pages: add specific facts, statistics, sources, a named author and a visible updated date.",
  },
  recommendationRate: {
    label: "Recommendation Rate",
    whatItMeans:
      "How often an AI answer actively recommends you, rather than only listing you in passing.",
    whyItMatters: "Recommendation is what converts. Being mentioned last in a list of nine does not.",
    howCalculated:
      "Valid AI responses where the answer positively recommends your brand, divided by all valid responses. Recommendation is judged from the answer text, not merely from your name appearing.",
    howToImprove:
      "Give engines something to recommend on: clear pricing, a stated ideal customer, proof, and honest comparisons against alternatives.",
  },
  promptCoverage: {
    label: "Prompt Coverage",
    whatItMeans: "The share of your tracked prompts where your brand shows up at least once.",
    whyItMatters:
      "It tells you how much of your intent map you own, and which questions you are completely absent from.",
    howCalculated:
      "Tracked prompts with at least one mention on any monitored engine, divided by all tracked prompts that were executed.",
    howToImprove:
      "Open Prompt Tracker, filter to prompts with zero mentions, and create or improve a page that genuinely answers each one.",
  },
  engineConsistency: {
    label: "Engine Consistency",
    whatItMeans:
      "For the same question, the share of monitored engines that mention you.",
    whyItMatters:
      "Appearing on one engine and nowhere else usually means a source-coverage gap rather than a content-quality problem.",
    howCalculated:
      "For each prompt, engines mentioning your brand divided by engines that returned a valid answer, then averaged across prompts.",
    howToImprove:
      "Engines draw on different sources. Strengthen your presence on the third-party sites and directories the engines you are missing tend to cite.",
  },
  citationDiversity: {
    label: "Citation Diversity",
    whatItMeans: "How many different pages on your site AI engines have cited.",
    whyItMatters:
      "If everything depends on one page, one algorithm change can erase your AI visibility overnight.",
    howCalculated: "The count of distinct URLs on your domain cited across all AI runs in the period.",
    howToImprove:
      "Build citation-worthy depth beyond the homepage: guides, data pages and comparisons each earn their own citations.",
  },
  trackedPrompts: {
    label: "Tracked Prompts",
    whatItMeans: "The number of real questions you are monitoring across AI engines.",
    whyItMatters:
      "Prompts, not keywords, are how people ask AI engines. Your tracked set defines what you can measure.",
    howCalculated: "Count of prompts marked active on this project. Your plan caps how many can be active at once.",
    howToImprove:
      "Keep the set focused on questions with commercial intent. Retire prompts that never produce a decision.",
  },
  enginesMonitoring: {
    label: "AI Engines Monitoring",
    whatItMeans: "How many AI engines are currently connected and returning results for this project.",
    whyItMatters:
      "Each engine has its own sources and habits. More connected engines means a less biased picture.",
    howCalculated:
      "Engines with valid credentials that returned at least one successful response in the last scan. Engines lacking credentials are reported as unavailable, never estimated.",
    howToImprove: "Add the missing provider API keys under Integrations.",
  },
  googleClicks: {
    label: "Google Organic Clicks",
    whatItMeans: "Visits from unpaid Google search results in the selected period.",
    whyItMatters: "It is the clearest measure of demand you are actually capturing from classic search.",
    howCalculated: "Summed from Google Search Console performance data for your verified property.",
    howToImprove:
      "Improve titles and descriptions on pages with many impressions but few clicks. Opportunities flags these automatically.",
  },
  googleImpressions: {
    label: "Google Impressions",
    whatItMeans: "How many times your pages appeared in Google results, whether or not they were clicked.",
    whyItMatters: "High impressions with low clicks means you are visible but not compelling.",
    howCalculated: "Summed from Google Search Console performance data for your verified property.",
    howToImprove: "Target queries you already rank 4–20 for; small position gains there produce large impression gains.",
  },
  averagePosition: {
    label: "Average Google Position",
    whatItMeans: "Your mean ranking position across the queries where you appeared.",
    whyItMatters: "Movement from position 11 to 8 typically matters far more than movement from 40 to 30.",
    howCalculated: "The impression-weighted average position reported by Google Search Console. Lower is better.",
    howToImprove: "Focus on queries ranking 4–20 where a small improvement crosses a visibility threshold.",
  },
  criticalIssues: {
    label: "Critical Issues",
    whatItMeans: "Problems currently blocking search engines or AI engines from using your site properly.",
    whyItMatters: "Nothing else you do compounds while a critical issue is live.",
    howCalculated: "Open issues classified Critical by the audit, counted across all crawled pages.",
    howToImprove: "Fix them first. Each issue lists the affected URLs and an exact implementation example.",
  },
  citationReadiness: {
    label: "Citation Readiness",
    whatItMeans: "How likely a specific page is to be quoted or linked by an AI engine.",
    whyItMatters:
      "Pages score badly here for fixable reasons: no facts to quote, no author, no date, nothing unique.",
    howCalculated:
      "Weighted from factual statements, unique information, statistics, sources, author, updated date, definitions, tables, FAQs, structured data and evidence of first-hand expertise.",
    howToImprove:
      "Add one specific, checkable fact and one primary source per section, then attach a named author and a visible last-updated date.",
  },
  entityConsistency: {
    label: "Entity Consistency",
    whatItMeans:
      "Whether your site tells the same story about your company on every page.",
    whyItMatters:
      "Contradictions (two founding years, two addresses) make AI engines uncertain, and uncertain engines stay quiet about you.",
    howCalculated:
      "We extract company facts from every crawled page and compare them. Any conflicting value is raised as an entity consistency issue.",
    howToImprove: "Pick the correct value, correct every page that disagrees, and state it in Organization schema.",
  },
  sentiment: {
    label: "Sentiment",
    whatItMeans: "The tone an AI engine takes about your brand when it mentions you.",
    whyItMatters: "Being mentioned negatively is worse than not being mentioned at all.",
    howCalculated:
      "Classified from the answer text of each valid AI response and aggregated per engine. Reported as unknown when no mention occurred.",
    howToImprove:
      "Look at the stored answers behind negative results: they usually quote a specific complaint or an out-of-date fact you can correct.",
  },
  opportunityPriority: {
    label: "Priority Score",
    whatItMeans: "How valuable this action is relative to everything else on your list.",
    whyItMatters: "It stops you spending a week on a cosmetic fix while a critical one is still open.",
    howCalculated:
      "A weighted formula over issue severity, visibility impact, number of affected pages, traffic potential from Search Console, AI prompt opportunity and estimated effort.",
    howToImprove: "Work top-down. Completing high-priority items is what moves your V Score fastest.",
  },
} as const satisfies Record<string, MetricExplanation>;

export type MetricKey = keyof typeof METRIC_EXPLANATIONS;

export function explain(key: MetricKey): MetricExplanation {
  return METRIC_EXPLANATIONS[key];
}
