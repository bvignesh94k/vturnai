/**
 * Page extraction.
 *
 * Turns raw HTML into the structured record every analyzer works from. The
 * extraction is deliberately exhaustive: SEO, AEO, GEO and entity analysis all
 * read from one pass so a page is never fetched twice.
 */

import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { resolveLink, isSameSite, toRegistrableHost } from "@/lib/crawler/url";
import { isRecord, round, unique } from "@/lib/utils";

export interface ExtractedLink {
  url: string;
  anchorText: string;
  isInternal: boolean;
  isNofollow: boolean;
}

export interface ExtractedImage {
  src: string;
  alt: string | null;
  hasAlt: boolean;
  isDecorative: boolean;
}

export interface FaqPair {
  question: string;
  answer: string;
}

export interface ExtractedPage {
  url: string;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  noindex: boolean;
  nofollow: boolean;
  isIndexable: boolean;

  h1: string[];
  h2: string[];
  h3: string[];
  questionHeadings: string[];

  wordCount: number;
  language: string | null;
  contentText: string;
  /** Paragraphs that read as a self-contained answer (40–70 words, factual). */
  directAnswerParagraphs: string[];

  structuredData: unknown[];
  schemaTypes: string[];
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;

  images: ExtractedImage[];
  imageCount: number;
  imagesMissingAlt: number;

  links: ExtractedLink[];
  internalLinkCount: number;
  externalLinkCount: number;
  nofollowLinkCount: number;

  hasFaqContent: boolean;
  faqPairs: FaqPair[];
  tableCount: number;
  listCount: number;
  hasBreadcrumbs: boolean;

  authorName: string | null;
  publishedDate: string | null;
  modifiedDate: string | null;

  hasMixedContent: boolean;
  contentClassification: ContentClassification;

  /** Outbound links to domains commonly treated as primary sources. */
  authoritativeOutboundLinks: string[];
  /** Sentences containing a number, percentage or currency figure. */
  statisticSentences: string[];
  /** Definition-style sentences ("X is a …", "X refers to …"). */
  definitionSentences: string[];
}

export type ContentClassification =
  | "homepage"
  | "about"
  | "contact"
  | "product"
  | "service"
  | "pricing"
  | "blog"
  | "guide"
  | "comparison"
  | "faq"
  | "case-study"
  | "legal"
  | "category"
  | "other";

/** Tags whose text is never part of the readable content. */
const NON_CONTENT_SELECTOR =
  "script, style, noscript, template, svg, iframe, nav, header, footer, aside, form, [aria-hidden=true], .cookie-banner, #cookie-banner";

const QUESTION_PREFIXES =
  /^(what|why|how|when|where|who|which|can|do|does|did|is|are|will|should|would|could|may|might)\b/i;

const AUTHORITATIVE_TLDS = [".gov", ".edu", ".gov.in", ".ac.in", ".ac.uk", ".int", ".mil"];
const AUTHORITATIVE_HOSTS = [
  "wikipedia.org",
  "who.int",
  "worldbank.org",
  "oecd.org",
  "statista.com",
  "pubmed.ncbi.nlm.nih.gov",
  "nature.com",
  "sciencedirect.com",
  "arxiv.org",
  "gartner.com",
  "forrester.com",
  "mckinsey.com",
  "nielsen.com",
  "rbi.org.in",
  "sebi.gov.in",
  "data.gov.in",
];

function textOf($: CheerioAPI, selector: string): string[] {
  return $(selector)
    .map((_, element) => $(element).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
}

function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

/** Collect JSON-LD blocks, tolerating the malformed JSON real sites ship. */
function extractJsonLd($: CheerioAPI): unknown[] {
  const blocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // Some CMSs emit JSON-LD with trailing commas or HTML comments. One
      // cheap repair pass is worth it; anything still broken is discarded.
      const repaired = raw
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/,\s*([}\]])/g, "$1");
      try {
        const parsed: unknown = JSON.parse(repaired);
        if (Array.isArray(parsed)) blocks.push(...parsed);
        else blocks.push(parsed);
      } catch {
        // Genuinely invalid. The SEO analyzer reports it as a structured data issue.
      }
    }
  });
  return blocks;
}

/** Flatten @graph structures and collect every @type present. */
export function collectSchemaTypes(blocks: readonly unknown[]): string[] {
  const types: string[] = [];
  const walk = (node: unknown, depth = 0): void => {
    if (depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!isRecord(node)) return;
    const type = node["@type"];
    if (typeof type === "string") types.push(type);
    else if (Array.isArray(type)) {
      for (const entry of type) if (typeof entry === "string") types.push(entry);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value) || isRecord(value)) walk(value, depth + 1);
    }
  };
  walk(blocks);
  return unique(types);
}

