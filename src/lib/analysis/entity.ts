/**
 * Brand and entity analysis.
 *
 * Builds one profile of the company from every crawled page, then compares the
 * pages against each other. Contradictions, two founding years, two phone
 * numbers, two company names, are the single most under-diagnosed cause of an
 * AI engine declining to state anything confident about a brand.
 */

import type { CrawledPage } from "@/lib/crawler/crawler";
import { findInSchema, type ExtractedPage } from "@/lib/crawler/extractor";
import { schemaString } from "@/lib/analysis/geo";
import { isRecord, round, unique } from "@/lib/utils";
import type { AnalysisIssue } from "@/lib/analysis/types";

export interface EntityPerson {
  name: string;
  role: string | null;
  sourceUrl: string;
}

export interface EntityProfile {
  brandName: string | null;
  organizationName: string | null;
  description: string | null;
  category: string | null;
  products: string[];
  services: string[];
  locations: string[];
  people: EntityPerson[];
  sameAsUrls: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  primaryTopics: string[];
  uniqueSellingPropositions: string[];
  structuredIdentity: Record<string, unknown>;
  consistencyScore: number;
}

export interface EntityContradiction {
  field: string;
  description: string;
  values: Array<{ value: string; urls: string[] }>;
  recommendation: string;
}

export interface EntityAnalysisResult {
  profile: EntityProfile;
  contradictions: EntityContradiction[];
  issues: AnalysisIssue[];
  siteSignals: {
    hasOrganizationSchema: boolean;
    hasAboutPage: boolean;
    hasContactPage: boolean;
    contactDetailsFound: boolean;
  };
}

const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g;
const PHONE_PATTERN = /(?:\+91[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,6}/g;
const FOUNDED_PATTERN =
  /\b(?:founded|established|started|since|incorporated|launched)\s+(?:in\s+)?((?:19|20)\d{2})\b/gi;
const EMPLOYEE_COUNT_PATTERN =
  /\b(\d{1,3}(?:,\d{3})*|\d+)\+?\s+(?:employees|team members|staff|people)\b/gi;
const CUSTOMER_COUNT_PATTERN =
  /\b(\d{1,3}(?:,\d{3})*|\d+)\+?\s+(?:customers|clients|businesses|companies|users)\b/gi;

/** Collect every distinct value of a pattern, remembering which URLs stated it. */
function collectClaims(
  pages: ReadonlyArray<{ url: string; page: ExtractedPage }>,
  pattern: RegExp,
  normalise: (match: RegExpExecArray) => string | null,
): Map<string, string[]> {
  const claims = new Map<string, string[]>();
  for (const { url, page } of pages) {
    const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(page.contentText)) !== null) {
      const value = normalise(match);
      if (!value) continue;
      const existing = claims.get(value);
      if (existing) {
        if (!existing.includes(url)) existing.push(url);
      } else {
        claims.set(value, [url]);
      }
    }
  }
  return claims;
}

function normalisePhone(value: string): string {
  return value.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
}

