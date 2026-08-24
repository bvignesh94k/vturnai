import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JsonLd, Section, SectionHeading } from "@/components/marketing/sections";
import { ENGINE_LIST, OBSERVATION_MODES } from "@/lib/config/engines";
import { METRIC_EXPLANATIONS } from "@/lib/config/metric-explanations";
import { breadcrumbSchema, faqSchema } from "@/lib/config/structured-data";

export const metadata: Metadata = {
  title: "AI Visibility Monitoring",
  description:
    "Measure how often ChatGPT, Gemini, Claude, Perplexity and Grok mention your brand, cite your website and recommend you, with every measurement labelled by engine, model and date.",
  alternates: { canonical: "/ai-visibility" },
};

const METRICS = [
  "brandMentionRate",
  "citationRate",
  "recommendationRate",
  "promptCoverage",
  "aiShareOfVoice",
  "engineConsistency",
  "citationDiversity",
] as const;

const FAQS = [
  {
    question: "Why can't I just check ChatGPT myself?",
    answer:
      "You can, once. AI answers vary between sessions, models and regions, so a single check tells you almost nothing. Visibility is a rate, not an event: it only means something measured across many prompts, repeatedly, over time.",
  },
  {
    question: "Is an API result the same as what a real user sees?",
    answer:
      "No, and we never claim it is. The consumer product and the developer API can use different models, different retrieval and different personalisation. An API observation is a rigorous, repeatable proxy, which is why we label every measurement with the engine, model and date rather than presenting it as a consumer ranking.",
  },
  {
    question: "What about Microsoft Copilot?",
    answer:
      "Copilot has no public developer API for the consumer product, and we do not scrape Microsoft's consumer Copilot website. We support the Microsoft 365 Copilot Chat API for tenants that have it. Without that connection the product shows 'Copilot connection unavailable' and no data, never an estimate presented as a measurement.",
  },
  {
    question: "How many prompts should I track?",
    answer:
      "Start with 15 to 25 questions that genuinely precede a purchase in your category: the problem, the category, the comparison, the alternatives and your brand. Tracking a hundred vague questions produces a busier dashboard and no better decisions.",
  },
] as const;

export default function AiVisibilityPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "AI Visibility", path: "/ai-visibility" },
        ])}
      />
      <JsonLd data={faqSchema(FAQS)} />

      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 bg-aurora opacity-60" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center sm:px-6">
          <Badge variant="soft" className="mb-6">
            AI Visibility
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Find out what AI engines say about you when you are not in the room
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Someone asks an AI assistant for the best option in your category. V Turn AI measures
            whether you were named, cited, recommended, or never came up at all.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="gradient" asChild>
              <Link href="/signup">
                Start 7-Day Free Trial <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* What we measure */}
      <Section>
        <SectionHeading
          eyebrow="What we measure"
          title="Seven metrics that describe AI visibility honestly"
          description="Each one has a single published definition, used identically in the dashboard, the API and every report."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {METRICS.map((key) => {
            const metric = METRIC_EXPLANATIONS[key];
            return (
              <div key={key} className="card-elevated rounded-xl border bg-card p-6">
                <h3 className="text-base font-semibold tracking-tight">{metric.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {metric.whatItMeans}
                </p>
                <dl className="mt-4 space-y-2 border-t pt-4">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      How it is calculated
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed">{metric.howCalculated}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Engines */}
      <Section className="border-y bg-secondary/30">
        <SectionHeading
          eyebrow="Engines"
          title="Which engines we monitor, and exactly how"
          description="We call each engine's official developer API. We do not scrape consumer products, and we never imply an endorsement that does not exist."
        />

        <div className="mt-10 overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engine</TableHead>
                <TableHead>Operated by</TableHead>
                <TableHead>How we observe it</TableHead>
                <TableHead className="text-right">Citations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ENGINE_LIST.map((engine) => (
                <TableRow key={engine.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: engine.accent }}
                      >
                        {engine.monogram}
                      </span>
                      {engine.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{engine.vendor}</TableCell>
                  <TableCell className="max-w-md text-sm leading-relaxed text-muted-foreground">
                    {engine.observationNote}
                  </TableCell>
                  <TableCell className="text-right">
                    {engine.supportsCitations ? (
                      <Badge variant="success">Supported</Badge>
                    ) : (
                      <Badge variant="muted">Not returned</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Alert variant="info" className="mt-8">
          <InfoIcon />
          <AlertTitle>Every measurement carries its provenance</AlertTitle>
          <AlertDescription>
            <p>
              Each result is stamped with the engine, the model, the execution date and one of these
              modes:
            </p>
            <ul className="mt-2 space-y-1">
              {Object.values(OBSERVATION_MODES).map((mode) => (
                <li key={mode.key}>
                  <span className="font-medium text-foreground">{mode.label}:</span> {mode.description}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      </Section>

      {/* Prompts */}
      <Section>
        <SectionHeading
          eyebrow="Prompt tracking"
          title="Track questions, not keywords"
          description="Nobody types 'crm software india' into ChatGPT. They ask a question, and the answer they get is the whole result page."
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {[
            "What are the best CRM platforms for SMEs in India?",
            "Which CRM should a small sales team choose?",
            "Best alternatives to [competitor]",
            "Recommend affordable CRM software",
            "How can SMEs manage sales leads?",
          ].map((prompt) => (
            <div
              key={prompt}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 font-mono text-sm"
            >
              <span className="text-muted-foreground">&gt;</span>
              {prompt}
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
          V Turn AI suggests prompts from your own website content, your services, your Search
          Console queries and your competitors, grouped by intent from awareness through to
          transactional. You edit them before any of them go live.
        </p>
      </Section>

      <Section className="border-t bg-secondary/30">
        <SectionHeading eyebrow="Questions" title="What people ask us about AI visibility" />
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
