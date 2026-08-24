import type { Metadata } from "next";
import Link from "next/link";
import {
  ActivityIcon,
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  CompassIcon,
  FileTextIcon,
  GaugeIcon,
  LayersIcon,
  ListChecksIcon,
  QuoteIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TargetIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EngineBadges } from "@/components/marketing/engine-badges";
import { HeroCheckForm } from "@/components/marketing/hero-check-form";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { FeatureCard, JsonLd, Section, SectionHeading } from "@/components/marketing/sections";
import { DISCIPLINES, SITE } from "@/lib/config/site";
import { PRO_PLAN } from "@/lib/config/plans";
import { HEO_WEIGHTS } from "@/lib/config/scoring";
import {
  faqSchema,
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema,
} from "@/lib/config/structured-data";
import { formatCurrencyINR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Know How Visible Your Brand Is Across Google and AI Search",
  description:
    "See whether ChatGPT, Gemini, Claude, Perplexity and Grok mention you, cite you, or recommend a competitor, alongside your Google and Bing visibility. V Turn AI scores SEO, AEO, GEO and HEO, then gives you one ranked list of what to fix first.",
  alternates: { canonical: "/" },
};

/**
 * These questions are rendered visibly below and reused in FAQPage schema.
 * Keeping one source guarantees the markup always matches the page, the same
 * rule the AEO analyzer enforces on customers.
 */
const FAQS = [
  {
    question: "What is AI visibility?",
    answer:
      "AI visibility is how often AI answer engines mention your brand, cite your website and recommend you when someone asks a question in your category. It is the AI equivalent of a search ranking, except there is no results page to check. You have to measure it by asking the engines directly.",
  },
  {
    question: "How does V Turn AI measure AI visibility?",
    answer:
      "V Turn AI sends the questions you track to each engine's official developer API with web search enabled, then analyses the answer for whether your brand is mentioned, cited, recommended or omitted. Every measurement is labelled with the engine, the model, the date and whether it was directly observed, API-observed or estimated.",
  },
  {
    question: "What is the difference between SEO, AEO and GEO?",
    answer:
      "SEO is being findable in a list of blue links. AEO is being the passage that gets quoted as the direct answer to a question. GEO is being understood and trusted well enough that a generative engine cites you when it writes its own answer. HEO is the combined score across all three.",
  },
  {
    question: "Do I need to be technical to use V Turn AI?",
    answer:
      "No. Every score has a plain-language explanation of what it means, why it matters, how it was calculated and what to do about it. Findings arrive as a ranked list of actions with copyable examples, not a spreadsheet of errors.",
  },
  {
    question: "How much does V Turn AI cost?",
    answer: `V Turn AI Pro costs ${formatCurrencyINR(PRO_PLAN.priceMinor)} per month and starts with a ${PRO_PLAN.trialDays}-day free trial. It includes one website, up to ${PRO_PLAN.limits.crawledUrls} crawled URLs, ${PRO_PLAN.limits.activePrompts} tracked AI prompts and ${PRO_PLAN.limits.competitors} tracked competitors.`,
  },
  {
    question: "Can V Turn AI guarantee that AI engines will cite my site?",
    answer:
      "No, and any tool that promises this is misleading you. AI engines choose their own sources. What V Turn AI does is measure where you stand today, show exactly which factors make a page more citable, and track whether your changes move the numbers.",
  },
] as const;

const PROBLEMS = [
  {
    icon: <SearchIcon />,
    title: "Your rankings look fine. Your traffic does not.",
    body: "More answers are given without a click. A position that used to earn visits now earns an impression and nothing else.",
  },
  {
    icon: <BotIcon />,
    title: "You have no idea what AI says about you.",
    body: "Someone asks ChatGPT for the best option in your category. You cannot see the answer, so you cannot tell whether you were named, ignored, or described inaccurately.",
  },
  {
    icon: <LayersIcon />,
    title: "Your audit tool gives you 500 errors and no plan.",
    body: "A list sorted by error type is not a plan. You need to know which single change matters most this week.",
  },
];

