import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/config/site";

/**
 * Public sitemap. Only marketing pages are listed — application routes are
 * behind authentication and must never appear in an index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const entries: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/features", priority: 0.9, changeFrequency: "weekly" },
    { path: "/ai-visibility", priority: 0.9, changeFrequency: "weekly" },
    { path: "/seo-audit", priority: 0.9, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/login", priority: 0.4, changeFrequency: "yearly" },
    { path: "/signup", priority: 0.5, changeFrequency: "yearly" },
  ];

  return entries.map((entry) => ({
    url: absoluteUrl(entry.path),
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
