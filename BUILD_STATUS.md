# Build Status

Last updated: 19 August 2026

**Verification:** `npm run verify`, TypeScript ✅ · ESLint ✅ · 235 tests ✅ ·
production build ✅ (39 routes)

---

## Completed

### Foundation
- Next.js 16 App Router, React 19, TypeScript 6 (strict), Tailwind CSS 4
- shadcn/ui-style primitives built on Radix, hand-written rather than CLI-generated
- Design system with light and dark themes, deep indigo/violet primary and
  electric cyan accent, defined as CSS custom properties so charts and SVG stay
  correct in both themes
- ESLint with `no-explicit-any` as an error; zero warnings across the codebase
- Vitest with path aliases and a `server-only` stub

### Database
- 3 SQL migrations: schema, functions, RLS
- 34 tables, UUID primary keys, foreign keys, indexes, `created_at`/`updated_at`
- 19 enums covering every state machine in the product
- Row Level Security on every table; `integration_credentials` and
  `rate_limit_counters` have RLS enabled and no policies, denying them to all
  client roles
- `SECURITY DEFINER` membership helpers with pinned `search_path`, so policies
  cannot recurse and cannot be privilege-escalated
- New-user bootstrap trigger creating profile, organization and membership
- Atomic job-claim RPC using `FOR UPDATE SKIP LOCKED`
- Hand-maintained typed database access checked in, so the project type-checks
  without a live database

### Core libraries
- Scoring configuration with runtime assertions that every weight group sums to 1
- HEO weighting (SEO 30 / AEO 20 / GEO 35 / Experience & Authority 15) defined
  once and rendered from the same object the calculation uses
- All seven AI visibility metrics, with invalid runs excluded from both numerator
  and denominator
- Brand, domain, recommendation, sentiment and competitor detection with
  conservative word-boundary matching and negation handling
- Opportunity priority formula with weight renormalisation when data is missing
- SSRF guard, AES-256-GCM credential encryption, database-backed rate limiting
- Structured logger with automatic secret redaction
- Zod schemas for every server input

### Crawler and analysis
- Guarded fetcher: SSRF-checked at every redirect hop, hard timeout, response
  size cap, bounded redirect chain
- robots.txt parser with longest-match Allow/Disallow, wildcard and `$` anchoring
- AI crawler detection across 12 known agents
- Sitemap discovery including index documents, with bounded traversal
- Page extractor covering every field the analyzers need in one pass
- SEO analyzer producing 18 issue types across a whole crawl
- AEO analyzer scoring 15 factors per page
- GEO analyzer scoring 14 factors per page
- Citation readiness scoring 13 factors per page
- Entity analysis with contradiction detection across pages
- Free single-page visibility check for the public site

### AI engines
- `AIVisibilityProvider` interface with a normalised `AIVisibilityResult`
- OpenAI (Responses API + web search), Gemini (Search grounding), Anthropic (web
  search tool), Perplexity (Sonar), xAI Grok (live search)
- Microsoft Copilot adapter gated behind licensing and a feature flag; reports
  "Copilot connection unavailable" and never fabricates data
- Registry with per-engine failure isolation and "N of M engines completed"
- Prompt suggestion generation from site content, services, headings, Search
  Console queries and competitors

### Background jobs
- Database-backed queue with idempotency keys, retries, progress and safe release
- Handlers: `initial_scan`, `website_crawl`, `page_analysis`,
  `ai_visibility_scan`, `opportunity_generation`, `report_generation`,
  `search_console_sync`, `bing_sync`, `analytics_sync`, `pagespeed_scan`
- Every long-running handler processes a bounded batch and re-queues itself
- Two cron endpoints protected by `CRON_SECRET` in constant-time comparison

### Integrations
- Google Search Console OAuth with state nonce verification, metric sync and
  derived insights (striking distance, low-CTR pages, question queries, decline)
- Bing Webmaster Tools with per-project or deployment-level API key
- Google Analytics 4 with AI referral traffic classification across 16 assistants
- PageSpeed Insights with deliberate target selection to stay inside quota

