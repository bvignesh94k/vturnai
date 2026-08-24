-- ============================================================================
-- V Turn AI: core schema
--
-- Conventions used throughout:
--   * UUID primary keys, generated with gen_random_uuid()
--   * every table carries created_at, and updated_at where rows mutate
--   * jsonb is used only for genuinely provider-shaped payloads (raw API
--     responses, Lighthouse audits, structured-data blobs). Everything the
--     product queries, filters or aggregates on is a real column.
--   * money is stored in the smallest currency unit (paise) as bigint
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

create type public.platform_role as enum ('user', 'admin');

create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');

create type public.subscription_status as enum (
  'created',
  'authenticated',
  'trialing',
  'active',
  'past_due',
  'halted',
  'paused',
  'cancelled',
  'expired'
);

create type public.crawl_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');

create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');

create type public.job_type as enum (
  'initial_scan',
  'website_crawl',
  'page_analysis',
  'ai_visibility_scan',
  'search_console_sync',
  'bing_sync',
  'analytics_sync',
  'pagespeed_scan',
  'opportunity_generation',
  'report_generation',
  'entity_analysis'
);

create type public.issue_severity as enum ('critical', 'high', 'medium', 'low', 'information');

create type public.effort_level as enum ('easy', 'moderate', 'advanced');

create type public.discipline as enum ('seo', 'aeo', 'geo', 'heo');

create type public.opportunity_status as enum ('open', 'in_progress', 'completed', 'ignored');

create type public.engine_id as enum ('openai', 'gemini', 'anthropic', 'perplexity', 'grok', 'copilot');

create type public.sentiment as enum ('positive', 'neutral', 'negative', 'mixed', 'unknown');

create type public.observation_mode as enum (
  'direct_observation',
  'api_observation',
  'estimated',
  'unavailable'
);

create type public.prompt_group as enum (
  'awareness',
  'problem',
  'solution',
  'comparison',
  'alternative',
  'recommendation',
  'commercial',
  'transactional',
  'local',
  'brand'
);

create type public.integration_provider as enum (
  'google_search_console',
  'google_analytics',
  'bing_webmaster',
  'pagespeed',
  'openai',
  'gemini',
  'anthropic',
  'perplexity',
  'xai',
  'microsoft_copilot'
);

create type public.integration_status as enum (
  'connected',
  'not_connected',
  'configuration_required',
  'error'
);

create type public.usage_metric as enum (
  'pages_crawled',
  'ai_prompt_executions',
  'ai_engine_executions',
  'pagespeed_checks',
  'reports_generated',
  'manual_scans',
  'website_audits'
);

create type public.notification_type as enum (
  'audit_complete',
  'ai_scan_complete',
  'visibility_drop',
  'critical_issue',
  'trial_ending',
  'payment_failed',
  'report_ready',
  'usage_warning',
  'job_failed'
);

create type public.report_status as enum ('queued', 'generating', 'ready', 'failed');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  platform_role public.platform_role not null default 'user',
  marketing_opt_in boolean not null default false,
  onboarding_completed_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  billing_email text,
  country_code text not null default 'IN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_owner_id_idx on public.organizations (owner_id);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'member',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_organization_id_idx on public.organization_members (organization_id);

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  name text not null,
  site_url text not null,
  domain text not null,
  brand_name text not null,
  brand_aliases text[] not null default '{}',
  business_category text,
  business_description text,
  target_country text not null default 'IN',
  target_audience text,
  primary_language text not null default 'en',
  onboarding_step smallint not null default 1,
  onboarding_completed_at timestamptz,
  initial_scan_completed_at timestamptz,
  last_crawl_at timestamptz,
  last_ai_scan_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_domain_not_blank check (length(trim(domain)) > 0)
);

