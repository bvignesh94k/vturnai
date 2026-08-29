import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono, Sora } from "next/font/google";
import { GoogleTagManager } from "@next/third-parties/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE, appUrl } from "@/lib/config/site";
import "./globals.css";

/**
 * The brand sheet specifies Sora 800 for the wordmark and Figtree 500–600 for
 * the tagline and interface. Loading the same two faces the logo is drawn in is
 * what makes the product feel like the mark rather than merely match it.
 */
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap" });
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: `${SITE.name} · ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.shortDescription,
  applicationName: SITE.name,
  keywords: [
    "AI visibility",
    "answer engine optimization",
    "generative engine optimization",
    "SEO audit",
    "AEO",
    "GEO",
    "HEO",
    "ChatGPT visibility",
    "Perplexity citations",
    "brand mentions in AI",
  ],
  authors: [{ name: SITE.name, url: appUrl() }],
  creator: SITE.name,
  publisher: SITE.name,
  alternates: { canonical: "/" },
  // Icons come from the file conventions next to this file, `icon.svg` and
  // `apple-icon.tsx`, so they are not re-declared here.
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: appUrl(),
    siteName: SITE.name,
    title: `${SITE.name} · ${SITE.tagline}`,
    description: SITE.shortDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} · ${SITE.tagline}`,
    description: SITE.shortDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfdff" },
    // The brand's dark ground, so the browser chrome matches the page.
    { media: "(prefers-color-scheme: dark)", color: "#0c0a22" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The font variables must land on the root element: `--font-sans` and
    // `--font-display` are declared on `:root`, and a `var()` inside a custom
    // property resolves against the element that declares it. Put them on
    // <body> and those tokens compute to nothing, silently falling back to the
    // system stack.
    <html
      lang="en"
      className={`${figtree.variable} ${sora.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      {/*
        GoogleTagManager (the official Next.js package) places the loader
        script in <head> on every route through this one root layout,
        marketing, auth, the dashboard, admin. It does not add the <noscript>
        fallback GTM also calls for, so that is added by hand directly below,
        first inside <body>, matching Google's own placement instructions.
      */}
      <GoogleTagManager gtmId="GTM-5FS8ZGQ5" />
      <body className="antialiased">
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-5FS8ZGQ5"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        <ThemeProvider>
          <TooltipProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
            >
              Skip to content
            </a>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
