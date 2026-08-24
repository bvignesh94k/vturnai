import { SITE, absoluteUrl } from "@/lib/config/site";
import { PRO_PLAN } from "@/lib/config/plans";

/**
 * JSON-LD for the marketing site.
 *
 * V Turn AI tells customers that clear structured identity is what makes a
 * brand citable, so our own site carries a complete Organization, product and
 * FAQ graph, the same thing we score them on.
 */

export function organizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${absoluteUrl("/")}#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: absoluteUrl("/"),
    description: SITE.longDescription,
    slogan: SITE.tagline,
    email: SITE.contactEmail,
    // The mark, declared as an ImageObject. Google's knowledge panel and the
    // answer engines both read `logo` off Organization, an entity without one
    // gets described without a face.
    logo: {
      "@type": "ImageObject",
      "@id": `${absoluteUrl("/")}#logo`,
      url: absoluteUrl("/brand/vturnai-icon.png"),
      contentUrl: absoluteUrl("/brand/vturnai-icon.png"),
      width: 1024,
      height: 1024,
      caption: SITE.name,
    },
    image: { "@id": `${absoluteUrl("/")}#logo` },
    foundingDate: "2026",
    areaServed: "Worldwide",
    knowsAbout: [
      "Search Engine Optimization",
      "Answer Engine Optimization",
      "Generative Engine Optimization",
      "Hybrid Engine Optimization",
      "AI brand visibility measurement",
    ],
  };
}

export function websiteSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${absoluteUrl("/")}#website`,
    url: absoluteUrl("/"),
    name: SITE.name,
    description: SITE.shortDescription,
    publisher: { "@id": `${absoluteUrl("/")}#organization` },
    inLanguage: "en",
  };
}

export function softwareApplicationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "SEO and AI visibility analytics",
    operatingSystem: "Web browser",
    description: SITE.longDescription,
    url: absoluteUrl("/"),
    publisher: { "@id": `${absoluteUrl("/")}#organization` },
    offers: {
      "@type": "Offer",
      name: PRO_PLAN.name,
      price: (PRO_PLAN.priceMinor / 100).toFixed(2),
      priceCurrency: PRO_PLAN.currency,
      availability: "https://schema.org/InStock",
      url: absoluteUrl("/pricing"),
      priceValidUntil: `${new Date().getFullYear() + 1}-12-31`,
    },
    featureList: [
      "AI visibility monitoring across ChatGPT, Gemini, Claude, Perplexity and Grok",
      "Technical SEO audit",
      "Answer Engine Optimization analysis",
      "Generative Engine Optimization analysis",
      "Competitor share of voice",
      "Prioritised opportunity list",
      "Google Search Console and Bing Webmaster integration",
    ],
  };
}

export function breadcrumbSchema(
  items: ReadonlyArray<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/**
 * FAQ schema. Only ever built from questions that are also rendered visibly on
 * the page, schema without matching content is exactly what our AEO analyzer
 * flags as spam.
 */
export function faqSchema(
  faqs: ReadonlyArray<{ question: string; answer: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function articleSchema(input: {
  title: string;
  description: string;
  path: string;
  authorName: string;
  publishedAt: string;
  updatedAt: string;
  imageUrl?: string | null;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    author: { "@type": "Organization", name: input.authorName },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      logo: { "@type": "ImageObject", url: absoluteUrl("/brand/vturnai-icon.png") },
    },
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(input.path) },
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
  };
}