const CAPABILITIES = [
  {
    icon: <ActivityIcon />,
    title: "AI visibility monitoring",
    body: "Track how often each engine mentions your brand, cites your domain and actively recommends you, per engine, per prompt, over time.",
  },
  {
    icon: <TargetIcon />,
    title: "Prompt tracking, not just keywords",
    body: "People ask AI engines full questions. Track the questions that decide purchases in your category, grouped by intent from awareness to transactional.",
  },
  {
    icon: <GaugeIcon />,
    title: "Technical SEO audit",
    body: "Crawl, indexability, titles, headings, structured data, internal links, Core Web Vitals, with severity, affected URLs and an exact fix.",
  },
  {
    icon: <QuoteIcon />,
    title: "Citation readiness scoring",
    body: "Every page scored on how quotable it actually is: facts, statistics, sources, author, dates, tables and definitions.",
  },
  {
    icon: <CompassIcon />,
    title: "Entity consistency checks",
    body: "We compare what your pages say about your own company. Two founding years or two phone numbers make engines hesitate to describe you at all.",
  },
  {
    icon: <TrendingUpIcon />,
    title: "Competitor share of voice",
    body: "See which competitors get named instead of you, on which prompts, and what their pages do that yours do not.",
  },
  {
    icon: <ListChecksIcon />,
    title: "One prioritised action list",
    body: "Every finding becomes a ranked opportunity scored on severity, visibility impact, pages affected, traffic potential and effort.",
  },
  {
    icon: <FileTextIcon />,
    title: "Client-ready reports",
    body: "Executive summary, scores, engine breakdown, competitors, top issues and a recommended action plan, with data sources stated.",
  },
];