function findInSchema(blocks: readonly unknown[], predicate: (node: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  const walk = (node: unknown, depth = 0): void => {
    if (found || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!isRecord(node)) return;
    if (predicate(node)) {
      found = node;
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value) || isRecord(value)) walk(value, depth + 1);
    }
  };
  walk(blocks);
  return found;
}

function schemaHasType(node: Record<string, unknown>, ...wanted: string[]): boolean {
  const type = node["@type"];
  const values = typeof type === "string" ? [type] : Array.isArray(type) ? type : [];
  return values.some(
    (value) => typeof value === "string" && wanted.some((target) => value.toLowerCase() === target.toLowerCase()),
  );
}

function extractAuthor($: CheerioAPI, blocks: readonly unknown[]): string | null {
  const metaAuthor = $('meta[name="author"]').attr("content")?.trim();
  if (metaAuthor) return metaAuthor;

  const articleAuthor = $('meta[property="article:author"]').attr("content")?.trim();
  if (articleAuthor && !/^https?:\/\//i.test(articleAuthor)) return articleAuthor;

  const schemaNode = findInSchema(blocks, (node) => "author" in node);
  const author = schemaNode?.["author"];
  if (typeof author === "string" && author.trim()) return author.trim();
  if (isRecord(author) && typeof author["name"] === "string") return author["name"].trim();
  if (Array.isArray(author)) {
    const first = author.find((entry) => isRecord(entry) && typeof entry["name"] === "string");
    if (isRecord(first) && typeof first["name"] === "string") return first["name"].trim();
  }

  const rel = $('[rel="author"]').first().text().replace(/\s+/g, " ").trim();
  if (rel) return rel;

  const byline = $('[itemprop="author"], .author-name, .byline__author, .entry-author')
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  return byline || null;
}

function normaliseDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractDates(
  $: CheerioAPI,
  blocks: readonly unknown[],
): { published: string | null; modified: string | null } {
  const published =
    normaliseDate($('meta[property="article:published_time"]').attr("content")) ??
    normaliseDate($('meta[name="date"]').attr("content")) ??
    normaliseDate($("time[datetime]").first().attr("datetime"));

  const modified =
    normaliseDate($('meta[property="article:modified_time"]').attr("content")) ??
    normaliseDate($('meta[name="last-modified"]').attr("content"));

  const schemaNode = findInSchema(blocks, (node) => "datePublished" in node || "dateModified" in node);
  return {
    published: published ?? normaliseDate(schemaNode?.["datePublished"] as string | undefined),
    modified: modified ?? normaliseDate(schemaNode?.["dateModified"] as string | undefined),
  };
}

/**
 * Extract visible FAQ pairs. Only visible content counts — FAQPage schema
 * without matching on-page content is schema spam, and the AEO analyzer
 * reports it as such rather than rewarding it.
 */
function extractFaqPairs($: CheerioAPI): FaqPair[] {
  const pairs: FaqPair[] = [];

  // Definition lists.
  $("dl").each((_, list) => {
    const $list = $(list);
    $list.find("dt").each((_, term) => {
      const question = $(term).text().replace(/\s+/g, " ").trim();
      const answer = $(term).nextAll("dd").first().text().replace(/\s+/g, " ").trim();
      if (question && answer && question.length < 300) pairs.push({ question, answer });
    });
  });

  // Details/summary accordions.
  $("details").each((_, element) => {
    const question = $(element).find("summary").first().text().replace(/\s+/g, " ").trim();
    const clone = $(element).clone();
    clone.find("summary").remove();
    const answer = clone.text().replace(/\s+/g, " ").trim();
    if (question && answer) pairs.push({ question, answer });
  });

  // Question-style headings followed by prose.
  $("h2, h3, h4").each((_, element) => {
    const heading = $(element).text().replace(/\s+/g, " ").trim();
    if (!heading.endsWith("?") && !QUESTION_PREFIXES.test(heading)) return;
    const answer = $(element)
      .nextUntil("h1, h2, h3, h4")
      .filter("p, ul, ol")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (heading && answer) pairs.push({ question: heading, answer });
  });

  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = pair.question.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Paragraphs that would work as a lifted answer: self-contained, 25–90 words,
 * not a call to action, and not starting with a pronoun that needs context.
 */
function extractDirectAnswerParagraphs($: CheerioAPI): string[] {
  const results: string[] = [];
  $("p").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    const words = countWords(text);
    if (words < 25 || words > 90) return;
    if (/^(this|that|these|those|it|they|he|she)\b/i.test(text)) return;
    if (/(click here|sign up|contact us|buy now|get started|subscribe)/i.test(text)) return;
    if (!/[.!?]$/.test(text)) return;
    results.push(text);
  });
  return results.slice(0, 25);
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(\d"'])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25 && sentence.length < 400);
}

const STATISTIC_PATTERN =
  /(\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:%|percent|per cent)\b|\b(?:₹|Rs\.?|INR|\$|USD|€|£)\s?\d|\b\d+(?:\.\d+)?\s?(?:x|times|million|billion|crore|lakh|k)\b|\b(?:19|20)\d{2}\b)/i;