create index projects_organization_id_idx on public.projects (organization_id);
create unique index projects_org_domain_key on public.projects (organization_id, domain);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_settings (
  project_id uuid primary key references public.projects (id) on delete cascade,
  max_crawl_urls integer not null default 500,
  crawl_delay_ms integer not null default 400,
  crawl_concurrency smallint not null default 4,
  respect_robots boolean not null default true,
  include_subdomains boolean not null default false,
  ai_scan_schedule text not null default 'monthly',
  notification_email boolean not null default true,
  notification_in_app boolean not null default true,
  excluded_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger project_settings_set_updated_at
  before update on public.project_settings
  for each row execute function public.set_updated_at();

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  brand_name text not null,
  domain text,
  site_url text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, brand_name)
);

create index competitors_project_id_idx on public.competitors (project_id);

create trigger competitors_set_updated_at
  before update on public.competitors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------

create table public.plan_configurations (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique,
  display_name text not null,
  price_minor bigint not null,
  currency text not null default 'INR',
  trial_days smallint not null default 7,
  razorpay_plan_id text,
  -- Limit and feature overrides merged on top of the compiled defaults.
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plan_configurations_set_updated_at
  before update on public.plan_configurations
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_code text not null default 'pro',
  status public.subscription_status not null default 'created',
  razorpay_subscription_id text unique,
  razorpay_customer_id text,
  razorpay_plan_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  cancelled_at timestamptz,
  ended_at timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Server-verified. Never written from a browser-supplied value.
  last_verified_at timestamptz,
  short_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index subscriptions_active_org_key
  on public.subscriptions (organization_id)
  where status in ('created', 'authenticated', 'trialing', 'active', 'past_due', 'paused');

create index subscriptions_organization_id_idx on public.subscriptions (organization_id);
create index subscriptions_status_idx on public.subscriptions (status);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  event_type text not null,
  -- Razorpay's event id. Unique so webhook replays are idempotent.
  provider_event_id text unique,
  amount_minor bigint,
  currency text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index billing_events_organization_id_idx on public.billing_events (organization_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Crawling
-- ---------------------------------------------------------------------------

create table public.crawls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  triggered_by uuid references public.profiles (id) on delete set null,
  status public.crawl_status not null default 'queued',
  trigger_source text not null default 'manual',
  max_urls integer not null default 500,
  urls_discovered integer not null default 0,
  urls_crawled integer not null default 0,
  urls_failed integer not null default 0,
  robots_txt_found boolean,
  robots_txt_content text,
  sitemap_urls text[] not null default '{}',
  sitemap_url_count integer not null default 0,
  ai_crawlers_blocked text[] not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crawls_project_id_idx on public.crawls (project_id, created_at desc);
create index crawls_status_idx on public.crawls (status);

create trigger crawls_set_updated_at
  before update on public.crawls
  for each row execute function public.set_updated_at();

create table public.crawl_pages (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references public.crawls (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  url text not null,
  url_hash text not null,
  depth smallint not null default 0,
  http_status integer,
  content_type text,
  response_time_ms integer,
  redirected_to text,
  redirect_chain text[] not null default '{}',
  fetch_error text,

  title text,
  title_length integer,
  meta_description text,
  meta_description_length integer,
  canonical_url text,
  robots_meta text,
  is_indexable boolean,
  noindex boolean not null default false,
  nofollow boolean not null default false,

  h1 text[] not null default '{}',
  h2 text[] not null default '{}',
  h3 text[] not null default '{}',
  question_headings text[] not null default '{}',

  word_count integer not null default 0,
  language text,
  content_text text,
  direct_answer_paragraphs text[] not null default '{}',

  open_graph jsonb not null default '{}'::jsonb,
  twitter_card jsonb not null default '{}'::jsonb,
  structured_data jsonb not null default '[]'::jsonb,
  schema_types text[] not null default '{}',

  image_count integer not null default 0,
  images_missing_alt integer not null default 0,
  internal_link_count integer not null default 0,
  external_link_count integer not null default 0,
  nofollow_link_count integer not null default 0,

  has_faq_content boolean not null default false,
  faq_pairs jsonb not null default '[]'::jsonb,
  table_count integer not null default 0,
  list_count integer not null default 0,
  has_breadcrumbs boolean not null default false,

  author_name text,
  published_date timestamptz,
  modified_date timestamptz,

  content_classification text,
  is_https boolean not null default true,
  has_mixed_content boolean not null default false,

  crawled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (crawl_id, url_hash)
);

create index crawl_pages_project_id_idx on public.crawl_pages (project_id);
create index crawl_pages_crawl_id_idx on public.crawl_pages (crawl_id);
create index crawl_pages_url_idx on public.crawl_pages (project_id, url);
create index crawl_pages_status_idx on public.crawl_pages (crawl_id, http_status);

create table public.page_links (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references public.crawls (id) on delete cascade,
  source_page_id uuid not null references public.crawl_pages (id) on delete cascade,
  target_url text not null,
  target_page_id uuid references public.crawl_pages (id) on delete set null,
  anchor_text text,
  is_internal boolean not null,
  is_nofollow boolean not null default false,
  http_status integer,
  created_at timestamptz not null default now()
);

create index page_links_crawl_id_idx on public.page_links (crawl_id);
create index page_links_source_page_id_idx on public.page_links (source_page_id);
create index page_links_target_page_id_idx on public.page_links (target_page_id);

create table public.page_issues (
  id uuid primary key default gen_random_uuid(),
  crawl_id uuid not null references public.crawls (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  page_id uuid references public.crawl_pages (id) on delete cascade,
  issue_code text not null,
  title text not null,
  description text not null,
  severity public.issue_severity not null,
  disciplines public.discipline[] not null default '{}',
  why_it_matters text not null,
  seo_impact text,
  aeo_impact text,
  geo_impact text,
  recommendation text not null,
  implementation_example text,
  effort public.effort_level not null default 'moderate',
  affected_url text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index page_issues_crawl_id_idx on public.page_issues (crawl_id, severity);
create index page_issues_project_id_idx on public.page_issues (project_id);
create index page_issues_issue_code_idx on public.page_issues (crawl_id, issue_code);

create table public.page_scores (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.crawl_pages (id) on delete cascade,
  crawl_id uuid not null references public.crawls (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  seo_score numeric(5, 2) not null default 0,
  aeo_score numeric(5, 2) not null default 0,
  geo_score numeric(5, 2) not null default 0,
  experience_authority_score numeric(5, 2) not null default 0,
  heo_score numeric(5, 2) not null default 0,
  citation_readiness_score numeric(5, 2) not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (page_id)
);

create index page_scores_crawl_id_idx on public.page_scores (crawl_id);
create index page_scores_project_heo_idx on public.page_scores (project_id, heo_score);

create table public.project_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  crawl_id uuid references public.crawls (id) on delete set null,
  captured_at timestamptz not null default now(),
  v_score numeric(5, 2) not null default 0,
  seo_score numeric(5, 2) not null default 0,
  aeo_score numeric(5, 2) not null default 0,
  geo_score numeric(5, 2) not null default 0,
  experience_authority_score numeric(5, 2) not null default 0,
  heo_score numeric(5, 2) not null default 0,
  ai_visibility_score numeric(5, 2),
  mention_rate numeric(5, 2),
  citation_rate numeric(5, 2),
  recommendation_rate numeric(5, 2),
  share_of_voice numeric(5, 2),
  prompt_coverage numeric(5, 2),
  engine_consistency numeric(5, 2),
  citation_diversity integer,
  critical_issue_count integer not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index project_scores_project_captured_idx on public.project_scores (project_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Entity / brand understanding
-- ---------------------------------------------------------------------------

create table public.entity_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  crawl_id uuid references public.crawls (id) on delete set null,
  brand_name text,
  organization_name text,
  description text,
  category text,
  products text[] not null default '{}',
  services text[] not null default '{}',
  locations text[] not null default '{}',
  people jsonb not null default '[]'::jsonb,
  same_as_urls text[] not null default '{}',
  contact_email text,
  contact_phone text,
  contact_address text,
  primary_topics text[] not null default '{}',
  target_audience text,
  unique_selling_propositions text[] not null default '{}',
  structured_identity jsonb not null default '{}'::jsonb,
  consistency_score numeric(5, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create trigger entity_profiles_set_updated_at
  before update on public.entity_profiles
  for each row execute function public.set_updated_at();

create table public.entity_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  crawl_id uuid references public.crawls (id) on delete cascade,
  field text not null,
  severity public.issue_severity not null default 'medium',
  description text not null,
  -- Each conflicting value with the URL that stated it.
  conflicting_values jsonb not null default '[]'::jsonb,
  recommendation text not null,
  created_at timestamptz not null default now()
);

create index entity_issues_project_id_idx on public.entity_issues (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Prompts and AI visibility
-- ---------------------------------------------------------------------------

create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  prompt_text text not null,
  intent text,
  topic text,
  prompt_group public.prompt_group not null default 'awareness',
  country text not null default 'IN',
  language text not null default 'en',
  priority smallint not null default 3,
  is_active boolean not null default true,
  is_suggested boolean not null default false,
  suggestion_source text,
  last_run_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prompts_priority_range check (priority between 1 and 5),
  constraint prompts_text_not_blank check (length(trim(prompt_text)) > 3),
  -- Named constraint (not an expression index) so PostgREST upserts can target
  -- it with on_conflict=project_id,prompt_text.
  constraint prompts_project_text_key unique (project_id, prompt_text)
);

create index prompts_project_id_idx on public.prompts (project_id);
create index prompts_active_idx on public.prompts (project_id, is_active);

create trigger prompts_set_updated_at
  before update on public.prompts
  for each row execute function public.set_updated_at();

create table public.prompt_tags (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (prompt_id, tag)
);

create index prompt_tags_prompt_id_idx on public.prompt_tags (prompt_id);

create table public.ai_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  triggered_by uuid references public.profiles (id) on delete set null,
  trigger_source text not null default 'manual',
  status public.crawl_status not null default 'queued',
  engines public.engine_id[] not null default '{}',
  prompts_total integer not null default 0,
  prompts_completed integer not null default 0,
  runs_succeeded integer not null default 0,
  runs_failed integer not null default 0,
  engines_succeeded integer not null default 0,
  engines_attempted integer not null default 0,
  estimated_cost_usd numeric(10, 4) not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_scans_project_id_idx on public.ai_scans (project_id, created_at desc);

create trigger ai_scans_set_updated_at
  before update on public.ai_scans
  for each row execute function public.set_updated_at();

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  scan_id uuid references public.ai_scans (id) on delete cascade,
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  engine public.engine_id not null,
  model text not null,
  observation_mode public.observation_mode not null default 'api_observation',
  -- False when the provider errored, timed out or was skipped. Invalid runs are
  -- excluded from every rate calculation.
  is_valid boolean not null default true,
  failure_reason text,
  prompt_text text not null,
  answer text,
  brand_mentioned boolean not null default false,
  domain_cited boolean not null default false,
  recommended boolean not null default false,
  sentiment public.sentiment not null default 'unknown',
  citation_count integer not null default 0,
  brand_citation_count integer not null default 0,
  estimated_cost_usd numeric(10, 6),
  latency_ms integer,
  -- Hash of prompt + engine + brand + competitors, used to de-duplicate runs.
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb,
  executed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index ai_runs_project_executed_idx on public.ai_runs (project_id, executed_at desc);
create index ai_runs_scan_id_idx on public.ai_runs (scan_id);
create index ai_runs_prompt_id_idx on public.ai_runs (prompt_id);
create index ai_runs_engine_idx on public.ai_runs (project_id, engine, executed_at desc);
create index ai_runs_dedupe_idx on public.ai_runs (project_id, dedupe_key, executed_at desc);

create table public.ai_citations (
  id uuid primary key default gen_random_uuid(),
  ai_run_id uuid not null references public.ai_runs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  url text not null,
  domain text not null,
  title text,
  is_brand_domain boolean not null default false,
  is_competitor_domain boolean not null default false,
  position smallint,
  created_at timestamptz not null default now()
);

create index ai_citations_run_id_idx on public.ai_citations (ai_run_id);
create index ai_citations_project_domain_idx on public.ai_citations (project_id, domain);
create index ai_citations_brand_idx on public.ai_citations (project_id, is_brand_domain);

create table public.ai_competitor_mentions (
  id uuid primary key default gen_random_uuid(),
  ai_run_id uuid not null references public.ai_runs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  competitor_id uuid references public.competitors (id) on delete cascade,
  brand_name text not null,
  mentioned boolean not null default false,
  recommended boolean not null default false,
  created_at timestamptz not null default now()
);

create index ai_competitor_mentions_run_id_idx on public.ai_competitor_mentions (ai_run_id);
create index ai_competitor_mentions_project_idx on public.ai_competitor_mentions (project_id, brand_name);

-- ---------------------------------------------------------------------------
-- Integrations
-- ---------------------------------------------------------------------------

-- Encrypted credential storage. RLS denies every client role: only the service
-- role, used by server code holding ENCRYPTION_KEY, may read this table.
create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  provider public.integration_provider not null,
  -- AES-256-GCM envelope produced by src/lib/security/encryption.ts
  access_token_encrypted text,
  refresh_token_encrypted text,
  api_key_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  account_identifier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, project_id, provider)
);

create trigger integration_credentials_set_updated_at
  before update on public.integration_credentials
  for each row execute function public.set_updated_at();

-- Non-secret connection state, safe to read in the app.
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  provider public.integration_provider not null,
  status public.integration_status not null default 'not_connected',
  display_name text,
  account_identifier text,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, provider)
);

create index integration_connections_project_idx on public.integration_connections (project_id);

create trigger integration_connections_set_updated_at
  before update on public.integration_connections
  for each row execute function public.set_updated_at();

create table public.search_console_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  site_url text not null,
  permission_level text,
  is_verified boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create trigger search_console_connections_set_updated_at
  before update on public.search_console_connections
  for each row execute function public.set_updated_at();

create table public.search_console_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  date date not null,
  dimension text not null,
  dimension_value text not null,
  country text,
  device text,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric(6, 4) not null default 0,
  position numeric(6, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- Expression-based uniqueness: country and device are nullable, and in Postgres
-- NULLs would otherwise defeat a plain UNIQUE constraint and allow duplicates.
create unique index search_console_metrics_unique_idx
  on public.search_console_metrics (
    project_id, date, dimension, dimension_value,
    coalesce(country, ''), coalesce(device, '')
  );

create index search_console_metrics_project_date_idx
  on public.search_console_metrics (project_id, date desc);
create index search_console_metrics_dimension_idx
  on public.search_console_metrics (project_id, dimension, impressions desc);

create table public.bing_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  site_url text not null,
  is_verified boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create trigger bing_connections_set_updated_at
  before update on public.bing_connections
  for each row execute function public.set_updated_at();

create table public.bing_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  date date not null,
  dimension text not null,
  dimension_value text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  position numeric(6, 2),
  crawled_pages integer,
  indexed_pages integer,
  inbound_links integer,
  created_at timestamptz not null default now(),
  unique (project_id, date, dimension, dimension_value)
);

create index bing_metrics_project_date_idx on public.bing_metrics (project_id, date desc);

create table public.analytics_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  property_id text not null,
  property_name text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

create trigger analytics_connections_set_updated_at
  before update on public.analytics_connections
  for each row execute function public.set_updated_at();

create table public.analytics_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  date date not null,
  dimension text not null,
  dimension_value text not null,
  sessions integer not null default 0,
  engaged_sessions integer not null default 0,
  conversions numeric(12, 2) not null default 0,
  -- True when the referrer is a recognisable AI assistant or answer engine.
  is_ai_referral boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, date, dimension, dimension_value)
);

create index analytics_metrics_project_date_idx on public.analytics_metrics (project_id, date desc);
create index analytics_metrics_ai_referral_idx on public.analytics_metrics (project_id, is_ai_referral);

create table public.pagespeed_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_id uuid references public.crawl_pages (id) on delete set null,
  url text not null,
  strategy text not null check (strategy in ('mobile', 'desktop')),
  performance_score numeric(5, 2),
  accessibility_score numeric(5, 2),
  best_practices_score numeric(5, 2),
  seo_score numeric(5, 2),
  lcp_ms integer,
  cls numeric(6, 3),
  inp_ms integer,
  fcp_ms integer,
  ttfb_ms integer,
  speed_index_ms integer,
  total_blocking_time_ms integer,
  opportunities jsonb not null default '[]'::jsonb,
  raw_lighthouse jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index pagespeed_runs_project_idx on public.pagespeed_runs (project_id, fetched_at desc);
create index pagespeed_runs_url_idx on public.pagespeed_runs (project_id, url, strategy, fetched_at desc);

-- ---------------------------------------------------------------------------
-- Opportunities and reports
-- ---------------------------------------------------------------------------

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  crawl_id uuid references public.crawls (id) on delete set null,
  source_key text not null,
  title text not null,
  opportunity_type text not null,
  disciplines public.discipline[] not null default '{}',
  severity public.issue_severity not null default 'medium',
  expected_impact text not null,
  effort public.effort_level not null default 'moderate',
  priority_score numeric(5, 2) not null default 0,
  priority_breakdown jsonb not null default '{}'::jsonb,
  affected_urls text[] not null default '{}',
  affected_page_count integer not null default 0,
  explanation text not null,
  recommendation text not null,
  implementation_guidance text,
  status public.opportunity_status not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, source_key)
);

