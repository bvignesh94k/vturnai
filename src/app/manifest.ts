import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config/site";

/**
 * Web app manifest. Installed/pinned instances carry the mark and the brand's
 * dark ground rather than a browser default.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} · ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.shortDescription,
    start_url: "/app",
    display: "standalone",
    background_color: "#0c0a22",
    theme_color: "#3730a3",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/brand/vturnai-icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/brand/vturnai-icon.png", type: "image/png", sizes: "1024x1024", purpose: "any" },
      { src: "/brand/vturnai-icon-dark.png", type: "image/png", sizes: "1024x1024", purpose: "maskable" },
    ],
  };
}