const DEFINITION_PATTERN =
  /\b(?:is|are|refers to|means|is defined as|stands for|is a type of|describes)\b/i;

function classifyContent(url: string, title: string | null, headings: string[]): ContentClassification {
  let pathname = "/";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    /* keep default */
  }
  const haystack = `${pathname} ${title ?? ""} ${headings.join(" ")}`.toLowerCase();

  if (pathname === "/" || pathname === "") return "homepage";
  if (/\/(about|company|our-story|who-we-are|team)\b/.test(pathname)) return "about";
  if (/\/(contact|support|help-desk)\b/.test(pathname)) return "contact";
  if (/\/(pricing|plans|packages)\b/.test(pathname)) return "pricing";
  if (/\/(privacy|terms|refund|cookie|legal|disclaimer|gdpr)\b/.test(pathname)) return "legal";
  if (/\/(faq|faqs|questions)\b/.test(pathname)) return "faq";
  if (/\/(case-stud|success-stor|customer-stor)/.test(pathname)) return "case-study";
  if (/\bvs\b|\bversus\b|\/compare|\/comparison|\balternatives?\b/.test(haystack)) return "comparison";
  if (/\/(guide|how-to|tutorial|learn|resources|docs)\b/.test(pathname)) return "guide";
  if (/\/(blog|news|articles?|insights|post)\b/.test(pathname)) return "blog";
  if (/\/(product|shop|store|item)\b/.test(pathname)) return "product";
  if (/\/(service|solutions?)\b/.test(pathname)) return "service";
  if (/\/(category|categories|collections?|tag)\b/.test(pathname)) return "category";
  return "other";
}

