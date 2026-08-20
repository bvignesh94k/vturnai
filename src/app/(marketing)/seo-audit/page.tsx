import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FreeVisibilityCheck } from "@/components/marketing/free-check";
import { JsonLd, Section, SectionHeading } from "@/components/marketing/sections";
import { SEO_WEIGHTS } from "@/lib/config/scoring";
import { breadcrumbSchema, faqSchema } from "@/lib/config/structured-data";

export const metadata: Metadata = {
  title: "Free SEO Audit & Visibility Check",
  description:
    "Run a free visibility check on your homepage, then crawl up to 500 URLs for a full technical SEO audit with severity, affected URLs, exact fixes and effort estimates.",
  alternates: { canonical: "/seo-audit" },
};

const CHECK_GROUPS = [
  {
    title: "Crawlability & indexing",
    items: [
      "HTTP errors and server failures",
      "Redirect chains",
      "noindex directives",
      "robots.txt blocking",
      "AI crawler accessibility",
      "Sitemap consistency",
      "Canonical conflicts and cross-domain canonicals",
    ],
  },
  {
    title: "On-page fundamentals",
    items: [
      "Missing, duplicate, long and short titles",
      "Missing and duplicate meta descriptions",
      "Missing or multiple H1 headings",
      "Heading hierarchy",
      "Thin content",
      "Language declaration",
    ],
  },
  {
    title: "Structure & links",
    items: [
      "Broken internal links",
      "Orphan-like pages",
      "Internal linking depth",
      "Breadcrumbs",
      "Structured data presence and validity",
      "Open Graph and Twitter metadata",
    ],
  },
  {
    title: "Experience & security",
    items: [
      "HTTPS coverage",
      "Mixed content",
      "Image alt text",
      "Core Web Vitals via PageSpeed Insights",
      "Mobile and desktop performance",
      "Accessibility score",
    ],
  },
];

const FAQS = [
  {
    question: "Is the free visibility check really free?",
    answer:
      "Yes. It analyses your homepage, gives you the four scores and lists the blocking problems it finds. It does not require an account and does not run any paid AI engine calls.",
  },
  {
    question: "How many pages does the full audit crawl?",
    answer:
      "Up to 500 URLs on the Pro plan. The crawler reads robots.txt, discovers your sitemap, follows internal links, skips cart, admin and search URLs, and avoids infinite parameter combinations.",
  },
  {
    question: "What makes this different from a standard SEO crawler?",
    answer:
      "Every finding is also assessed for its effect on answer engines and generative engines, not just Google. And instead of a list of errors, you get a ranked action list where the top item is the one that moves your score most for the effort it costs.",
  },
  {
    question: "Will you change anything on my website?",
    answer:
      "No. V Turn AI only reads your public pages, exactly as a search engine would. It never modifies your site, and it never publishes content on your behalf.",
  },
] as const;

export default function SeoAuditPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "SEO Audit", path: "/seo-audit" },
        ])}
      />
      <JsonLd data={faqSchema(FAQS)} />

      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 bg-aurora opacity-60" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="text-center">
            <Badge variant="soft" className="mb-6">
              Free visibility check
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Check your site the way search and AI engines see it
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Enter your address and get your SEO, AEO, GEO and citation readiness scores in about
              ten seconds. No account needed.
            </p>
          </div>

          <div id="free-check" className="mt-10 scroll-mt-24">
            {/* The check reads the address the hero hands over in `?url=`, so it
                needs a boundary to keep the rest of this page static. */}
            <Suspense
              fallback={
                <div className="card-elevated h-32 animate-pulse rounded-2xl border bg-card" />
              }
            >
              <FreeVisibilityCheck />
            </Suspense>
          </div>
        </div>
      </section>

      <Section>
        <SectionHeading
          eyebrow="Full audit"
          title="What the full crawl checks"
          description="Every issue is reported with its severity, the affected URLs, why it matters, its impact on SEO, AEO and GEO, an exact recommendation, an implementation example and an honest effort estimate."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {CHECK_GROUPS.map((group) => (
            <div key={group.title} className="card-elevated rounded-xl border bg-card p-6">
              <h3 className="text-base font-semibold tracking-tight">{group.title}</h3>
              <ul className="mt-4 space-y-2">
                {group.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-muted-foreground">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section className="border-y bg-secondary/30">
        <SectionHeading
          eyebrow="Scoring"
          title="How your SEO score is built"
          description="Seven weighted components, published openly. The dashboard shows each one's score, weight and contribution."
        />
        <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-xl border bg-card">
          {SEO_WEIGHTS.map((component) => (
            <div
              key={component.key}
              className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{component.label}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{component.description}</p>
              </div>
              <Badge variant="muted">{Math.round(component.weight * 100)}%</Badge>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="Questions" title="About the audit" />
        <div className="mx-auto mt-10 max-w-3xl">
          <Accordion type="single" collapsible>
            {FAQS.map((faq, index) => (
              <AccordionItem key={faq.question} value={`faq-${index}`}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
        <div className="mt-12 text-center">
          <Button size="lg" variant="gradient" asChild>
            <Link href="/signup">Start 7-Day Free Trial</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