### Billing
- Razorpay Subscriptions with a 7-day trial implemented as a future `start_at`
- Webhook receiver verifying HMAC over the raw body, with replay protection
- Checkout signature verification followed by a server-to-server re-read
- Full lifecycle: created, authenticated, trialing, active, past due, halted,
  paused, cancelled, expired
- Entitlements resolved server-side on every metered action
- Usage tracking with 80% and 100% threshold notifications
- Plan limits and pricing overridable from `plan_configurations` at runtime

### Public website
- `/`, `/features`, `/ai-visibility`, `/seo-audit`, `/pricing`, `/about`,
  `/privacy`, `/terms`
- Working free visibility check, rate limited and SSRF guarded
- Organization, WebSite, SoftwareApplication, BreadcrumbList and FAQPage JSON-LD
  built only from questions actually rendered on the page
- Sitemap, robots.txt permitting AI crawlers, canonical tags, Open Graph
- Engine identification by neutral monogram tiles, with an explicit
  non-affiliation statement in the footer and in the terms

### Application
- Collapsible sidebar with project selector at top and account controls at bottom
- Overview dashboard answering all five product questions
- AI Visibility, Prompt Tracker, Website Audit, AEO Analyzer, GEO Analyzer,
  Competitors, Content Optimizer, Opportunities, Reports, Integrations, Billing,
  Settings
- Role-gated `/admin` with users, subscriptions, usage, AI spend, failed jobs,
  provider status, plan configuration and system errors
- Five-step onboarding wizard with live "Building your visibility profile…"
- Every metric carries a four-part tooltip: what it means, why it matters, how it
  is calculated, how to improve it
- Purposeful empty states with a real next action on every surface
- In-app notifications; email is optional and degrades cleanly when unconfigured

### Testing
- 235 tests across 10 suites, no database or network required
- Includes the RLS structural assumptions the application depends on

---

## In progress

Nothing. The scope described above is complete and verified.

---

## Pending

Work that was deliberately left out of this build rather than started:

- **PDF export.** Reports are print-friendly HTML today, and the browser's
  "Save as PDF" produces the deliverable. The report data is a structured payload
  separate from its rendering, so a server-side renderer can be added without
  touching data collection.
- **Public API.** `apiAccess` exists as a plan feature flag and is off.
- **Multi-seat workspaces.** The schema supports organizations, members and four
  roles; the invite flow UI is not built.
- **X (Twitter) search for Grok.** The adapter restricts sources to the web,
  because a post is not a citable page and mixing the two would distort citation
  counts.
- **URL Inspection API.** Search Console performance data is synced; per-URL
  inspection is not.

---

## Known limitations

**Setup required before the product does anything.** Supabase must be configured
and migrated. Every other integration is optional and reports "configuration
required" rather than failing.

**Model ids may drift.** Provider default model names are current at time of
writing and overridable by environment variable. If a provider rejects the
default, set the override rather than editing code.

**API observations are not consumer readings.** Developer APIs can differ from
consumer products in model, retrieval and personalisation. Every measurement is
labelled accordingly.

**Sentiment analysis is lexicon-based.** Deliberately simple and transparent
rather than a model call producing a confident-sounding guess. It reports
"neutral" when it cannot tell.

**Entity extraction is pattern-based.** It reliably catches contradictions in
founding year, company name, phone numbers and scale claims. It will not catch
every possible inconsistency.

**Redirect chain detection depends on the fetch.** Chains are recorded as
followed during the crawl; historical redirect data is not reconstructed.

**Search Console lag is real.** The sync window ends three days back so partial
data never looks like a traffic drop.

**GA4 measures clicks, not visibility.** Most AI visibility is zero-click. The
AI Referral Traffic report states this wherever it appears.

**Insert types are partially permissive.** A handful of write-heavy tables use
`Partial<Row>` inserts in `src/lib/db/types.ts`, relying on database NOT NULL
constraints and Zod validation at the API boundary. Regenerating with
`supabase gen types` tightens these.

**Node.js was not installed on the build machine.** A portable Node 24 LTS
runtime was placed in `~/.local/node` to run the toolchain. Add it to `PATH`, or
install Node normally, before running npm scripts:

```bash
export PATH="$HOME/.local/node/node-v24.19.0-win-x64:$PATH"
```
