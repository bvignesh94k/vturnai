# V Turn AI

**Be Found. Be Cited. Be Chosen.**

A visibility intelligence platform for SEO, AEO, GEO and HEO. V Turn AI crawls a
website, audits it against search and answer-engine practice, measures whether
AI answer engines mention, cite and recommend the brand, and turns everything it
finds into a ranked list of actions. 

Production domain: `https://vturnai.com

---

## Contents

1. [Product overview](#product-overview)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Supabase setup](#supabase-setup)
5. [Database migrations](#database-migrations)
6. [Razorpay setup](#razorpay-setup)
7. [AI provider setup](#ai-provider-setup)
8. [Google OAuth setup](#google-oauth-setup)
9. [Bing setup](#bing-setup)
10. [Environment variables](#environment-variables)
11. [Local development](#local-development)
12. [Testing](#testing)
13. [Production deployment](#production-deployment)
14. [Cron setup](#cron-setup)
15. [Security considerations](#security-considerations)
16. [Provider limitations](#provider-limitations)

---

## Product overview

### The four disciplines

| Discipline | Full name | What it measures | Weight in the V Score |
| --- | --- | --- | --- |
| **SEO** | Search Engine Optimization | Whether classic search engines can crawl, understand and rank the site | 30% |
| **AEO** | Answer Engine Optimization | Whether a page has a passage worth quoting as a direct answer | 20% |
| **GEO** | Generative Engine Optimization | Whether a generative engine can understand, trust and cite the brand | 35% |
| **Experience & Authority** | — | Whether identifiable experts stand behind the content | 15% |

**HEO** (Hybrid Engine Optimization) is the unified score across all four. It is
surfaced in the product as the **V Score**. The weights live in exactly one
place — `src/lib/config/scoring.ts` — and the score card renders its breakdown
from the same object the calculation uses, so what a user reads is provably what
was computed.

### What the product does

- **Crawls** up to 500 URLs: robots.txt, sitemap discovery and parsing, internal
  link following, controlled concurrency, retries, crawl-delay compliance.
- **Extracts** everything an analyzer needs in one pass: metadata, headings,
  question headings, structured data, Open Graph, links, images, FAQs, tables,
  authors, dates, statistics and definition sentences.
- **Audits** for HTTP errors, redirect chains, metadata problems, heading
  problems, canonical conflicts, thin content, broken internal links, orphan
  pages, HTTPS and mixed content, sitemap inconsistency and blocked AI crawlers.
- **Scores** every page for AEO, GEO and Citation Readiness.
- **Analyses the brand as an entity**, flagging contradictions between pages —
  two founding years, two phone numbers, two company names.
- **Measures AI visibility** by sending tracked prompts to each engine's official
  developer API and analysing the answers.
- **Prioritises** every finding into one ranked action list.
- **Reports** in a print-friendly format that states its data sources.

### Honesty guarantees

These are enforced in code, not just documented:

- Every AI measurement is stamped with the engine, model, execution date and
  observation mode (`direct_observation`, `api_observation`, `estimated` or
  `unavailable`).
- A provider with no authorised connection reports **unavailable** and stores no
  rows. Copilot in particular shows "Copilot connection unavailable" rather than
  a fabricated figure, and the consumer Copilot site is never scraped.
- Failed provider calls are stored with `is_valid = false` and excluded from both
  the numerator and the denominator of every rate, so an outage can never look
  like a visibility collapse.
- One engine failing never fails a scan: the UI reports "4 of 5 engines
  completed".
- Nothing in the product guarantees a ranking, mention or citation.

---

## Architecture

```
src/
  app/
    (marketing)/          Public site: /, /features, /ai-visibility, /seo-audit,
                          /pricing, /about, /privacy, /terms
    (auth)/               /login, /signup + auth Server Actions
    onboarding/           Five-step wizard + "Building your visibility profile…"
    app/                  The authenticated application (collapsible sidebar)
    admin/                Platform admin, role gated
    api/                  Route handlers: cron, webhooks, OAuth callbacks,
                          public visibility check, content analysis
  components/
    ui/                   shadcn-style primitives
    app/                  Dashboard building blocks (score ring, KPI card,
                          engine grid, issue list, breakdowns)
    charts/               Recharts client components
    marketing/            Public site sections
  lib/
    config/               Plans, scoring weights, engines, metric explanations,
                          navigation, structured data
    supabase/             Browser, server (SSR) and service-role clients
    crawler/              URL rules, fetcher, robots, sitemap, extractor, engine
    analysis/             SEO, AEO, GEO, citation readiness, entity, quick check
    ai-engines/           Provider adapters + registry
    metrics/              Scores, AI visibility metrics, detection, usage,
                          opportunity priority
    jobs/                 Queue, runner and handlers
    integrations/         Search Console, Bing, GA4, PageSpeed, credentials
    billing/              Razorpay, subscriptions, entitlements, usage
    security/             SSRF, encryption, rate limiting
    validation/           Zod schemas for every server input
