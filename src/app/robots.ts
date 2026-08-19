import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/config/site";

/**
 * V Turn AI's own robots.txt.
 *
 * We advise customers to let AI crawlers in, so we do the same: the marketing
 * site is fully open to them. Only authenticated application routes and API
 * endpoints are disallowed.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = ["/app/", "/admin/", "/api/", "/onboarding/"];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: "GPTBot", allow: "/", disallow },
      { userAgent: "OAI-SearchBot", allow: "/", disallow },
      { userAgent: "ChatGPT-User", allow: "/", disallow },
      { userAgent: "Google-Extended", allow: "/", disallow },
      { userAgent: "ClaudeBot", allow: "/", disallow },
      { userAgent: "PerplexityBot", allow: "/", disallow },
      { userAgent: "Applebot-Extended", allow: "/", disallow },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/").replace(/\/$/, ""),
  };
}
