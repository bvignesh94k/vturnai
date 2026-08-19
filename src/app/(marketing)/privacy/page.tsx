import type { Metadata } from "next";
import { JsonLd, Section } from "@/components/marketing/sections";
import { SITE } from "@/lib/config/site";
import { breadcrumbSchema } from "@/lib/config/structured-data";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How V Turn AI collects, uses, stores and protects your data, including website crawl data, provider credentials and billing information.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "18 August 2026";

const SECTIONS = [
  {
    heading: "Who we are",
    body: [
      `${SITE.name} ("we", "us") provides a visibility intelligence platform that analyses websites and measures brand visibility across search engines and AI answer engines. This policy explains what data we handle and why.`,
      `For any privacy question, write to ${SITE.supportEmail}.`,
    ],
  },
  {
    heading: "Data we collect",
    list: [
      "Account data: your name, email address and hashed password, managed by our authentication provider. We never store your password in a readable form.",
      "Project data: the website addresses, brand names, business descriptions, target countries, audiences and competitors you enter.",
      "Crawl data: publicly accessible content from the websites you add — page HTML, metadata, headings, structured data, links and text. We only fetch what any search engine could fetch.",
      "Measurement data: the prompts you track, the answers returned by AI engine APIs, and the metrics derived from them.",
      "Integration data: metrics retrieved from services you connect, such as Google Search Console, Bing Webmaster Tools, Google Analytics 4 and PageSpeed Insights.",
      "Billing data: subscription status and payment events from Razorpay. We never receive or store your card details.",
      "Operational data: audit logs, usage counters and error records needed to run the service securely.",
    ],
  },
  {
    heading: "How we use your data",
    list: [
      "To crawl and analyse the websites you have added to your account.",
      "To measure and report your visibility across search and AI answer engines.",
      "To generate prioritised recommendations and reports.",
      "To enforce plan limits and prevent runaway third-party API costs.",
      "To send service notifications such as scan completion, critical issues, trial expiry and payment failures.",
      "To secure the service, investigate abuse and diagnose faults.",
    ],
  },
  {
    heading: "Websites you analyse",
    body: [
      "You must have the right to analyse any website you add. Our crawler identifies itself honestly as VTurnAIBot, respects robots.txt directives by default, applies crawl delays, and never attempts to access authenticated, private or internal resources.",
      "We block requests to private networks, loopback addresses and cloud metadata endpoints, and we validate DNS resolution before every fetch so the crawler cannot be used to reach internal infrastructure.",
    ],
  },
  {
    heading: "Third-party services we send data to",
    list: [
      "AI engine providers (OpenAI, Google, Anthropic, Perplexity, xAI and, where enabled, Microsoft): we send the prompt text you configured plus your brand and domain so the answer can be analysed. We do not send your account credentials.",
      "Google (Search Console, Analytics, PageSpeed Insights): accessed with the scopes you authorise.",
      "Bing Webmaster Tools: accessed with the API key you supply.",
      "Razorpay: handles subscription payments and receives the billing details you enter directly with them.",
      "Supabase: hosts our database and authentication.",
      "Vercel: hosts the application.",
      "An email provider, only if one is configured, for notification emails.",
    ],
  },
  {
    heading: "How we protect credentials",
    body: [
      "OAuth tokens and third-party API keys are encrypted at rest with AES-256-GCM before being written to the database. The table holding them is unreadable to every browser-facing database role; only server-side code holding the encryption key can decrypt them.",
      "We never expose AI provider keys, database service-role keys, payment secrets or OAuth client secrets to the browser, and no API response returns a stored token.",
    ],
  },
  {
    heading: "Data retention",
    list: [
      "Crawl and measurement data is retained while your account is active so you can see trends over time.",
      "Deleting a project deletes its crawl data, prompts, AI runs, opportunities and reports.",
      "Deleting your account removes your profile, projects and stored credentials. Billing records are retained where we are legally required to keep them.",
      "Audit logs and error records are retained for a limited period for security and diagnostic purposes.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "You can access, correct, export or delete your data from within the application, or by contacting us. Where a legal basis of consent applies — for example marketing email — you can withdraw it at any time without affecting your use of the service.",
    ],
  },
  {
    heading: "Cookies",
    body: [
      "We use only the cookies required to keep you signed in and to remember your theme preference. We do not use advertising cookies and we do not sell personal data.",
    ],
  },
  {
    heading: "Changes to this policy",
    body: [
      "If we make a material change we will update the effective date above and notify account holders in the application before the change takes effect.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Privacy Policy", path: "/privacy" },
        ])}
      />

      <Section>
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
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
