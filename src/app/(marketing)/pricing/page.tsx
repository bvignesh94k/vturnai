import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd, Section, SectionHeading } from "@/components/marketing/sections";
import { PRO_PLAN } from "@/lib/config/plans";
import { breadcrumbSchema, faqSchema, softwareApplicationSchema } from "@/lib/config/structured-data";
import { formatCurrencyINR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: `V Turn AI Pro is ${formatCurrencyINR(PRO_PLAN.priceMinor)} per month with a ${PRO_PLAN.trialDays}-day free trial. One website, 500 crawled URLs, 25 tracked AI prompts, 5 competitors and all integrations included.`,
  alternates: { canonical: "/pricing" },
};

const INCLUDED = [
  { label: `${PRO_PLAN.limits.projects} website project`, detail: "One domain, fully monitored." },
  { label: `${PRO_PLAN.limits.crawledUrls} crawled URLs`, detail: "Per audit, with every page scored." },
  { label: `${PRO_PLAN.limits.activePrompts} tracked AI prompts`, detail: "Active at any one time." },
  { label: `${PRO_PLAN.limits.competitors} tracked competitors`, detail: "Share of voice and content gaps." },
  {
    label: `${PRO_PLAN.limits.scheduledAiScansPerMonth} scheduled AI scans`,
    detail: "Per month, across every connected engine.",
  },
  {
    label: `${PRO_PLAN.limits.manualAiScansPerMonth} manual AI scans`,
    detail: "Run one whenever you have shipped a change.",
  },
  { label: "Unlimited manual audits", detail: `Up to ${PRO_PLAN.limits.websiteAuditsPerMonth} crawls per month.` },
  { label: "Google Search Console", detail: "Clicks, impressions, queries, pages and positions." },
  { label: "Bing Webmaster Tools", detail: "Traffic, keywords and index information." },
  { label: "PageSpeed analysis", detail: "Mobile and desktop on your key pages." },
  { label: "Google Analytics 4", detail: "Optional, including AI referral traffic." },
  { label: "Content optimizer", detail: "Score a URL or a draft before you publish." },
  { label: "Opportunity engine", detail: "Everything ranked by impact for effort." },
  { label: `${PRO_PLAN.limits.reportsPerMonth} reports per month`, detail: "Print-friendly and client-ready." },
];

const NOT_INCLUDED = [
  { label: "API access", detail: "Planned for a later release." },
  { label: "White-label reports", detail: "Not available on Pro today." },
  { label: "Multiple team seats", detail: "Pro is a single-workspace plan." },
];

const FAQS = [
  {
    question: "What happens when the 7-day trial ends?",
    answer:
      "Your payment mandate is registered when you start the trial, and the first payment is collected when the trial ends. You can cancel at any point during the trial and nothing is charged.",
  },
  {
    question: "How is payment handled?",
    answer:
      "Billing runs on Razorpay Subscriptions in Indian Rupees. V Turn AI never sees or stores your card details, and subscription status is always verified server-side against Razorpay rather than trusted from the browser.",
  },
  {
    question: "Can I cancel any time?",
    answer:
      "Yes. Cancel from the Billing page and your plan stays active until the end of the period you have already paid for. There is no cancellation fee and no notice period.",
  },
  {
    question: "What counts as an AI prompt execution?",
    answer:
      "One prompt sent to one engine. A scan of 25 prompts across 5 engines uses 125 executions. Identical prompts are automatically skipped within a 20-hour window, so refreshing the dashboard never costs you anything.",
  },
  {
    question: "Do I need my own AI provider API keys?",
    answer:
      "The deployment supplies the provider keys. If a provider is not configured, that engine reports as unavailable rather than showing estimated data — we never invent a number to fill a gap.",
  },
  {
    question: "Is GST included?",
    answer:
      "Prices are shown exclusive of applicable taxes. Any GST is applied by Razorpay at checkout according to your billing details.",
  },
] as const;

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing" },
        ])}
      />
      <JsonLd data={softwareApplicationSchema()} />
      <JsonLd data={faqSchema(FAQS)} />

      <Section className="border-b">
        <SectionHeading
          eyebrow="Pricing"
          title="One plan, priced for the people who actually do the work"
          description="Built for SMEs, freelancers, in-house marketers, consultants and small agencies. No sales call, no annual lock-in."
        />
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl">
          <div className="card-elevated overflow-hidden rounded-2xl border bg-card">
            <div className="border-b bg-secondary/40 p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                    {PRO_PLAN.name}
                  </p>
                  <p className="mt-3 text-5xl font-semibold tracking-tight">
                    {formatCurrencyINR(PRO_PLAN.priceMinor)}
                    <span className="text-lg font-normal text-muted-foreground">/month</span>
                  </p>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {PRO_PLAN.description}
                  </p>
                </div>
                <Badge variant="success" className="px-3 py-1">
                  {PRO_PLAN.trialDays}-day free trial
                </Badge>
              </div>

              <Button size="lg" variant="gradient" asChild className="mt-7 w-full sm:w-auto">
                <Link href="/signup">Start 7-Day Free Trial</Link>
              </Button>
            </div>

            <div className="p-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Everything included
              </h2>
              <ul className="mt-5 grid gap-3.5 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li key={item.label} className="flex gap-3">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <h2 className="mt-9 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Not included today
              </h2>
              <ul className="mt-5 grid gap-3.5 sm:grid-cols-2">
                {NOT_INCLUDED.map((item) => (
                  <li key={item.label} className="flex gap-3">
                    <XIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground/80">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Limits are enforced server-side and can be raised by us without a new release, so if you
            outgrow the plan we can help before you have to leave it.
          </p>
        </div>
      </Section>

      <Section className="border-t bg-secondary/30">
        <SectionHeading eyebrow="Billing" title="Questions about pricing and payment" />
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
      </Section>
    </>
  );
}
