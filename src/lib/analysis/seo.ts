/**
 * SEO analysis.
 *
 * Operates on a whole crawl rather than a page at a time, because the findings
 * that matter most — duplicate titles, orphan pages, broken internal links,
 * canonical conflicts — only exist in relation to other pages.
 */

import type { CrawledPage } from "@/lib/crawler/crawler";
import { normalizeUrl } from "@/lib/crawler/url";
import { composeSeoScore, issuePenaltyScore, passRateScore } from "@/lib/metrics/scores";
import type { ScoreComponent } from "@/lib/metrics/scores";
import { percentage, round, truncate, unique } from "@/lib/utils";
import type { AnalysisIssue } from "@/lib/analysis/types";

export const TITLE_MIN = 30;
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;
export const THIN_CONTENT_WORDS = 250;

export interface SeoAnalysisInput {
  siteUrl: string;
  pages: readonly CrawledPage[];
  /** URLs declared in the sitemap, used to detect sitemap/crawl mismatch. */
  sitemapUrls?: readonly string[];
  /** Blocked AI crawler agents, surfaced as a GEO-critical SEO finding. */
  blockedAiCrawlers?: readonly { agent: string; engine: string; scope: string }[];
  /** Optional performance signal, 0–100, from PageSpeed on key pages. */
  performanceScore?: number | null;
}

export interface SeoAnalysisResult {
  score: number;
  components: ScoreComponent[];
  issues: AnalysisIssue[];
  stats: {
    totalPages: number;
    okPages: number;
    errorPages: number;
    indexablePages: number;
    noindexPages: number;
    averageWordCount: number;
    pagesWithTitle: number;
    pagesWithDescription: number;
    pagesWithSingleH1: number;
    pagesWithStructuredData: number;
    brokenInternalLinks: number;
    orphanPages: number;
  };
}

function successfulPages(pages: readonly CrawledPage[]) {
  return pages.filter((page) => page.page !== null && page.httpStatus !== null && page.httpStatus < 400);
}

function issue(partial: AnalysisIssue): AnalysisIssue {
  return partial;
}

/** Group values by a key, returning only groups with more than one member. */
function duplicatesBy<T>(items: readonly T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) groups.delete(key);
  }
  return groups;
}