supabase/migrations/      SQL schema, functions and RLS policies
tests/                    Vitest suites
```

### Key design decisions

**Business logic lives in `src/lib`, never in components.** React components
render; services decide. This is what makes the analyzers unit-testable without
a browser or a database.

**Everything runs in small batches.** A 500-page crawl is many short job
invocations, not one long request. Handlers process a slice, persist progress and
re-queue themselves, so nothing approaches a serverless function timeout.

**Jobs are idempotent.** `jobs.idempotency_key` is unique, page writes upsert on
`(crawl_id, url_hash)`, and webhook events are keyed by `provider_event_id`. A
retry after a partial failure cannot double-count usage or duplicate rows.

**Entitlements are always server-side.** `getEntitlements()` reads from the
database via the service-role client. The browser's opinion of subscription
status is never consulted for anything.

**AI scans only run from an explicit scan job.** No page render, refresh or
navigation can trigger a paid provider call.

---

## Installation

Requires **Node.js 20.9+** (developed against 24 LTS) and npm.

```bash
npm install
cp .env.example .env.local
```

Then fill in `.env.local` following the sections below. The app runs with only
the Supabase variables set; every other integration degrades to a clearly
labelled "configuration required" state rather than failing.

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. From **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server only** — this
     key bypasses Row Level Security and must never reach the browser)
3. Under **Authentication → URL Configuration**, set:
   - Site URL: `http://localhost:3000` in development, `https://vturnai.com` in
     production
   - Redirect URLs: add `http://localhost:3000/api/auth/callback` and
     `https://vturnai.com/api/auth/callback`
4. Under **Authentication → Providers**, enable Email. Decide whether to require
   email confirmation — the sign-up flow handles both cases.

---

## Database migrations

Three migrations, applied in order:

| File | Contents |
| --- | --- |
| `20260101000000_core_schema.sql` | Enums, tables, indexes, triggers, seed plan |
| `20260101000001_functions.sql` | Membership helpers, new-user bootstrap, job queue RPCs, rate limiting, usage aggregation |
| `20260101000002_rls.sql` | Row Level Security policies and grants |

**With the Supabase CLI:**

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
```

**Without the CLI:** open the SQL editor in the Supabase dashboard and run the
three files in filename order.

After migrating, make yourself a platform admin:

```sql
update public.profiles set platform_role = 'admin' where email = 'you@example.com';
```

### Regenerating types

`src/lib/db/types.ts` is hand-maintained to match the migrations and is checked
in so the project type-checks without a live database. To regenerate:

```bash
npx supabase gen types typescript --project-id your-project-ref > src/lib/db/types.ts
```

---

## Razorpay setup

1. Create an account at [razorpay.com](https://razorpay.com) and complete KYC.
2. **Settings → API Keys**: generate a key pair.
   - Key ID → `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`
   - Key Secret → `RAZORPAY_KEY_SECRET` (**server only**)
3. **Subscriptions → Plans**: create a plan.
   - Billing frequency: Monthly
   - Amount: **₹499** (entered as `49900` paise)
   - Copy the plan id (`plan_...`) → `RAZORPAY_PRO_PLAN_ID`
4. **Settings → Webhooks**: add a webhook.
   - URL: `https://vturnai.com/api/webhooks/razorpay`
   - Secret → `RAZORPAY_WEBHOOK_SECRET`
   - Events: `subscription.authenticated`, `subscription.activated`,
     `subscription.charged`, `subscription.pending`, `subscription.halted`,
     `subscription.paused`, `subscription.resumed`, `subscription.cancelled`,
     `subscription.completed`, `payment.failed`

### How the trial works

The 7-day trial is implemented as a future `start_at` on the Razorpay
subscription. The payment mandate is registered when the user authorises
checkout; the first charge happens when the trial ends. Cancelling before then
costs the customer nothing.

Plan limits and pricing can be changed at runtime from `plan_configurations`
without a code deploy. Invalid or negative overrides fall back to the compiled
defaults, so a bad admin edit cannot unlock unlimited spend.

---

## AI provider setup

Each provider is optional and configured at the deployment level, so no customer
ever handles a provider secret. A missing key means that engine reports as
unavailable — never estimated.