export function analyseEntity(input: {
  pages: readonly CrawledPage[];
  brandName: string;
  siteUrl: string;
}): EntityAnalysisResult {
  const usable = input.pages
    .filter((entry): entry is CrawledPage & { page: ExtractedPage } => entry.page !== null)
    .map((entry) => ({ url: entry.finalUrl, page: entry.page }));

  const contradictions: EntityContradiction[] = [];
  const issues: AnalysisIssue[] = [];

  // ---- Structured identity -------------------------------------------------
  const orgNodes = usable
    .map(({ page }) =>
      findInSchema(page.structuredData, (node) => {
        const type = node["@type"];
        const values = typeof type === "string" ? [type] : Array.isArray(type) ? type : [];
        return values.some(
          (value) =>
            typeof value === "string" &&
            ["organization", "localbusiness", "corporation"].includes(value.toLowerCase()),
        );
      }),
    )
    .filter((node): node is Record<string, unknown> => node !== null);

  const primaryOrg = orgNodes[0] ?? null;
  const hasOrganizationSchema = orgNodes.length > 0;

  const sameAsUrls = unique(
    orgNodes.flatMap((node) => {
      const raw = node["sameAs"];
      if (typeof raw === "string") return [raw];
      if (Array.isArray(raw)) return raw.filter((entry): entry is string => typeof entry === "string");
      return [];
    }),
  );

  // ---- Company name --------------------------------------------------------
  const schemaNames = unique(
    orgNodes.map((node) => schemaString(node, "name")).filter((name): name is string => Boolean(name)),
  );
  if (schemaNames.length > 1) {
    contradictions.push({
      field: "organization_name",
      description: `Your structured data gives ${schemaNames.length} different company names.`,
      values: schemaNames.map((value) => ({ value, urls: [] })),
      recommendation:
        "Pick the legal or trading name you want engines to use, and state exactly that name in Organization schema on every page.",
    });
  }

  // ---- Founding year -------------------------------------------------------
  const foundedClaims = collectClaims(usable, FOUNDED_PATTERN, (match) => match[1] ?? null);
  if (foundedClaims.size > 1) {
    contradictions.push({
      field: "founding_year",
      description: `Different pages state ${foundedClaims.size} different founding years.`,
      values: [...foundedClaims.entries()].map(([value, urls]) => ({ value, urls: urls.slice(0, 10) })),
      recommendation:
        "Correct every page to the same founding year, and state it once in Organization schema as foundingDate.",
    });
  }

  // ---- Contact details -----------------------------------------------------
  const emailClaims = collectClaims(usable, EMAIL_PATTERN, (match) => {
    const value = match[0]?.toLowerCase() ?? null;
    if (!value) return null;
    // Ignore obvious placeholders and asset filenames.
    if (/(example\.com|sentry|@2x|\.png|\.jpg)/i.test(value)) return null;
    return value;
  });

  const phoneClaims = collectClaims(usable, PHONE_PATTERN, (match) => {
    const digits = normalisePhone(match[0] ?? "");
    return digits.length >= 10 && digits.length <= 13 ? digits : null;
  });

  const contactEmails = [...emailClaims.keys()];
  const contactPhones = [...phoneClaims.keys()];

  if (contactPhones.length > 2) {
    contradictions.push({
      field: "contact_phone",
      description: `${contactPhones.length} different phone numbers appear across the site.`,
      values: [...phoneClaims.entries()]
        .slice(0, 6)
        .map(([value, urls]) => ({ value, urls: urls.slice(0, 6) })),
      recommendation:
        "Publish one primary contact number consistently. Multiple numbers make it impossible for an engine to state how to reach you.",
    });
  }

  // ---- Scale claims --------------------------------------------------------
  const employeeClaims = collectClaims(usable, EMPLOYEE_COUNT_PATTERN, (match) =>
    match[1] ? match[1].replace(/,/g, "") : null,
  );
  if (employeeClaims.size > 1) {
    contradictions.push({
      field: "employee_count",
      description: `Pages claim ${employeeClaims.size} different team sizes.`,
      values: [...employeeClaims.entries()].map(([value, urls]) => ({ value, urls: urls.slice(0, 6) })),
      recommendation:
        "State one team size, or express it as a range, and update every page that disagrees.",
    });
  }

  const customerClaims = collectClaims(usable, CUSTOMER_COUNT_PATTERN, (match) =>
    match[1] ? match[1].replace(/,/g, "") : null,
  );
  if (customerClaims.size > 2) {
    contradictions.push({
      field: "customer_count",
      description: `Pages claim ${customerClaims.size} different customer counts.`,
      values: [...customerClaims.entries()]
        .slice(0, 6)
        .map(([value, urls]) => ({ value, urls: urls.slice(0, 6) })),
      recommendation:
        "Use one current figure everywhere, with the date it was measured. Stale, conflicting counts read as unreliable.",
    });
  }

  // ---- Page inventory ------------------------------------------------------
  const aboutPage = usable.find(({ page }) => page.contentClassification === "about");
  const contactPage = usable.find(({ page }) => page.contentClassification === "contact");
  const homepage = usable.find(({ page }) => page.contentClassification === "homepage");

  const products = unique(
    usable
      .filter(({ page }) => page.contentClassification === "product")
      .map(({ page }) => page.h1[0] ?? page.title ?? "")
      .filter(Boolean),
  ).slice(0, 25);

  const services = unique(
    usable
      .filter(({ page }) => page.contentClassification === "service")
      .map(({ page }) => page.h1[0] ?? page.title ?? "")
      .filter(Boolean),
  ).slice(0, 25);

  const peopleByName = new Map<string, EntityPerson>();
  for (const { page, url } of usable) {
    if (!page.authorName || peopleByName.has(page.authorName)) continue;
    peopleByName.set(page.authorName, { name: page.authorName, role: null, sourceUrl: url });
  }
  const people = [...peopleByName.values()].slice(0, 25);

  const primaryTopics = unique(
    usable.flatMap(({ page }) => page.h2.slice(0, 3)).map((heading) => heading.trim()),
  )
    .filter((topic) => topic.length > 8 && topic.length < 80)
    .slice(0, 20);

  const uniqueSellingPropositions = unique(
    (homepage?.page.directAnswerParagraphs ?? []).slice(0, 5),
  );

  const description =
    schemaString(primaryOrg, "description") ??
    homepage?.page.metaDescription ??
    aboutPage?.page.metaDescription ??
    null;

  const locations = unique(
    orgNodes
      .map((node) => {
        const address = node["address"];
        if (typeof address === "string") return address;
        if (isRecord(address)) {
          const parts = ["streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry"]
            .map((key) => (typeof address[key] === "string" ? (address[key] as string) : null))
            .filter((part): part is string => Boolean(part));
          return parts.join(", ");
        }
        return null;
      })
      .filter((value): value is string => Boolean(value)),
  );

  // ---- Consistency score ---------------------------------------------------
  // Start at 100 and deduct for each contradiction, weighted by how badly it
  // confuses an engine trying to describe the company.
  const contradictionWeights: Record<string, number> = {
    organization_name: 25,
    founding_year: 18,
    contact_phone: 10,
    employee_count: 8,
    customer_count: 8,
  };
  const deduction = contradictions.reduce(
    (sum, entry) => sum + (contradictionWeights[entry.field] ?? 10),
    0,
  );
  const completenessBonus =
    (hasOrganizationSchema ? 0 : -12) +
    (aboutPage ? 0 : -8) +
    (contactPage ? 0 : -6) +
    (sameAsUrls.length > 0 ? 0 : -6) +
    (description ? 0 : -6);

  const consistencyScore = round(Math.max(0, Math.min(100, 100 - deduction + completenessBonus)), 1);

  // ---- Issues --------------------------------------------------------------
  for (const contradiction of contradictions) {
    issues.push({
      code: `entity_consistency_${contradiction.field}`,
      title: `Entity consistency issue: ${contradiction.field.replace(/_/g, " ")}`,
      description: contradiction.description,
      severity: contradiction.field === "organization_name" || contradiction.field === "founding_year" ? "high" : "medium",
      disciplines: ["geo"],
      whyItMatters:
        "When your own site states two different facts about your company, an AI engine has no way to decide which is true, so it tends to say nothing about you at all.",
      seoImpact: "Weaker brand entity recognition and knowledge panel eligibility.",
      aeoImpact: "Answer engines avoid stating facts they cannot corroborate.",
      geoImpact: "Directly reduces how confidently a generative engine will describe or recommend you.",
      recommendation: contradiction.recommendation,
      implementationExample: null,
      effort: "easy",
      affectedUrls: unique(contradiction.values.flatMap((value) => value.urls)).slice(0, 30),
      evidence: { values: contradiction.values },
    });
  }

  if (!aboutPage) {
    issues.push({
      code: "missing_about_page",
      title: "No About page was found",
      description: "The crawl found no page describing the company itself.",
      severity: "medium",
      disciplines: ["geo"],
      whyItMatters:
        "The About page is where an engine, and a cautious buyer, goes to confirm you are a real business with real people.",
      seoImpact: "Weaker E-E-A-T signals across the whole site.",
      aeoImpact: "No authoritative source for questions about the company itself.",
      geoImpact: "Materially reduces the confidence with which an AI engine will describe you.",
      recommendation:
        "Publish an About page stating what the company does, when it was founded, who leads it, and where it operates.",
      implementationExample: null,
      effort: "moderate",
      affectedUrls: [],
    });
  }

  const profile: EntityProfile = {
    brandName: input.brandName,
    organizationName: schemaNames[0] ?? input.brandName,
    description,
    category: null,
    products,
    services,
    locations,
    people,
    sameAsUrls,
    contactEmail: contactEmails[0] ?? null,
    contactPhone: contactPhones[0] ?? null,
    contactAddress: locations[0] ?? null,
    primaryTopics,
    uniqueSellingPropositions,
    structuredIdentity: primaryOrg ?? {},
    consistencyScore,
  };

  return {
    profile,
    contradictions,
    issues,
    siteSignals: {
      hasOrganizationSchema,
      hasAboutPage: Boolean(aboutPage),
      hasContactPage: Boolean(contactPage),
      contactDetailsFound: contactEmails.length > 0 || contactPhones.length > 0,
    },
  };
}