export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationSchema()} />
      <JsonLd data={websiteSchema()} />
      <JsonLd data={softwareApplicationSchema()} />
      <JsonLd data={faqSchema(FAQS)} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 bg-aurora" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
            {/* Copy */}
            <div className="animate-rise">
              <Badge variant="soft" className="mb-6 px-3 py-1">
                <SparklesIcon className="size-3" />
                SEO · AEO · GEO · HEO in one score
              </Badge>

              <h1 className="text-[2.6rem] font-extrabold leading-[1.05] text-balance sm:text-5xl lg:text-[3.5rem]">
                Know exactly how visible your brand is{" "}
                <span className="text-gradient">everywhere people search</span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
                Google and Bing are half the story. See whether ChatGPT, Gemini, Claude, Perplexity
                and Grok mention you, cite you, or recommend a competitor instead, and get one
                ranked list of what to fix first.
              </p>

              <div className="mt-9 max-w-xl">
                <HeroCheckForm />
              </div>

              <dl className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                {[
                  { value: "6", label: "AI engines tracked" },
                  { value: "4", label: "Disciplines scored" },
                  { value: `${formatCurrencyINR(PRO_PLAN.priceMinor)}`, label: "per month, one plan" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-baseline gap-2">
                    <dt className="font-display text-xl font-extrabold tabular-nums text-primary">
                      {stat.value}
                    </dt>
                    <dd className="text-sm text-muted-foreground">{stat.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Proof */}
            <HeroVisual className="animate-rise [animation-delay:120ms] lg:mt-0" />
          </div>

          <div className="mt-20">
            <div className="mx-auto h-px max-w-md rule-brand" aria-hidden="true" />
            <p className="mt-8 text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Monitoring visibility across
            </p>
            <EngineBadges className="mt-5" />
          </div>
        </div>
      </section>

      {/* The problem */}
      <Section>
        <SectionHeading
          eyebrow="The problem"
          title="Search did not disappear. It moved."
          description="Your customers still ask the same questions. They just ask them somewhere you cannot see."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PROBLEMS.map((problem) => (
            <FeatureCard key={problem.title} icon={problem.icon} title={problem.title}>
              {problem.body}
            </FeatureCard>
          ))}
        </div>
      </Section>

      {/* The four disciplines */}
      <Section className="border-y bg-secondary/30">
        <SectionHeading
          eyebrow="How we score you"
          title="Four disciplines, one number you can act on"
          description="Your V Score combines all four so you always know what to work on next, and we show you exactly how it was calculated."
        />

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {(["seo", "aeo", "geo", "heo"] as const).map((key) => {
            const discipline = DISCIPLINES[key];
            const weight =
              key === "heo" ? null : HEO_WEIGHTS[key as "seo" | "aeo" | "geo"];
            return (
              <div key={key} className="card-elevated rounded-xl border bg-card p-6">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tracking-tight text-primary">
                    {discipline.label}
                  </span>
                  {weight !== null ? (
                    <Badge variant="muted">{Math.round(weight * 100)}% of V Score</Badge>
                  ) : (
                    <Badge variant="soft">The V Score</Badge>
                  )}
                </div>
                <p className="mt-3 text-sm font-medium">{discipline.fullName}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {discipline.blurb}
                </p>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
          Experience &amp; Authority makes up the remaining{" "}
          {Math.round(HEO_WEIGHTS.experienceAuthority * 100)}%: evidence that identifiable experts
          stand behind your content.
        </p>
      </Section>

      {/* Capabilities */}
      <Section>
        <SectionHeading
          eyebrow="What you get"
          title="Everything you need to be found, cited and chosen"
          description="Built for owners, freelancers, in-house marketers and small agencies, not for a team of specialists."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((capability) => (
            <FeatureCard key={capability.title} icon={capability.icon} title={capability.title}>
              {capability.body}
            </FeatureCard>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section className="border-y bg-secondary/30">
        <SectionHeading
          eyebrow="How it works"
          title="From a URL to an action plan in under an hour"
        />
        <ol className="mt-12 grid gap-6 md:grid-cols-4">
          {[
            {
              step: "1",
              title: "Add your website",
              body: "Tell us your URL, brand name, category and who you sell to. Add competitors if you want to compare.",
            },
            {
              step: "2",
              title: "We build your profile",
              body: "We crawl your site, read robots.txt and your sitemap, extract your structured data and score every page.",
            },
            {
              step: "3",
              title: "We ask the AI engines",
              body: "Your tracked questions go to each connected engine. We record what was said, what was cited and who was recommended.",
            },
            {
              step: "4",
              title: "You get a ranked plan",
              body: "Every finding becomes a prioritised action with the affected URLs, an exact fix and an honest effort estimate.",
            },
          ].map((item) => (
            <li key={item.step} className="card-elevated rounded-xl border bg-card p-6">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                {item.step}
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-tight">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Honesty section: a genuine differentiator, not a disclaimer */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading
              align="left"
              eyebrow="How we handle the truth"
              title="Numbers you can defend in front of a client"
              description="AI visibility is a young field full of confident-sounding guesses. We would rather show you a gap than fill it with something invented."
            />
          </div>
          <ul className="space-y-4">
            {[
              {
                title: "Every measurement is labelled",
                body: "Engine, model, execution date, and whether the result was directly observed, API-observed or estimated.",
              },
              {
                title: "We never fabricate an engine's data",
                body: "If an engine has no authorised API available to us, we say the connection is unavailable. We do not scrape consumer products and present the result as a measurement.",
              },
              {
                title: "Partial results stay partial",
                body: "If four of five engines answered, we say so. A failed provider never quietly becomes a zero on your chart.",
              },
              {
                title: "No guarantees we cannot keep",
                body: "We will never promise that a change produces an AI citation. We show you what makes pages citable and whether your numbers moved.",
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[var(--success)]">
                  <CheckIcon className="size-3.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Pricing teaser */}
      <Section className="border-y bg-secondary/30">
        <div className="mx-auto max-w-2xl text-center">
          <SectionHeading
            eyebrow="Pricing"
            title="One plan. Everything included."
            description="No feature gating, no per-seat surprises. Start with a 7-day free trial."
          />
          <div className="card-elevated mt-10 rounded-2xl border bg-card p-8 text-left">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                  {PRO_PLAN.name}
                </p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">
                  {formatCurrencyINR(PRO_PLAN.priceMinor)}
                  <span className="text-base font-normal text-muted-foreground">/month</span>
                </p>
              </div>
              <Badge variant="success">{PRO_PLAN.trialDays}-day free trial</Badge>
            </div>

            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {[
                `${PRO_PLAN.limits.projects} website project`,
                `Up to ${PRO_PLAN.limits.crawledUrls} crawled URLs`,
                `${PRO_PLAN.limits.activePrompts} tracked AI prompts`,
                `${PRO_PLAN.limits.competitors} tracked competitors`,
                `${PRO_PLAN.limits.scheduledAiScansPerMonth} scheduled AI scans per month`,
                "Google Search Console & Bing",
                "PageSpeed analysis",
                "Reports & competitor analysis",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm">
                  <CheckIcon className="size-4 shrink-0 text-[var(--success)]" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" variant="gradient" asChild className="flex-1">
                <Link href="/signup">Start 7-Day Free Trial</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="flex-1">
                <Link href="/pricing">See full details</Link>
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* FAQ: visible content that matches the FAQPage schema above */}
      <Section>
        <SectionHeading eyebrow="Questions" title="Frequently asked questions" />
        <div className="mx-auto mt-10 max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, index) => (
              <AccordionItem key={faq.question} value={`item-${index}`}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t">
        <div className="pointer-events-none absolute inset-0 bg-aurora opacity-60" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
          <ShieldCheckIcon className="mx-auto size-10 text-primary" />
          <h2 className="mt-6 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {SITE.tagline}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Find out where you stand across search and AI answer engines, and exactly what to fix
            first.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="gradient" asChild>
              <Link href="/signup">
                Start 7-Day Free Trial <ArrowRightIcon />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/ai-visibility">How AI visibility works</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
