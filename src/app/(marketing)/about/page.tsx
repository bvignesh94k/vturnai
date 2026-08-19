import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JsonLd, Section, SectionHeading } from "@/components/marketing/sections";
import { SITE } from "@/lib/config/site";
import { breadcrumbSchema, organizationSchema } from "@/lib/config/structured-data";

export const metadata: Metadata = {
  title: "About",
  description:
    "V Turn AI is a visibility intelligence platform for SEO, AEO, GEO and HEO, built for SMEs, freelancers, consultants and small agencies who need clear, honest answers about where they stand.",
  alternates: { canonical: "/about" },
};

const PRINCIPLES = [
  {
    title: "Clarity over jargon",
    body: "Every metric explains what it means, why it matters, how it was calculated and how to improve it. If a business owner cannot understand a number, that number is not doing its job.",
  },
  {
    title: "Evidence over estimates",
    body: "We label every AI measurement with the engine, model, execution date and observation mode. Where we cannot measure something honestly, we say so instead of estimating and hoping.",
  },
  {
    title: "Prioritisation over volume",
    body: "Any crawler can find 500 problems. The value is in knowing which one to fix on Monday morning, and we rank every finding by impact against effort.",
  },
  {
    title: "No borrowed authority",
    body: "We are not affiliated with OpenAI, Google, Anthropic, Perplexity, xAI or Microsoft. We call their public developer APIs, and we say exactly that everywhere the data appears.",
  },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd data={organizationSchema()} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ])}
      />

      <Section className="border-b">
        <SectionHeading
          eyebrow="About"
          title="Search stopped being one place. Measurement had to follow."
          description={SITE.longDescription}
        />
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl space-y-6 text-base leading-relaxed text-muted-foreground">
          <p>
            For twenty years, being visible meant ranking on a page of blue links. That page is now
            one of several places a decision gets made. A buyer asks an assistant a question and
            receives an answer with three names in it. If yours is not one of them, the ranking you
            worked for never enters the conversation.
          </p>
          <p>
            The tooling did not keep up. Rank trackers still report positions for a results page
            fewer people look at, and the newer AI-visibility tools often report confident numbers
            without saying where they came from. Both leave the same person stuck: someone
            responsible for growth, without a specialist team, who needs to know what to do next.
          </p>
          <p>
            {SITE.name} was built for that person. It crawls your site, audits it against search and
            answer-engine practice, asks the AI engines what they actually say about you, and
            reduces all of it to a ranked list of actions with the affected URLs and an exact fix
            attached to each one.
          </p>
          <p className="font-medium text-foreground">
            Be found in search. Be cited by AI. Be chosen by the customer. That is the whole
            product, and the reason the tagline is {SITE.tagline}
          </p>
        </div>
      </Section>

      <Section className="border-y bg-secondary/30">
        <SectionHeading eyebrow="Principles" title="How we decide what to build" />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {PRINCIPLES.map((principle) => (
            <div key={principle.title} className="card-elevated rounded-xl border bg-card p-6">
              <h3 className="text-base font-semibold tracking-tight">{principle.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{principle.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Get in touch</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Questions about the product, the methodology or a specific number you have seen? Write
            to{" "}
            <a href={`mailto:${SITE.contactEmail}`} className="font-medium text-primary underline-offset-4 hover:underline">
              {SITE.contactEmail}
            </a>
            .
          </p>
          <div className="mt-8">
            <Button size="lg" variant="gradient" asChild>
              <Link href="/signup">Start 7-Day Free Trial</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