create index opportunities_project_priority_idx
  on public.opportunities (project_id, status, priority_score desc);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null,
  report_type text not null default 'full',
  status public.report_status not null default 'queued',
  period_start date,
  period_end date,
  data_sources text[] not null default '{}',
  payload jsonb,
  generated_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_project_idx on public.reports (project_id, created_at desc);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Jobs, usage, notifications, audit
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  job_type public.job_type not null,
  status public.job_status not null default 'queued',
  priority smallint not null default 5,
  -- Stable per logical unit of work, so re-queuing the same work is a no-op.
  idempotency_key text unique,
  payload jsonb not null default '{}'::jsonb,
  progress_current integer not null default 0,
  progress_total integer not null default 0,
  progress_label text,
  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_claimable_idx on public.jobs (status, run_after, priority);
create index jobs_project_idx on public.jobs (project_id, created_at desc);
create index jobs_type_status_idx on public.jobs (job_type, status);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  metric public.usage_metric not null,
  quantity integer not null default 1,
  -- Calendar month key, e.g. '2026-08'. Denormalised for fast aggregation.
  period_key text not null,
  engine public.engine_id,
  estimated_cost_usd numeric(10, 6),
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_org_period_idx on public.usage_events (organization_id, period_key, metric);
create index usage_events_project_idx on public.usage_events (project_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  notification_type public.notification_type not null,
  title text not null,
  body text not null,
  action_url text,
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_organization_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create table public.rate_limit_counters (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  expires_at timestamptz not null,
  primary key (bucket, subject, window_start)
);

create index rate_limit_counters_expiry_idx on public.rate_limit_counters (expires_at);

create table public.system_errors (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  message text not null,
  severity public.issue_severity not null default 'high',
  organization_id uuid references public.organizations (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index system_errors_created_idx on public.system_errors (created_at desc);

-- ---------------------------------------------------------------------------
-- Seed the default plan configuration
-- ---------------------------------------------------------------------------

insert into public.plan_configurations (plan_code, display_name, price_minor, currency, trial_days)
values ('pro', 'V Turn AI Pro', 49900, 'INR', 7)
on conflict (plan_code) do nothing;