function isAuthoritativeHost(host: string): boolean {
  if (AUTHORITATIVE_TLDS.some((tld) => host.endsWith(tld))) return true;
  return AUTHORITATIVE_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

/**
 * Extract everything the analyzers need from one HTML document.
 *
 * `pageUrl` must be the final URL after redirects, so relative links resolve
 * correctly and internal/external classification is accurate.
 */
export function extractPage(html: string, pageUrl: string, siteUrl: string): ExtractedPage {
  const $ = cheerio.load(html);

  const title = $("head title").first().text().replace(/\s+/g, " ").trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr("content")?.replace(/\s+/g, " ").trim() || null;
  const canonicalHref = $('link[rel="canonical"]').attr("href")?.trim();
  const canonicalUrl = canonicalHref ? resolveLink(canonicalHref, pageUrl) : null;

  const robotsMeta =
    $('meta[name="robots"]').attr("content")?.toLowerCase().trim() ??
    $('meta[name="googlebot"]').attr("content")?.toLowerCase().trim() ??
    null;
  const noindex = Boolean(robotsMeta?.includes("noindex"));
  const nofollow = Boolean(robotsMeta?.includes("nofollow"));

  const h1 = textOf($, "h1");
  const h2 = textOf($, "h2");
  const h3 = textOf($, "h3");
  const questionHeadings = [...h2, ...h3, ...textOf($, "h4")].filter(
    (heading) => heading.endsWith("?") || QUESTION_PREFIXES.test(heading),
  );

  const structuredData = extractJsonLd($);
  const schemaTypes = collectSchemaTypes(structuredData);

  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, element) => {
    const property = $(element).attr("property");
    const content = $(element).attr("content");
    if (property && content) openGraph[property.replace(/^og:/, "")] = content.trim();
  });

  const twitterCard: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, element) => {
    const name = $(element).attr("name");
    const content = $(element).attr("content");
    if (name && content) twitterCard[name.replace(/^twitter:/, "")] = content.trim();
  });

  const images: ExtractedImage[] = $("img")
    .map((_, element) => {
      const node = $(element);
      const src = node.attr("src") ?? node.attr("data-src") ?? "";
      const alt = node.attr("alt");
      const role = node.attr("role");
      return {
        src: src ? (resolveLink(src, pageUrl) ?? src) : "",
        alt: alt ?? null,
        hasAlt: alt !== undefined,
        // An empty alt on a decorative image is correct, not a defect.
        isDecorative: alt === "" || role === "presentation" || role === "none",
      };
    })
    .get()
    .filter((image) => Boolean(image.src));

  const links: ExtractedLink[] = [];
  const seenLinks = new Set<string>();
  $("a[href]").each((_, element) => {
    const node = $(element);
    const href = node.attr("href");
    if (!href) return;
    const resolved = resolveLink(href, pageUrl);
    if (!resolved) return;
    const rel = (node.attr("rel") ?? "").toLowerCase();
    const anchorText = node.text().replace(/\s+/g, " ").trim() || node.attr("aria-label")?.trim() || "";
    const key = `${resolved}|${anchorText}`;
    if (seenLinks.has(key)) return;
    seenLinks.add(key);
    links.push({
      url: resolved,
      anchorText,
      isInternal: isSameSite(resolved, siteUrl),
      isNofollow: rel.includes("nofollow") || rel.includes("sponsored") || rel.includes("ugc"),
    });
  });

  // Readable body text with chrome removed.
  const $content = cheerio.load(html);
  $content(NON_CONTENT_SELECTOR).remove();
  const contentText = $content("body").text().replace(/\s+/g, " ").trim();
  const wordCount = countWords(contentText);

  const language =
    $("html").attr("lang")?.trim().toLowerCase() ??
    $('meta[http-equiv="content-language"]').attr("content")?.trim().toLowerCase() ??
    null;

  const faqPairs = extractFaqPairs($);
  const { published, modified } = extractDates($, structuredData);

  const sentences = splitIntoSentences(contentText);
  const statisticSentences = sentences.filter((sentence) => STATISTIC_PATTERN.test(sentence)).slice(0, 40);
  const definitionSentences = sentences
    .filter((sentence) => DEFINITION_PATTERN.test(sentence) && sentence.length < 260)
    .slice(0, 40);

  const isHttps = pageUrl.startsWith("https://");
  const hasMixedContent =
    isHttps &&
    ($('img[src^="http://"]').length > 0 ||
      $('script[src^="http://"]').length > 0 ||
      $('link[href^="http://"][rel="stylesheet"]').length > 0);

  const externalLinks = links.filter((link) => !link.isInternal);
  const authoritativeOutboundLinks = unique(
    externalLinks
      .map((link) => toRegistrableHost(link.url))
      .filter((host): host is string => host !== null && isAuthoritativeHost(host)),
  );

  const hasBreadcrumbs =
    $('[class*="breadcrumb" i], [id*="breadcrumb" i], nav[aria-label*="breadcrumb" i]').length > 0 ||
    schemaTypes.some((type) => type.toLowerCase() === "breadcrumblist");

  return {
    url: pageUrl,
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    canonicalUrl,
    robotsMeta,
    noindex,
    nofollow,
    isIndexable: !noindex,

    h1,
    h2,
    h3,
    questionHeadings: unique(questionHeadings),

    wordCount,
    language,
    // Cap stored text; the analyzers only need a representative body.
    contentText: contentText.slice(0, 60_000),
    directAnswerParagraphs: extractDirectAnswerParagraphs($),

    structuredData,
    schemaTypes,
    openGraph,
    twitterCard,

    images,
    imageCount: images.length,
    imagesMissingAlt: images.filter((image) => !image.hasAlt && !image.isDecorative).length,

    links,
    internalLinkCount: links.filter((link) => link.isInternal).length,
    externalLinkCount: externalLinks.length,
    nofollowLinkCount: links.filter((link) => link.isNofollow).length,

    hasFaqContent: faqPairs.length > 0,
    faqPairs: faqPairs.slice(0, 30),
    tableCount: $("table").length,
    listCount: $("ul, ol").length,
    hasBreadcrumbs,

    authorName: extractAuthor($, structuredData),
    publishedDate: published,
    modifiedDate: modified,

    hasMixedContent,
    contentClassification: classifyContent(pageUrl, title, [...h1, ...h2]),

    authoritativeOutboundLinks,
    statisticSentences,
    definitionSentences,
  };
}

/** Average words per direct-answer paragraph, used by the AEO conciseness score. */
export function averageAnswerLength(page: ExtractedPage): number {
  if (page.directAnswerParagraphs.length === 0) return 0;
  const total = page.directAnswerParagraphs.reduce((sum, text) => sum + countWords(text), 0);
  return round(total / page.directAnswerParagraphs.length, 1);
}

export { countWords, schemaHasType, findInSchema };
