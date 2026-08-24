import type { Metadata } from "next";
import { JsonLd, Section } from "@/components/marketing/sections";
import { PRO_PLAN } from "@/lib/config/plans";
import { SITE } from "@/lib/config/site";
import { breadcrumbSchema } from "@/lib/config/structured-data";
import { formatCurrencyINR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms governing your use of V Turn AI, including subscription billing, acceptable use, the limits of AI visibility measurement and liability.",
  alternates: { canonical: "/terms" },
};

const EFFECTIVE_DATE = "18 August 2026";

const SECTIONS = [
  {
    heading: "1. Agreement",
    body: [
      `These terms govern your use of ${SITE.name} at ${SITE.domain}. By creating an account you agree to them. If you are agreeing on behalf of a company, you confirm you have authority to do so.`,
    ],
  },
  {
    heading: "2. The service",
    body: [
      `${SITE.name} crawls websites you nominate, audits them against search and answer-engine practice, measures brand visibility across AI answer engines using those engines' public developer APIs, and produces scores, findings and recommendations.`,
    ],
  },
  {
    heading: "3. Subscription and billing",
    list: [
      `${PRO_PLAN.name} costs ${formatCurrencyINR(PRO_PLAN.priceMinor)} per month, billed in Indian Rupees through Razorpay Subscriptions.`,
      `New accounts receive a ${PRO_PLAN.trialDays}-day free trial. A payment mandate is registered when the trial starts; the first payment is collected when the trial ends.`,
      "Cancel at any time. Cancellation takes effect at the end of the period you have already paid for, and access continues until then.",
      "Prices exclude applicable taxes. Any GST is applied at checkout based on the billing details you provide.",
      "We may change pricing with at least 30 days' notice to existing subscribers. Your renewal after that notice constitutes acceptance.",
      "Plan limits are enforced server-side. Exceeding a limit pauses the metered activity until the next billing period rather than incurring an overage charge.",
    ],
  },
  {
    heading: "4. Acceptable use",
    list: [
      "You may only analyse websites you own or are authorised to analyse.",
      "You must not use the service to attack, overload, probe or gain unauthorised access to any system.",
      "You must not attempt to circumvent plan limits, rate limits or authentication.",
      "You must not resell or redistribute raw platform data as a competing measurement service.",
      "You must not use the service to generate or publish deceptive content, or to misrepresent a third party.",
    ],
  },
  {
    heading: "5. What our measurements are, and are not",
    body: [
      "AI visibility measurements are produced by calling AI engines' official developer APIs. The consumer products those companies operate may use different models, retrieval or personalisation, so an API observation is a rigorous proxy rather than a reproduction of what a specific person sees.",
      "Every measurement is labelled with the engine, model, execution date and observation mode. Where no authorised data source is available for an engine, the service reports the connection as unavailable and shows no data for it.",
    ],
    list: [
      "We do not guarantee any ranking, mention, citation or recommendation on any engine.",
      "We do not guarantee that implementing a recommendation will produce a specific outcome.",
      "Scores are analytical opinions derived from published, documented methodology, not statements of fact about your business.",
    ],
  },
  {
    heading: "6. Third-party services",
    body: [
      "The service integrates with third parties including AI engine providers, Google, Microsoft Bing and Razorpay. Your use of those services is subject to their own terms. We are not responsible for their availability, changes to their APIs, or their pricing. If a provider withdraws or changes an API, the affected feature may become unavailable.",
    ],
  },
  {
    heading: "7. Your data and content",
    body: [
      "You retain all rights to the content you submit and to your website. You grant us the limited licence needed to crawl, store and analyse it in order to provide the service. We do not sell your data, and we do not use your content to train models.",
    ],
  },
  {
    heading: "8. Availability",
    body: [
      "We aim for high availability but do not offer a contractual uptime guarantee on this plan. Scheduled maintenance, provider outages and rate limits can interrupt scans. Where a scan fails, the service reports the failure rather than substituting estimated data.",
    ],
  },
  {
    heading: "9. Suspension and termination",
    body: [
      "You may close your account at any time. We may suspend or terminate an account that breaches these terms, that is used unlawfully, or where payment repeatedly fails. Where practical we will give notice and an opportunity to correct the problem first.",
    ],
  },
  {
    heading: "10. Liability",
    body: [
      "To the maximum extent permitted by law, our aggregate liability arising from the service is limited to the fees you paid in the twelve months before the claim. We are not liable for indirect or consequential loss, including lost revenue, lost rankings or lost visibility, however caused.",
      "Nothing in these terms excludes liability that cannot lawfully be excluded.",
    ],
  },
  {
    heading: "11. Trademarks and independence",
    body: [
      `${SITE.name} is an independent product. It is not affiliated with, endorsed by, or sponsored by OpenAI, Google, Anthropic, Perplexity, xAI or Microsoft. Their names and marks belong to them and are used only to identify the services we measure.`,
    ],
  },
  {
    heading: "12. Changes",
    body: [
      "We may update these terms. Material changes will be notified in the application before taking effect, and the effective date above will be updated.",
    ],
  },
  {
    heading: "13. Contact",
    body: [`Questions about these terms: ${SITE.supportEmail}.`],
  },
];

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Terms of Service", path: "/terms" },
        ])}
      />

      <Section>
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>

          <div className="mt-12 space-y-10">
            {SECTIONS.map((section) => (
              <section key={section.heading}>
                <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
                {section.body?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
                {section.list ? (
                  <ul className="mt-4 space-y-2.5">
                    {section.list.map((item) => (
                      <li key={item} className="flex gap-3 text-base leading-relaxed text-muted-foreground">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
