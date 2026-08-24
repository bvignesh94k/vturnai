/**
 * Canonical product and site constants. Everything user-visible that describes
 * V Turn AI itself lives here so copy stays consistent across the marketing
 * site, metadata, structured data and reports.
 */

export const CANONICAL_ORIGIN = "https://vturnai.com";

/**
 * The origin every canonical, sitemap entry, OG image and JSON-LD `@id` is
 * built from.
 *
 * Order matters. An explicit `NEXT_PUBLIC_APP_URL` always wins, then the host's
 * own signals, and only a genuine local dev process may fall back to localhost
 *, a deployed build that guesses `localhost` publishes a whole site of
 * unreachable canonical URLs, which is worse than guessing the wrong domain.
 */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // Vercel.
  if (process.env.VERCEL_ENV === "production") return CANONICAL_ORIGIN;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  // Netlify: `URL` is the project's primary address, `DEPLOY_PRIME_URL` the
  // per-deploy one used for branch and preview builds.
  if (process.env.CONTEXT === "production" && process.env.URL) {
    return process.env.URL.replace(/\/+$/, "");
  }
  const netlifyDeployUrl = process.env.DEPLOY_PRIME_URL?.trim() || process.env.URL?.trim();
  if (netlifyDeployUrl) return netlifyDeployUrl.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") return CANONICAL_ORIGIN;
  return "http://localhost:3000";
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, `${appUrl()}/`).toString();
}

export const SITE = {
  name: "V Turn AI",
  legalName: "V Turn AI",
  domain: "vturnai.com",
  tagline: "Be Found. Be Cited. Be Chosen.",
  shortDescription:
    "V Turn AI measures how visible your brand is across Google, Bing and AI answer engines, then turns the findings into a prioritised action list.",
  longDescription:
    "V Turn AI is a visibility intelligence platform for SEO, AEO, GEO and HEO. It crawls your website, audits it against search and answer-engine best practice, tracks whether AI engines mention, cite and recommend your brand, and produces a ranked plan of what to fix next.",
  supportEmail: "support@vturnai.com",
  contactEmail: "hello@vturnai.com",
  crawlerUserAgent:
    "Mozilla/5.0 (compatible; VTurnAIBot/1.0; +https://vturnai.com/bot)",
  crawlerToken: "VTurnAIBot" as string,
} as const;

/** The four disciplines the product scores. Used across UI and reports. */
export const DISCIPLINES = {
  seo: {
    key: "seo",
    label: "SEO",
    fullName: "Search Engine Optimization",
    blurb: "How well classic search engines can crawl, understand and rank your pages.",
  },
  aeo: {
    key: "aeo",
    label: "AEO",
    fullName: "Answer Engine Optimization",
    blurb: "How ready your content is to be lifted as a direct answer to a question.",
  },
  geo: {
    key: "geo",
    label: "GEO",
    fullName: "Generative Engine Optimization",
    blurb: "How easily generative AI engines can understand, trust and cite your brand.",
  },
  heo: {
    key: "heo",
    label: "HEO",
    fullName: "Hybrid Engine Optimization",
    blurb: "The unified V Score combining SEO, AEO, GEO and your authority signals.",
  },
} as const;

export type DisciplineKey = keyof typeof DISCIPLINES;