| Engine | Variable | Where to get it | API used |
| --- | --- | --- | --- |
| ChatGPT | `OPENAI_API_KEY` | platform.openai.com | Responses API with web search |
| Gemini | `GOOGLE_GEMINI_API_KEY` | aistudio.google.com | Gemini API with Google Search grounding |
| Claude | `ANTHROPIC_API_KEY` | console.anthropic.com | Messages API with the web search tool |
| Perplexity | `PERPLEXITY_API_KEY` | perplexity.ai/settings/api | Sonar |
| Grok | `XAI_API_KEY` | console.x.ai | Chat completions with live search |
| Copilot | `MICROSOFT_*` + `COPILOT_PROVIDER_ENABLED` | Entra ID app registration | Microsoft 365 Copilot Chat |

Model ids default to sensible current values and can be overridden with
`OPENAI_MODEL`, `GOOGLE_GEMINI_MODEL`, `ANTHROPIC_MODEL`, `PERPLEXITY_MODEL` and
`XAI_MODEL`. If a provider rejects the default model, set the override rather
than editing code.

### Cost protection

- Prompts are de-duplicated per engine within a 20-hour window.
- Quotas are checked before every provider call and re-checked per prompt during
  a scan, so a long scan cannot overshoot the plan.
- Output tokens are capped and every request has a timeout.
- Scans run only from an explicit job, never from a page render.
- Estimated spend is logged per call and shown in `/admin`.

---

## Google OAuth setup

Used for Search Console and, optionally, Analytics 4.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. Enable the **Search Console API** and, if using GA4, the **Google Analytics
   Data API**.
3. **APIs & Services → OAuth consent screen**: configure it and add the scopes
   `webmasters.readonly` and (optionally) `analytics.readonly`.
4. **Credentials → Create OAuth client ID → Web application**. Add redirect URIs:
   - `http://localhost:3000/api/integrations/google/callback`
   - `https://vturnai.com/api/integrations/google/callback`
   - the `/api/integrations/google-analytics/callback` equivalents if using GA4
5. Copy the client id and secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.
6. For PageSpeed Insights, create an **API key** under Credentials and set
   `GOOGLE_PAGESPEED_API_KEY`.

Refresh tokens are encrypted with AES-256-GCM before storage and are never
returned to the browser.

---

## Bing setup

