import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3Icon,
  BellIcon,
  BotIcon,
  BuildingIcon,
  FileTextIcon,
  GaugeIcon,
  LinkIcon,
  ListChecksIcon,
  PenLineIcon,
  QuoteIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeatureCard, JsonLd, Section, SectionHeading } from "@/components/marketing/sections";
import { breadcrumbSchema } from "@/lib/config/structured-data";
import { AEO_WEIGHTS, GEO_WEIGHTS, SEO_WEIGHTS } from "@/lib/config/scoring";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Website crawling, technical SEO audit, AEO and GEO analysis, AI visibility monitoring, prompt tracking, competitor share of voice, a prioritised opportunity engine and client-ready reports.",
  alternates: { canonical: "/features" },
};

const GROUPS = [
  {
    id: "measure",
    eyebrow: "Measure",
    title: "Know exactly where you stand",
    features: [
      {
        icon: <SearchIcon />,
        title: "Website crawler",
        body: "Reads robots.txt, discovers your sitemap, follows internal links, and respects crawl delays. Extracts titles, headings, schema, links, images, FAQs, tables, authors and dates from every page.",
      },
      {
        icon: <GaugeIcon />,
        title: "Technical SEO audit",
        body: "HTTP errors, redirect chains, duplicate and missing metadata, heading problems, canonical conflicts, thin content, broken internal links, orphan pages, HTTPS and mixed content.",
      },
      {
        icon: <BotIcon />,
        title: "AI visibility monitoring",
        body: "Sends your tracked questions to each connected engine's official API and records whether you were mentioned, cited, recommended, compared or omitted.",
      },
      {
        icon: <BarChart3Icon />,
        title: "Search & analytics integrations",
        body: "Google Search Console, Bing Webmaster Tools, PageSpeed Insights and optional GA4, including an AI referral traffic report.",
      },
    ],
  },
  {
    id: "understand",
    eyebrow: "Understand",
    title: "Know why the numbers look like that",
    features: [
      {
        icon: <QuoteIcon />,
        title: "AEO analyzer",
        body: `Scores ${AEO_WEIGHTS.length} answer-readiness factors per page, from question targeting and direct answers to FAQ usefulness, tables and supporting evidence.`,
      },
      {
        icon: <SparklesIcon />,
        title: "GEO analyzer",
        body: `Scores ${GEO_WEIGHTS.length} generative-engine factors, including citation-worthy statements, original data, expert authorship, entity clarity and AI crawler accessibility.`,
      },
      {
        icon: <BuildingIcon />,
        title: "Brand & entity analysis",
        body: "Builds one profile of your company from every page, then flags contradictions: two founding years, two phone numbers, two company names.",
      },
      {
        icon: <LinkIcon />,
        title: "Citation readiness",
        body: "Every page gets a score for how quotable it is, with the specific missing ingredient named: no statistics, no sources, no author, no date.",
      },
    ],
  },
  {
    id: "act",
    eyebrow: "Act",
    title: "Know what to do on Monday morning",
    features: [
      {
        icon: <ListChecksIcon />,
        title: "Opportunity engine",
        body: "Turns every finding into a ranked action scored on severity, visibility impact, pages affected, traffic potential and effort. You always know the single best next task.",
      },
      {
        icon: <PenLineIcon />,
        title: "Content optimizer",
        body: "Paste a URL or a draft and get SEO, AEO, GEO and HEO scores with grouped recommendations. Nothing is overwritten. Every suggestion is yours to copy or ignore.",
      },
      {
        icon: <UsersIcon />,
        title: "Competitor intelligence",
        body: "Track up to five competitors. See who gets named instead of you, on which prompts, plus 'Why They Win' and 'How You Can Compete' built from evidence.",
      },
      {
        icon: <FileTextIcon />,
        title: "Reports",
        body: "Print-friendly reports covering the executive summary, all four scores, engine breakdown, competitors, top issues and a recommended action plan.",
      },
    ],
  },
  {
    id: "operate",
    eyebrow: "Operate",
    title: "Built like a product you can trust with a budget",
    features: [
      {
        icon: <SlidersHorizontalIcon />,
        title: "Cost protection",
        body: "AI scans run only from an explicit scan job, never from a page load. Duplicate prompts are skipped, quotas are enforced server-side and spend is logged.",
      },
      {
        icon: <BellIcon />,
        title: "Notifications",
        body: "Audit complete, AI scan complete, major visibility drop, new critical issue, trial ending, payment failed and report ready.",
      },
      {
        icon: <GaugeIcon />,
        title: "Live scan progress",
        body: "Crawls and scans run as background jobs in small batches, with real progress rather than an indeterminate spinner.",
      },
      {
        icon: <BotIcon />,
        title: "Honest provider handling",
        body: "One engine failing never fails a scan. You see '4 of 5 engines completed', and an engine with no authorised API says so instead of showing invented numbers.",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Features", path: "/features" },
        ])}
      />

      <Section className="border-b">
        <SectionHeading
          eyebrow="Features"
          title="One platform for search visibility and AI visibility"
          description="V Turn AI crawls your site, audits it against search and answer-engine best practice, asks the AI engines what they say about you, and turns all of it into a ranked list of things to fix."
        />
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {GROUPS.map((group) => (
            <Badge key={group.id} variant="soft" asChild>
              <Link href={`#${group.id}`}>{group.eyebrow}</Link>
            </Badge>
          ))}
        </div>
      </Section>

      {GROUPS.map((group, index) => (
        <Section
          key={group.id}
          id={group.id}
          className={index % 2 === 1 ? "border-y bg-secondary/30" : undefined}
        >
          <SectionHeading eyebrow={group.eyebrow} title={group.title} align="left" />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {group.features.map((feature) => (
              <FeatureCard key={feature.title} icon={feature.icon} title={feature.title}>
                {feature.body}
              </FeatureCard>
            ))}
          </div>
        </Section>
      ))}

      <Section>
        <div className="card-elevated rounded-2xl border bg-card p-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {SEO_WEIGHTS.length + AEO_WEIGHTS.length + GEO_WEIGHTS.length} scored factors. One score
            you can explain.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Every score card shows the components, their weights and their contribution. Nothing is
            a black box, because you may have to justify it to a client.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="gradient" asChild>
              <Link href="/signup">Start 7-Day Free Trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