export function analyseSeo(input: SeoAnalysisInput): SeoAnalysisResult {
  const pages = input.pages;
  const ok = successfulPages(pages);
  const total = pages.length;
  const issues: AnalysisIssue[] = [];

  // ---- HTTP errors ---------------------------------------------------------
  const errorPages = pages.filter((page) => (page.httpStatus ?? 0) >= 400 || page.fetchError);
  const serverErrors = errorPages.filter((page) => (page.httpStatus ?? 0) >= 500);
  const notFound = errorPages.filter((page) => page.httpStatus === 404);

  if (serverErrors.length > 0) {
    issues.push(
      issue({
        code: "server_errors",
        title: `${serverErrors.length} page${serverErrors.length === 1 ? "" : "s"} returned a server error`,
        description:
          "These URLs returned a 5xx status. Search engines treat repeated server errors as a signal the site is unreliable and will crawl it less often.",
        severity: "critical",
        disciplines: ["seo", "geo"],
        whyItMatters:
          "A page that errors cannot rank, cannot be read by an AI engine and wastes the crawl budget that would otherwise reach your working pages.",
        seoImpact: "Pages are dropped from the index and overall crawl frequency falls.",
        aeoImpact: "Answer engines cannot extract an answer from a page that does not load.",
        geoImpact: "AI engines skip the URL entirely and cite a competitor instead.",
        recommendation:
          "Check your server or hosting error logs for these URLs, fix the underlying failure, then request re-crawling in Search Console.",
        implementationExample:
          "If the page has genuinely been removed, return 410 Gone. If it moved, return a 301 redirect to the closest equivalent page.",
        effort: "moderate",
        affectedUrls: serverErrors.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  if (notFound.length > 0) {
    issues.push(
      issue({
        code: "not_found_pages",
        title: `${notFound.length} page${notFound.length === 1 ? "" : "s"} returned 404 Not Found`,
        description:
          "These URLs are linked from your site or listed in your sitemap but do not exist.",
        severity: notFound.length > 5 ? "high" : "medium",
        disciplines: ["seo"],
        whyItMatters:
          "Visitors who reach a dead link usually leave, and every internal link pointing at a missing page throws away the authority that link was passing.",
        seoImpact: "Link equity is lost and crawl budget is spent on nothing.",
        aeoImpact: "Any answer that once came from these pages is gone.",
        geoImpact: "Existing AI citations pointing at these URLs now resolve to nothing.",
        recommendation:
          "Redirect each removed URL to the closest relevant page with a 301, or restore the content. Remove them from your sitemap either way.",
        implementationExample:
          "In Next.js, add to next.config.ts:\n\nasync redirects() {\n  return [{ source: '/old-page', destination: '/new-page', permanent: true }];\n}",
        effort: "easy",
        affectedUrls: notFound.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- Redirect chains -----------------------------------------------------
  const chained = pages.filter((page) => page.redirectChain.length > 1);
  if (chained.length > 0) {
    issues.push(
      issue({
        code: "redirect_chains",
        title: `${chained.length} URL${chained.length === 1 ? "" : "s"} redirect more than once`,
        description:
          "These URLs pass through two or more redirects before reaching the final page.",
        severity: "medium",
        disciplines: ["seo"],
        whyItMatters:
          "Each hop adds delay for the visitor and dilutes the ranking signal being passed along the chain.",
        seoImpact: "Slower crawling and a weaker signal reaching the destination page.",
        aeoImpact: "Some answer engines stop following after the first hop.",
        geoImpact: "AI crawlers may abandon a URL that redirects repeatedly.",
        recommendation: "Point the first URL directly at the final destination in a single 301.",
        implementationExample:
          "Replace /a → /b → /c with /a → /c, and update any internal links that still point at /a.",
        effort: "easy",
        affectedUrls: chained.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- Titles --------------------------------------------------------------
  const missingTitle = ok.filter((page) => !page.page?.title);
  const longTitle = ok.filter((page) => (page.page?.titleLength ?? 0) > TITLE_MAX);
  const shortTitle = ok.filter(
    (page) => (page.page?.titleLength ?? 0) > 0 && (page.page?.titleLength ?? 0) < TITLE_MIN,
  );
  const duplicateTitles = duplicatesBy(ok, (page) => page.page?.title?.toLowerCase().trim() ?? null);

  if (missingTitle.length > 0) {
    issues.push(
      issue({
        code: "missing_title",
        title: `${missingTitle.length} page${missingTitle.length === 1 ? "" : "s"} have no title tag`,
        description: "The title tag is the headline shown in search results and the strongest single on-page signal of what a page is about.",
        severity: "critical",
        disciplines: ["seo", "aeo", "geo"],
        whyItMatters:
          "Without a title, search engines invent one from your page content — usually badly — and AI engines lose the clearest statement of what the page covers.",
        seoImpact: "Rankings suffer and the search result looks untrustworthy.",
        aeoImpact: "Answer engines cannot match the page to a question reliably.",
        geoImpact: "Generative engines lose the primary label for the page's topic.",
        recommendation: `Write a unique ${TITLE_MIN}–${TITLE_MAX} character title for each page that names the topic and the brand.`,
        implementationExample:
          "<title>Affordable CRM Software for Indian SMEs | Acme</title>",
        effort: "easy",
        affectedUrls: missingTitle.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  if (duplicateTitles.size > 0) {
    const affected = [...duplicateTitles.values()].flat();
    issues.push(
      issue({
        code: "duplicate_titles",
        title: `${duplicateTitles.size} title${duplicateTitles.size === 1 ? " is" : "s are"} used on more than one page`,
        description: "Multiple pages share the same title tag.",
        severity: "high",
        disciplines: ["seo"],
        whyItMatters:
          "When several pages claim the same title, search engines cannot tell which one to rank, so they often rank none of them well.",
        seoImpact: "Pages compete with each other for the same query.",
        aeoImpact: "Answer engines cannot decide which page holds the definitive answer.",
        geoImpact: "Duplicate labelling makes your site harder for an AI engine to summarise.",
        recommendation:
          "Give each page a title that describes what is unique about it, not just the site or category.",
        implementationExample:
          "Instead of 'Services | Acme' on six pages, use 'CRM Implementation Services | Acme', 'CRM Migration Services | Acme', and so on.",
        effort: "easy",
        affectedUrls: affected.slice(0, 50).map((page) => page.url),
        evidence: { duplicateTitles: [...duplicateTitles.keys()].slice(0, 10) },
      }),
    );
  }

  if (longTitle.length > 0) {
    issues.push(
      issue({
        code: "long_title",
        title: `${longTitle.length} title${longTitle.length === 1 ? "" : "s"} will be cut off in search results`,
        description: `These titles exceed ${TITLE_MAX} characters.`,
        severity: "low",
        disciplines: ["seo"],
        whyItMatters:
          "Google truncates long titles, so the part you cared about most may never be seen by the person deciding whether to click.",
        seoImpact: "Lower click-through rate from the same ranking position.",
        aeoImpact: null,
        geoImpact: null,
        recommendation: `Keep titles under ${TITLE_MAX} characters, with the most important words first.`,
        implementationExample: "Put the specific topic before the brand name, not after a long qualifier.",
        effort: "easy",
        affectedUrls: longTitle.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  if (shortTitle.length > 0) {
    issues.push(
      issue({
        code: "short_title",
        title: `${shortTitle.length} title${shortTitle.length === 1 ? " is" : "s are"} too short to be useful`,
        description: `These titles are under ${TITLE_MIN} characters.`,
        severity: "low",
        disciplines: ["seo", "aeo"],
        whyItMatters:
          "A two-word title wastes the most valuable text on the page and tells neither a searcher nor an engine what they will get.",
        seoImpact: "Missed opportunity to match the phrases people actually search.",
        aeoImpact: "Weaker topical match for question-style queries.",
        geoImpact: null,
        recommendation: `Expand to ${TITLE_MIN}–${TITLE_MAX} characters, describing the specific value of the page.`,
        implementationExample: "'Pricing' → 'CRM Pricing Plans for Small Teams in India | Acme'",
        effort: "easy",
        affectedUrls: shortTitle.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- Meta descriptions ---------------------------------------------------
  const missingDescription = ok.filter((page) => !page.page?.metaDescription);
  const duplicateDescriptions = duplicatesBy(
    ok,
    (page) => page.page?.metaDescription?.toLowerCase().trim() ?? null,
  );
  const longDescription = ok.filter(
    (page) => (page.page?.metaDescriptionLength ?? 0) > DESCRIPTION_MAX,
  );

  if (missingDescription.length > 0) {
    issues.push(
      issue({
        code: "missing_meta_description",
        title: `${missingDescription.length} page${missingDescription.length === 1 ? "" : "s"} have no meta description`,
        description:
          "The meta description is the snippet shown under your title in search results.",
        severity: "medium",
        disciplines: ["seo", "aeo"],
        whyItMatters:
          "Without one, the search engine pulls an arbitrary sentence from the page, which frequently reads as nonsense and costs you clicks.",
        seoImpact: "Lower click-through rate from search results.",
        aeoImpact: "Loses a clean, quotable summary of the page.",
        geoImpact: "Removes a concise statement an AI engine could use to describe the page.",
        recommendation: `Write a ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} character description that states the benefit and includes the main phrase.`,
        implementationExample:
          '<meta name="description" content="Compare CRM plans built for Indian SMEs. Transparent pricing from ₹499/month, GST invoicing and a 7-day free trial." />',
        effort: "easy",
        affectedUrls: missingDescription.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  if (duplicateDescriptions.size > 0) {
    issues.push(
      issue({
        code: "duplicate_meta_description",
        title: `${duplicateDescriptions.size} meta description${duplicateDescriptions.size === 1 ? " is" : "s are"} reused across pages`,
        description: "Several pages share an identical meta description.",
        severity: "low",
        disciplines: ["seo"],
        whyItMatters:
          "Identical snippets make your results look templated and give a searcher no reason to prefer one page over another.",
        seoImpact: "Reduced click-through rate and weaker topical differentiation.",
        aeoImpact: null,
        geoImpact: null,
        recommendation: "Write a distinct description per page describing what that page specifically offers.",
        implementationExample: null,
        effort: "easy",
        affectedUrls: [...duplicateDescriptions.values()].flat().slice(0, 50).map((page) => page.url),
      }),
    );
  }

  if (longDescription.length > 0) {
    issues.push(
      issue({
        code: "long_meta_description",
        title: `${longDescription.length} meta description${longDescription.length === 1 ? "" : "s"} will be truncated`,
        description: `These descriptions exceed ${DESCRIPTION_MAX} characters.`,
        severity: "information",
        disciplines: ["seo"],
        whyItMatters: "The tail of a long description is replaced with an ellipsis, so any call to action at the end is never read.",
        seoImpact: "Slightly reduced click-through rate.",
        aeoImpact: null,
        geoImpact: null,
        recommendation: `Trim to ${DESCRIPTION_MAX} characters, leading with the benefit.`,
        implementationExample: null,
        effort: "easy",
        affectedUrls: longDescription.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- Headings ------------------------------------------------------------
  const missingH1 = ok.filter((page) => (page.page?.h1.length ?? 0) === 0);
  const multipleH1 = ok.filter((page) => (page.page?.h1.length ?? 0) > 1);
  const brokenHierarchy = ok.filter(
    (page) => (page.page?.h3.length ?? 0) > 0 && (page.page?.h2.length ?? 0) === 0,
  );

  if (missingH1.length > 0) {
    issues.push(
      issue({
        code: "missing_h1",
        title: `${missingH1.length} page${missingH1.length === 1 ? " has" : "s have"} no H1 heading`,
        description: "The H1 is the on-page headline that states what the page is about.",
        severity: "high",
        disciplines: ["seo", "aeo", "geo"],
        whyItMatters:
          "Both search engines and AI engines use the H1 to decide the page's subject. Without one, they guess from surrounding markup.",
        seoImpact: "Weaker topical relevance for the page's target query.",
        aeoImpact: "Answer engines struggle to identify what question this page answers.",
        geoImpact: "Generative engines have no clear label for the content when summarising.",
        recommendation: "Add exactly one H1 per page that states the page's topic in plain language.",
        implementationExample: "<h1>CRM Software for Small Businesses in India</h1>",
        effort: "easy",
        affectedUrls: missingH1.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  if (multipleH1.length > 0) {
    issues.push(
      issue({
        code: "multiple_h1",
        title: `${multipleH1.length} page${multipleH1.length === 1 ? " has" : "s have"} more than one H1`,
        description: "Several H1 headings appear on the same page.",
        severity: "medium",
        disciplines: ["seo", "aeo"],
        whyItMatters:
          "Multiple H1s split the page's stated subject, so neither an engine nor a reader can tell what the page is primarily about.",
        seoImpact: "Diluted topical signal.",
        aeoImpact: "Harder for an answer engine to segment the page into question and answer.",
        geoImpact: "Ambiguous structure when the page is chunked for retrieval.",
        recommendation: "Keep one H1 and demote the rest to H2.",
        implementationExample: "Change the secondary <h1>Our Features</h1> to <h2>Our Features</h2>.",
        effort: "easy",
        affectedUrls: multipleH1.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  if (brokenHierarchy.length > 0) {
    issues.push(
      issue({
        code: "heading_hierarchy",
        title: `${brokenHierarchy.length} page${brokenHierarchy.length === 1 ? "" : "s"} skip heading levels`,
        description: "H3 headings appear without any H2 above them.",
        severity: "low",
        disciplines: ["seo", "aeo"],
        whyItMatters:
          "Heading levels are how a machine reads the outline of your page. Skipping a level breaks that outline and hurts screen-reader users too.",
        seoImpact: "Weaker structural understanding of the content.",
        aeoImpact: "Answer engines rely on heading nesting to extract self-contained sections.",
        geoImpact: "Poor chunking when the page is split for retrieval.",
        recommendation: "Use headings in order: H1, then H2 for sections, then H3 for sub-sections.",
        implementationExample: null,
        effort: "easy",
        affectedUrls: brokenHierarchy.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- Indexability --------------------------------------------------------
  const noindexPages = ok.filter((page) => page.page?.noindex);
  if (noindexPages.length > 0) {
    issues.push(
      issue({
        code: "noindex_pages",
        title: `${noindexPages.length} page${noindexPages.length === 1 ? " is" : "s are"} set to noindex`,
        description: "These pages instruct search engines not to index them.",
        severity: noindexPages.length > total * 0.2 ? "critical" : "medium",
        disciplines: ["seo", "geo"],
        whyItMatters:
          "A noindex page cannot appear in search results at all. This is often left over from a staging site and forgotten.",
        seoImpact: "The page is completely invisible in search.",
        aeoImpact: "The page cannot be surfaced as an answer.",
        geoImpact: "Engines that respect indexing directives will not cite the page.",
        recommendation:
          "Remove the noindex directive from any page you want found. Keep it only on genuinely private or duplicate pages.",
        implementationExample:
          'Remove <meta name="robots" content="noindex" /> or change it to <meta name="robots" content="index, follow" />',
        effort: "easy",
        affectedUrls: noindexPages.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- Canonicals ----------------------------------------------------------
  const missingCanonical = ok.filter((page) => !page.page?.canonicalUrl);
  const crossDomainCanonical = ok.filter((page) => {
    const canonical = page.page?.canonicalUrl;
    if (!canonical) return false;
    try {
      return new URL(canonical).origin !== new URL(input.siteUrl).origin;
    } catch {
      return false;
    }
  });
  const canonicalGroups = duplicatesBy(ok, (page) => page.page?.canonicalUrl ?? null);

  if (crossDomainCanonical.length > 0) {
    issues.push(
      issue({
        code: "cross_domain_canonical",
        title: `${crossDomainCanonical.length} page${crossDomainCanonical.length === 1 ? "" : "s"} point their canonical at another domain`,
        description: "The canonical tag names a URL on a different origin.",
        severity: "critical",
        disciplines: ["seo"],
        whyItMatters:
          "You are telling search engines that the real version of this page lives somewhere else, so your copy will not rank.",
        seoImpact: "Ranking credit is handed to the other domain.",
        aeoImpact: "Answer engines follow the canonical and quote the other site.",
        geoImpact: "Citations go to the canonical target, not to you.",
        recommendation: "Point the canonical at the page's own URL unless you deliberately syndicated the content.",
        implementationExample: '<link rel="canonical" href="https://yourdomain.com/this-page" />',
        effort: "easy",
        affectedUrls: crossDomainCanonical.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  if (missingCanonical.length > 0) {
    issues.push(
      issue({
        code: "missing_canonical",
        title: `${missingCanonical.length} page${missingCanonical.length === 1 ? " has" : "s have"} no canonical tag`,
        description: "No canonical URL is declared for these pages.",
        severity: "low",
        disciplines: ["seo"],
        whyItMatters:
          "Without a canonical, tracking parameters and trailing-slash variants can each be treated as a separate page competing with the original.",
        seoImpact: "Risk of duplicate content splitting your ranking signals.",
        aeoImpact: null,
        geoImpact: null,
        recommendation: "Add a self-referencing canonical tag to every indexable page.",
        implementationExample: '<link rel="canonical" href="https://yourdomain.com/page" />',
        effort: "easy",
        affectedUrls: missingCanonical.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  const conflictingCanonicals = [...canonicalGroups.entries()].filter(([target, group]) => {
    const normalizedTarget = normalizeUrl(target);
    return group.some((page) => (normalizeUrl(page.finalUrl) ?? page.finalUrl) !== normalizedTarget);
  });

  if (conflictingCanonicals.length > 0) {
    issues.push(
      issue({
        code: "duplicate_canonical_targets",
        title: `${conflictingCanonicals.length} canonical target${conflictingCanonicals.length === 1 ? " is" : "s are"} claimed by several pages`,
        description: "Different URLs declare the same canonical target.",
        severity: "medium",
        disciplines: ["seo"],
        whyItMatters:
          "Pages that consolidate onto one canonical stop being indexed in their own right. If that was not intended, you are deleting pages from search without realising it.",
        seoImpact: "Pages disappear from the index and their traffic goes with them.",
        aeoImpact: "Consolidated pages can no longer be surfaced as distinct answers.",
        geoImpact: "Fewer distinct URLs available for an AI engine to cite.",
        recommendation:
          "Confirm the consolidation is deliberate. If each page should rank on its own, give it a self-referencing canonical.",
        implementationExample: null,
        effort: "moderate",
        affectedUrls: conflictingCanonicals.flatMap(([, group]) => group.map((page) => page.url)).slice(0, 50),
      }),
    );
  }

  // ---- Content depth -------------------------------------------------------
  const thinPages = ok.filter(
    (page) => (page.page?.wordCount ?? 0) < THIN_CONTENT_WORDS && page.page?.contentClassification !== "contact",
  );
  if (thinPages.length > 0) {
    issues.push(
      issue({
        code: "thin_content",
        title: `${thinPages.length} page${thinPages.length === 1 ? " has" : "s have"} very little content`,
        description: `These pages contain fewer than ${THIN_CONTENT_WORDS} words.`,
        severity: thinPages.length > ok.length * 0.4 ? "high" : "medium",
        disciplines: ["seo", "aeo", "geo"],
        whyItMatters:
          "There is not enough substance for a search engine to judge quality, or for an AI engine to find anything worth quoting.",
        seoImpact: "Difficult to rank for anything competitive.",
        aeoImpact: "Nothing on the page functions as a complete answer.",
        geoImpact: "No citable facts, so generative engines pass over the page.",
        recommendation:
          "Expand each page to genuinely answer the question it targets: what it is, who it is for, how it works, what it costs, and what happens next.",
        implementationExample:
          "For a service page, add: a one-paragraph definition, three concrete outcomes with numbers, a comparison table, and three FAQs.",
        effort: "moderate",
        affectedUrls: thinPages.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- Images --------------------------------------------------------------
  const imagesTotal = ok.reduce((sum, page) => sum + (page.page?.imageCount ?? 0), 0);
  const imagesMissingAlt = ok.reduce((sum, page) => sum + (page.page?.imagesMissingAlt ?? 0), 0);
  if (imagesMissingAlt > 0) {
    issues.push(
      issue({
        code: "images_missing_alt",
        title: `${imagesMissingAlt} image${imagesMissingAlt === 1 ? " is" : "s are"} missing alt text`,
        description: "Meaningful images have no alternative text.",
        severity: imagesMissingAlt > 30 ? "medium" : "low",
        disciplines: ["seo"],
        whyItMatters:
          "Alt text is how the image is described to screen-reader users and to search engines. Without it the image is invisible to both.",
        seoImpact: "Lost image search traffic and reduced page context.",
        aeoImpact: "Diagrams and charts contribute nothing to the page's answer.",
        geoImpact: "Visual evidence cannot be interpreted by an AI engine.",
        recommendation:
          "Describe what the image shows, in a short phrase. Leave alt empty only for purely decorative images.",
        implementationExample: '<img src="/dashboard.png" alt="V Turn AI dashboard showing a V Score of 78" />',
        effort: "easy",
        affectedUrls: ok
          .filter((page) => (page.page?.imagesMissingAlt ?? 0) > 0)
          .slice(0, 50)
          .map((page) => page.url),
      }),
    );
  }

  // ---- Internal linking ----------------------------------------------------
  const inboundCounts = new Map<string, number>();
  let brokenInternalLinks = 0;
  const brokenLinkExamples: string[] = [];

  for (const page of ok) {
    for (const link of page.page?.links ?? []) {
      if (!link.isInternal) continue;
      const target = normalizeUrl(link.url);
      if (!target) continue;
      inboundCounts.set(target, (inboundCounts.get(target) ?? 0) + 1);
      const targetPage = pages.find(
        (candidate) => (normalizeUrl(candidate.finalUrl) ?? candidate.finalUrl) === target || (normalizeUrl(candidate.url) ?? candidate.url) === target,
      );
      if (targetPage && ((targetPage.httpStatus ?? 0) >= 400 || targetPage.fetchError)) {
        brokenInternalLinks += 1;
        if (brokenLinkExamples.length < 25) brokenLinkExamples.push(`${page.url} → ${target}`);
      }
    }
  }

  if (brokenInternalLinks > 0) {
    issues.push(
      issue({
        code: "broken_internal_links",
        title: `${brokenInternalLinks} internal link${brokenInternalLinks === 1 ? "" : "s"} point to a broken page`,
        description: "Links inside your site lead to URLs that error or do not exist.",
        severity: "high",
        disciplines: ["seo"],
        whyItMatters:
          "Every broken link is a dead end for a visitor and a wasted signal for a crawler that followed it expecting content.",
        seoImpact: "Lost link equity and worse crawl efficiency.",
        aeoImpact: "Broken paths reduce the topical connections engines can follow.",
        geoImpact: "AI crawlers give up on sections reached only through broken links.",
        recommendation: "Update each link to the correct URL, or remove it.",
        implementationExample: null,
        effort: "easy",
        affectedUrls: unique(brokenLinkExamples.map((example) => example.split(" → ")[0] ?? "")).slice(0, 50),
        evidence: { examples: brokenLinkExamples },
      }),
    );
  }

  const orphanPages = ok.filter((page) => {
    const url = normalizeUrl(page.finalUrl) ?? page.finalUrl;
    if (url === normalizeUrl(input.siteUrl)) return false;
    return (inboundCounts.get(url) ?? 0) === 0;
  });

  if (orphanPages.length > 0) {
    issues.push(
      issue({
        code: "orphan_pages",
        title: `${orphanPages.length} page${orphanPages.length === 1 ? " has" : "s have"} no internal links pointing to it`,
        description:
          "These pages were found in the sitemap but nothing on the site links to them.",
        severity: "medium",
        disciplines: ["seo", "geo"],
        whyItMatters:
          "A page nothing links to receives almost no authority, and both crawlers and visitors are unlikely to find it.",
        seoImpact: "Very low ranking potential regardless of content quality.",
        aeoImpact: "Weak topical context makes the page hard to match to a question.",
        geoImpact: "AI crawlers rarely reach pages that are not linked from anywhere.",
        recommendation:
          "Link to each page from a relevant parent page, a navigation menu, or a related-content block.",
        implementationExample:
          "Add a contextual link in the body of a related article: 'See our <a href=\"/crm-pricing\">CRM pricing</a> for details.'",
        effort: "easy",
        affectedUrls: orphanPages.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- Structured data -----------------------------------------------------
  const withoutSchema = ok.filter((page) => (page.page?.schemaTypes.length ?? 0) === 0);
  if (withoutSchema.length > 0) {
    issues.push(
      issue({
        code: "missing_structured_data",
        title: `${withoutSchema.length} page${withoutSchema.length === 1 ? " has" : "s have"} no structured data`,
        description: "No JSON-LD schema markup was found on these pages.",
        severity: "medium",
        disciplines: ["seo", "aeo", "geo"],
        whyItMatters:
          "Structured data states in machine-readable form what a page is and who published it. Without it, engines have to infer everything from prose.",
        seoImpact: "No eligibility for rich results.",
        aeoImpact: "Answer engines lose an explicit map of the page's questions and answers.",
        geoImpact: "Generative engines lack a verified identity for your organization and authors.",
        recommendation:
          "Add Organization schema sitewide, plus the type matching each page — Article, Product, Service or FAQPage.",
        implementationExample:
          '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Acme",\n  "url": "https://acme.com",\n  "sameAs": ["https://www.linkedin.com/company/acme"]\n}\n</script>',
        effort: "moderate",
        affectedUrls: withoutSchema.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- HTTPS and mixed content --------------------------------------------
  const insecurePages = ok.filter((page) => !page.finalUrl.startsWith("https://"));
  if (insecurePages.length > 0) {
    issues.push(
      issue({
        code: "insecure_pages",
        title: `${insecurePages.length} page${insecurePages.length === 1 ? " is" : "s are"} served over plain HTTP`,
        description: "These URLs are not served over HTTPS.",
        severity: "critical",
        disciplines: ["seo"],
        whyItMatters:
          "Browsers mark HTTP pages as 'Not secure', which visibly damages trust, and HTTPS has been a ranking signal for a decade.",
        seoImpact: "Ranking penalty and a visible browser warning.",
        aeoImpact: null,
        geoImpact: "Some AI crawlers skip insecure origins.",
        recommendation: "Install a TLS certificate and redirect all HTTP traffic to HTTPS with a 301.",
        implementationExample: null,
        effort: "moderate",
        affectedUrls: insecurePages.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  const mixedContent = ok.filter((page) => page.page?.hasMixedContent);
  if (mixedContent.length > 0) {
    issues.push(
      issue({
        code: "mixed_content",
        title: `${mixedContent.length} secure page${mixedContent.length === 1 ? "" : "s"} load insecure resources`,
        description: "HTTPS pages reference images, scripts or stylesheets over HTTP.",
        severity: "high",
        disciplines: ["seo"],
        whyItMatters:
          "Browsers block or downgrade mixed content, which can break layout and remove the padlock users look for.",
        seoImpact: "Degraded user experience signals and possible broken rendering.",
        aeoImpact: null,
        geoImpact: null,
        recommendation: "Change every insecure asset reference to https:// or to a protocol-relative path.",
        implementationExample: 'Change <img src="http://cdn.example.com/a.png"> to <img src="https://cdn.example.com/a.png">',
        effort: "easy",
        affectedUrls: mixedContent.slice(0, 50).map((page) => page.url),
      }),
    );
  }

  // ---- Sitemap consistency -------------------------------------------------
  if (input.sitemapUrls && input.sitemapUrls.length > 0) {
    const sitemapSet = new Set(
      input.sitemapUrls.map((url) => normalizeUrl(url)).filter((url): url is string => Boolean(url)),
    );
    const sitemapBroken = pages.filter(
      (page) =>
        sitemapSet.has(normalizeUrl(page.url) ?? page.url) &&
        ((page.httpStatus ?? 0) >= 400 || Boolean(page.fetchError)),
    );
    const sitemapNoindex = ok.filter(
      (page) => sitemapSet.has(normalizeUrl(page.url) ?? page.url) && page.page?.noindex,
    );

    if (sitemapBroken.length > 0 || sitemapNoindex.length > 0) {
      issues.push(
        issue({
          code: "sitemap_inconsistency",
          title: "Your sitemap lists URLs that cannot be indexed",
          description: `${sitemapBroken.length} sitemap URL${sitemapBroken.length === 1 ? "" : "s"} error, and ${sitemapNoindex.length} ${sitemapNoindex.length === 1 ? "is" : "are"} marked noindex.`,
          severity: "medium",
          disciplines: ["seo"],
          whyItMatters:
            "A sitemap is a statement of the pages you want indexed. Listing broken or noindex URLs contradicts that and reduces how much the sitemap is trusted.",
          seoImpact: "Crawl budget is wasted and sitemap trust falls.",
          aeoImpact: null,
          geoImpact: null,
          recommendation:
            "Keep the sitemap to canonical, indexable, 200-status URLs only, and regenerate it whenever pages change.",
          implementationExample: null,
          effort: "easy",
          affectedUrls: [...sitemapBroken, ...sitemapNoindex].slice(0, 50).map((page) => page.url),
        }),
      );
    }
  }

  // ---- Blocked AI crawlers -------------------------------------------------
  const siteWideBlocks = (input.blockedAiCrawlers ?? []).filter((entry) => entry.scope === "site");
  if (siteWideBlocks.length > 0) {
    issues.push(
      issue({
        code: "ai_crawlers_blocked",
        title: `robots.txt blocks ${siteWideBlocks.length} AI crawler${siteWideBlocks.length === 1 ? "" : "s"} from your entire site`,
        description: `Blocked: ${siteWideBlocks.map((entry) => `${entry.agent} (${entry.engine})`).join(", ")}.`,
        severity: "critical",
        disciplines: ["geo", "aeo"],
        whyItMatters:
          "These crawlers are how AI answer engines read your pages. While they are blocked, those engines cannot cite you no matter how good your content is.",
        seoImpact: "No direct effect on classic search rankings.",
        aeoImpact: "Your pages cannot be used as source material for answers.",
        geoImpact: "Complete exclusion from the affected engines' citations.",
        recommendation:
          "Decide deliberately. If you want AI visibility, allow these agents in robots.txt. If you are blocking them on purpose, expect zero visibility on those engines.",
        implementationExample:
          "In robots.txt:\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /",
        effort: "easy",
        affectedUrls: [],
        evidence: { blocked: siteWideBlocks },
      }),
    );
  }

  // ---- Component scores ----------------------------------------------------
  const okCount = ok.length;
  const counts = {
    critical: issues.filter((entry) => entry.severity === "critical").length,
    high: issues.filter((entry) => entry.severity === "high").length,
    medium: issues.filter((entry) => entry.severity === "medium").length,
    low: issues.filter((entry) => entry.severity === "low").length,
  };

  const pagesWithTitle = ok.filter((page) => Boolean(page.page?.title)).length;
  const pagesWithDescription = ok.filter((page) => Boolean(page.page?.metaDescription)).length;
  const pagesWithSingleH1 = ok.filter((page) => (page.page?.h1.length ?? 0) === 1).length;
  const pagesWithStructuredData = ok.filter((page) => (page.page?.schemaTypes.length ?? 0) > 0).length;
  const pagesWithGoodDepth = ok.filter((page) => (page.page?.wordCount ?? 0) >= THIN_CONTENT_WORDS).length;
  const pagesWithInboundLinks = ok.filter(
    (page) => (inboundCounts.get(normalizeUrl(page.finalUrl) ?? page.finalUrl) ?? 0) > 0,
  ).length;

  const titleQuality =
    okCount === 0
      ? null
      : round(
          percentage(pagesWithTitle, okCount) * 0.5 +
            percentage(pagesWithDescription, okCount) * 0.3 +
            percentage(okCount - duplicateTitles.size, okCount) * 0.2,
          1,
        );

  const indexabilityScore =
    total === 0
      ? null
      : round(
          percentage(okCount, total) * 0.6 +
            percentage(okCount - noindexPages.length, Math.max(1, okCount)) * 0.25 +
            percentage(okCount - crossDomainCanonical.length, Math.max(1, okCount)) * 0.15,
          1,
        );

  const values: Record<string, number | null> = {
    indexability: indexabilityScore,
    metadata: titleQuality,
    structure: passRateScore(pagesWithSingleH1, okCount),
    contentDepth: passRateScore(pagesWithGoodDepth, okCount),
    internalLinking:
      okCount === 0
        ? null
        : round(
            percentage(pagesWithInboundLinks, okCount) * 0.7 +
              (brokenInternalLinks === 0 ? 30 : Math.max(0, 30 - brokenInternalLinks)),
            1,
          ),
    media: imagesTotal === 0 ? 100 : passRateScore(imagesTotal - imagesMissingAlt, imagesTotal),
    performance: input.performanceScore ?? null,
  };

  const composed = composeSeoScore(values, {
    indexability: `${okCount} of ${total} URLs returned a usable page.`,
    metadata: `${pagesWithTitle}/${okCount} have titles, ${pagesWithDescription}/${okCount} have descriptions.`,
    structure: `${pagesWithSingleH1}/${okCount} pages have exactly one H1.`,
    contentDepth: `${pagesWithGoodDepth}/${okCount} pages have at least ${THIN_CONTENT_WORDS} words.`,
    internalLinking: `${pagesWithInboundLinks}/${okCount} pages have at least one internal link pointing to them.`,
    media: imagesTotal === 0 ? "No images found." : `${imagesTotal - imagesMissingAlt}/${imagesTotal} images have alt text.`,
    performance:
      input.performanceScore === null || input.performanceScore === undefined
        ? "Run a PageSpeed check to include performance."
        : `PageSpeed performance score ${round(input.performanceScore, 0)}.`,
  });

  // A severe issue count still drags the composed score down, so a site with
  // perfect coverage but critical failures cannot show as healthy.
  const penalty = issuePenaltyScore({ totalItems: Math.max(1, okCount), ...counts });
  const finalScore = round(composed.score * 0.75 + penalty * 0.25, 1);

  return {
    score: finalScore,
    components: composed.components,
    issues: issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    stats: {
      totalPages: total,
      okPages: okCount,
      errorPages: errorPages.length,
      indexablePages: ok.filter((page) => page.page?.isIndexable).length,
      noindexPages: noindexPages.length,
      averageWordCount:
        okCount === 0
          ? 0
          : Math.round(ok.reduce((sum, page) => sum + (page.page?.wordCount ?? 0), 0) / okCount),
      pagesWithTitle,
      pagesWithDescription,
      pagesWithSingleH1,
      pagesWithStructuredData,
      brokenInternalLinks,
      orphanPages: orphanPages.length,
    },
  };
}

function severityRank(severity: AnalysisIssue["severity"]): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "information":
      return 1;
    default:
      return 0;
  }
}

export { severityRank, truncate };