1. Verify the site in [Bing Webmaster Tools](https://www.bing.com/webmasters).
2. **Settings → API access → API key**: generate a key.
3. Either set `BING_WEBMASTER_API_KEY` for the whole deployment, or let each
   user paste their own key under Integrations — a per-project key wins over the
   deployment key, and is encrypted before storage.

---

## Environment variables

See `.env.example` for the complete, commented list. The critical distinction:

**Browser-exposed (safe):** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`.

**Server only (never expose):** `SUPABASE_SERVICE_ROLE_KEY`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, every AI provider key,
`GOOGLE_CLIENT_SECRET`, `BING_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`,
`CRON_SECRET`, `ENCRYPTION_KEY`.

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Rotating `ENCRYPTION_KEY` invalidates every stored provider token. Users will be
asked to reconnect their integrations rather than being told they are connected
when they are not.

---

## Local development

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # next typegen && tsc --noEmit
npm run lint         # eslint
npm run test         # vitest run
npm run build        # production build
npm run verify       # all four, in order
```

Without a cron scheduler, the job queue still advances: the scan status endpoint
processes one job per poll, so a user watching their own scan keeps it moving.
You can also process the queue manually with the "run queued jobs" action.

---

## Testing

```bash
npm run test
```

Ten suites, 235 tests, no database or network required:

| Suite | Covers |
| --- | --- |
| `url.test.ts` | URL normalization, same-site rules, crawl eligibility, link resolution |
| `ssrf.test.ts` | Private range detection, blocked hostnames, scheme and port rules |
| `robots.test.ts` | robots.txt parsing, longest-match Allow/Disallow, AI crawler detection, crawl delay |
| `detection.test.ts` | Brand mention, domain citation, recommendation, sentiment, competitor detection |
| `metrics.test.ts` | Every AI visibility metric, including invalid-run exclusion |
| `scores.test.ts` | Weight integrity, score composition, HEO weighting, opportunity priority |
| `usage-limits.test.ts` | Plan limits, admin overrides, quota decisions, threshold crossing |
| `billing.test.ts` | Razorpay webhook and checkout signature verification, status mapping |
| `ai-normalization.test.ts` | Every provider's response parser, provider status, dedupe keys |
| `rls-assumptions.test.ts` | RLS enabled on every table, credential table denied to clients, derived tables read-only |

---

## Production deployment

### Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Add every variable from `.env.example` under **Settings → Environment
   Variables**. Mark the server-only ones as such.
3. Set `NEXT_PUBLIC_APP_URL=https://vturnai.com`.
4. Deploy. `vercel.json` registers both cron schedules automatically.

### Custom domain

1. **Settings → Domains**: add `vturnai.com` and `www.vturnai.com`.
2. Point DNS at Vercel (`A` to `76.76.21.21`, or the `CNAME` Vercel shows).
3. `www` → apex redirection is handled in `next.config.ts`, so the canonical
   host is always `https://vturnai.com`.
4. Update the Supabase redirect URLs, Google OAuth redirect URIs and the
   Razorpay webhook URL to the production domain.

### Post-deploy checklist

- [ ] Sign up, confirm email, complete onboarding, watch the initial scan finish
- [ ] Confirm `/robots.txt` and `/sitemap.xml` resolve
- [ ] Send a Razorpay test webhook and confirm it is accepted
- [ ] Connect Search Console and run a sync
- [ ] Confirm `/admin` is unreachable for a non-admin account
- [ ] Confirm an unconfigured engine shows "not connected", not a zero

---

## Cron setup

Two schedules, both authenticated with `CRON_SECRET` compared in constant time:

| Endpoint | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/process-jobs` | every 5 minutes | Claims and runs a batch of queued jobs |
| `/api/cron/daily` | 02:15 daily | Expires lapsed trials, warns before expiry, schedules recurring AI scans, refreshes connected sources, raises visibility-drop alerts |

Vercel Cron sends the secret automatically. For an external scheduler:

```bash
curl -X POST https://vturnai.com/api/cron/process-jobs \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Security considerations

**Row Level Security** is enabled on every table. Users see only organizations
they are members of, and only those organizations' projects. Derived analysis
tables are read-only to clients — a compromised browser session cannot fabricate
visibility data. `integration_credentials` has RLS enabled and *no policy at
all*, which denies it to every browser-facing role.

**Credential encryption.** OAuth tokens and third-party API keys are encrypted
with AES-256-GCM before storage. No API response ever returns a stored token.

**SSRF protection.** The crawler accepts URLs a user typed, so every outbound
fetch is guarded: non-http schemes, credentials in the URL and non-standard
ports are rejected; DNS is resolved and every returned address checked against
private, loopback, link-local, carrier-grade NAT and cloud metadata ranges; and
each redirect hop is revalidated, so an open redirect on a public site cannot be
used to reach internal infrastructure.

**Input validation.** Every server input passes through a Zod schema before it
reaches a database write or an outbound fetch.

**Webhook verification.** Razorpay webhooks are verified by HMAC-SHA256 over the
raw request body. Event ids are stored under a unique constraint, so a replayed
delivery is discarded rather than applied twice.

**Rate limiting.** Expensive operations are limited per project or per IP, backed
by a database counter so limits hold across serverless instances.

**Auth.** Sessions are validated with `getUser()`, which revalidates the JWT with
the auth server rather than trusting a cookie. Sign-in failures return a
deliberately generic message so the endpoint cannot be used to enumerate
registered addresses.

**Crawler etiquette.** The crawler identifies itself honestly as `VTurnAIBot`,
respects robots.txt by default, honours crawl-delay, caps response size and
never submits forms or authenticates.

---

## Provider limitations

Worth understanding before interpreting any number:

**API observations are not consumer product readings.** ChatGPT, Gemini, Claude,
Perplexity and Grok all expose developer APIs that may use different models,
retrieval or personalisation from their consumer apps. V Turn AI labels every
measurement accordingly and never presents an API result as a guaranteed
consumer ranking.

**Microsoft Copilot has no public consumer API.** V Turn AI supports the
Microsoft 365 Copilot Chat API for tenants that have it, and shows "Copilot
connection unavailable" otherwise. It does not scrape the consumer Copilot site.

**Answers vary between runs.** Visibility is a rate measured across many prompts
over time, not a single observation. A one-off check proves nothing.

**Search Console data lags.** Data is final only after roughly two days, so the
sync window deliberately ends three days back to avoid storing partial rows that
would later look like a traffic drop.

**GA4 sees only clicks that happened.** Most AI visibility is zero-click, so the
AI Referral Traffic report is a floor on AI impact, never a measure of it. The
product says so wherever that number appears.

**No outcome is guaranteed.** Scores are analytical opinions derived from
published methodology. Nothing in the product promises a ranking, mention or
citation.

---

## Independence

V Turn AI is an independent product. It is not affiliated with, endorsed by, or
sponsored by OpenAI, Google, Anthropic, Perplexity, xAI or Microsoft. Their names
and marks belong to them and are used only to identify the services measured
through their public developer APIs.
