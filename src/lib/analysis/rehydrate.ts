/**
 * Rebuild an `ExtractedPage` from a stored `crawl_pages` row.
 *
 * Analysis runs as a separate job from crawling, so the analyzers must work
 * from the database rather than from live HTML. Everything an analyzer reads is
 * persisted at crawl time; this mapper is the single place that knows how the
 * two shapes correspond.
 */

import type { ExtractedPage, FaqPair, ContentClassification } from "@/lib/crawler/extractor";
import type { CrawlPageRow, PageLinkRow } from "@/lib/db/types";
import { toRegistrableHost } from "@/lib/crawler/url";
import { unique } from "@/lib/utils";

const AUTHORITATIVE_TLDS = [".gov", ".edu", ".gov.in", ".ac.in", ".ac.uk", ".int", ".mil"];
const AUTHORITATIVE_HOSTS = [
  "wikipedia.org", "who.int", "worldbank.org", "oecd.org", "statista.com",
  "pubmed.ncbi.nlm.nih.gov", "nature.com", "sciencedirect.com", "arxiv.org",
  "gartner.com", "forrester.com", "mckinsey.com", "nielsen.com",
  "rbi.org.in", "sebi.gov.in", "data.gov.in",
];

const STATISTIC_PATTERN =
  /(\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:%|percent|per cent)\b|\b(?:₹|Rs\.?|INR|\$|USD|€|£)\s?\d|\b\d+(?:\.\d+)?\s?(?:x|times|million|billion|crore|lakh|k)\b|\b(?:19|20)\d{2}\b)/i;

const DEFINITION_PATTERN = /\b(?:is|are|refers to|means|is defined as|stands for|describes)\b/i;

function isAuthoritativeHost(host: string): boolean {
  if (AUTHORITATIVE_TLDS.some((tld) => host.endsWith(tld))) return true;
  return AUTHORITATIVE_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(\d"'])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25 && sentence.length < 400);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asFaqPairs(value: unknown): FaqPair[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is FaqPair =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as FaqPair).question === "string" &&
        typeof (entry as FaqPair).answer === "string",
    )
    .map((entry) => ({ question: entry.question, answer: entry.answer }));
}

function asRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

export function rehydrateExtractedPage(
  row: CrawlPageRow,
  links: readonly Pick<PageLinkRow, "target_url" | "anchor_text" | "is_internal" | "is_nofollow">[] = [],
): ExtractedPage {
  const contentText = row.content_text ?? "";
  const sentences = splitIntoSentences(contentText);

  const externalHosts = links
    .filter((link) => !link.is_internal)
    .map((link) => toRegistrableHost(link.target_url))
    .filter((host): host is string => host !== null && isAuthoritativeHost(host));

  return {
    url: row.url,
    title: row.title,
    titleLength: row.title_length ?? row.title?.length ?? 0,
    metaDescription: row.meta_description,
    metaDescriptionLength: row.meta_description_length ?? row.meta_description?.length ?? 0,
    canonicalUrl: row.canonical_url,
    robotsMeta: row.robots_meta,
    noindex: row.noindex,
    nofollow: row.nofollow,
    isIndexable: row.is_indexable ?? !row.noindex,

    h1: row.h1,
    h2: row.h2,
    h3: row.h3,
    questionHeadings: row.question_headings,

    wordCount: row.word_count,
    language: row.language,
    contentText,
    directAnswerParagraphs: row.direct_answer_paragraphs,

    structuredData: Array.isArray(row.structured_data) ? (row.structured_data as unknown[]) : [],
    schemaTypes: row.schema_types,
    openGraph: asRecord(row.open_graph),
    twitterCard: asRecord(row.twitter_card),

    images: [],
    imageCount: row.image_count,
    imagesMissingAlt: row.images_missing_alt,

    links: links.map((link) => ({
      url: link.target_url,
      anchorText: link.anchor_text ?? "",
      isInternal: link.is_internal,
      isNofollow: link.is_nofollow,
    })),
    internalLinkCount: row.internal_link_count,
    externalLinkCount: row.external_link_count,
    nofollowLinkCount: row.nofollow_link_count,

    hasFaqContent: row.has_faq_content,
    faqPairs: asFaqPairs(row.faq_pairs),
    tableCount: row.table_count,
    listCount: row.list_count,
    hasBreadcrumbs: row.has_breadcrumbs,

    authorName: row.author_name,
    publishedDate: row.published_date,
    modifiedDate: row.modified_date,

    hasMixedContent: row.has_mixed_content,
    contentClassification: (row.content_classification ?? "other") as ContentClassification,

    authoritativeOutboundLinks: unique(externalHosts),
    statisticSentences: sentences.filter((sentence) => STATISTIC_PATTERN.test(sentence)).slice(0, 40),
    definitionSentences: sentences
      .filter((sentence) => DEFINITION_PATTERN.test(sentence) && sentence.length < 260)
      .slice(0, 40),
  };
}

export { asStringArray };
