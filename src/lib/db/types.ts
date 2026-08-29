/**
 * Database types.
 *
 * Hand-maintained to mirror `supabase/migrations`. Regenerating with
 * `supabase gen types typescript` produces an equivalent shape; this file is
 * checked in so the project type-checks without a live database connection.
 *
 * Convention: `Insert` lists exactly the columns a caller must provide, with
 * everything carrying a database default marked optional.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type PlatformRole = "user" | "admin";
export type OrgRole = "owner" | "admin" | "member" | "viewer";
export type SubscriptionStatus =
  | "created"
  | "authenticated"
  | "trialing"
  | "active"
  | "past_due"
  | "halted"
  | "paused"
  | "cancelled"
  | "expired";
export type CrawlStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type JobType =
  | "initial_scan"
  | "website_crawl"
  | "page_analysis"
  | "ai_visibility_scan"
  | "search_console_sync"
  | "bing_sync"
  | "analytics_sync"
  | "pagespeed_scan"
  | "opportunity_generation"
  | "report_generation"
  | "entity_analysis";
export type IssueSeverityDb = "critical" | "high" | "medium" | "low" | "information";
export type EffortLevelDb = "easy" | "moderate" | "advanced";
export type DisciplineDb = "seo" | "aeo" | "geo" | "heo";
export type OpportunityStatus = "open" | "in_progress" | "completed" | "ignored";
export type EngineIdDb = "openai" | "gemini" | "anthropic" | "perplexity" | "grok" | "copilot";
export type SentimentDb = "positive" | "neutral" | "negative" | "mixed" | "unknown";
export type ObservationModeDb =
  | "direct_observation"
  | "api_observation"
  | "estimated"
  | "unavailable";
export type PromptGroupDb =
  | "awareness"
  | "problem"
  | "solution"
  | "comparison"
  | "alternative"
  | "recommendation"
  | "commercial"
  | "transactional"
  | "local"
  | "brand";
export type IntegrationProvider =
  | "google_search_console"
  | "google_analytics"
  | "bing_webmaster"
  | "pagespeed"
  | "openai"
  | "gemini"
  | "anthropic"
  | "perplexity"
  | "xai"
  | "microsoft_copilot";
export type IntegrationStatusDb = "connected" | "not_connected" | "configuration_required" | "error";
export type UsageMetricDb =
  | "pages_crawled"
  | "ai_prompt_executions"
  | "ai_engine_executions"
  | "pagespeed_checks"
  | "reports_generated"
  | "manual_scans"
  | "website_audits";
export type NotificationTypeDb =
  | "audit_complete"
  | "ai_scan_complete"
  | "visibility_drop"
  | "critical_issue"
  | "trial_ending"
  | "payment_failed"
  | "report_ready"
  | "usage_warning"
  | "job_failed";
export type ReportStatus = "queued" | "generating" | "ready" | "failed";

/** Columns that always carry a database default. */
type Defaults = "id" | "created_at" | "updated_at";

type Insertable<Row, Optional extends keyof Row = never> = Omit<
  Row,
  Extract<Defaults | Optional, keyof Row>
> &
  Partial<Pick<Row, Extract<Defaults | Optional, keyof Row>>>;

type TableShape<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
}

// ---------------------------------------------------------------------------
// Row definitions
// ---------------------------------------------------------------------------

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  platform_role: PlatformRole;
  marketing_opt_in: boolean;
  onboarding_completed_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  billing_email: string | null;
  country_code: string;
  created_at: string;
  updated_at: string;
}

export type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectRow = {
  id: string;
  organization_id: string;
  created_by: string | null;
  name: string;
  site_url: string;
  domain: string;
  brand_name: string;
  brand_aliases: string[];
  business_category: string | null;
  business_description: string | null;
  target_country: string;
  target_audience: string | null;
  primary_language: string;
  onboarding_step: number;
  onboarding_completed_at: string | null;
  initial_scan_completed_at: string | null;
  last_crawl_at: string | null;
  last_ai_scan_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ProjectSettingsRow = {
  project_id: string;
  max_crawl_urls: number;
  crawl_delay_ms: number;
  crawl_concurrency: number;
  respect_robots: boolean;
  include_subdomains: boolean;
  ai_scan_schedule: string;
  notification_email: boolean;
  notification_in_app: boolean;
  excluded_paths: string[];
  created_at: string;
  updated_at: string;
}

export type CompetitorRow = {
  id: string;
  project_id: string;
  brand_name: string;
  domain: string | null;
  site_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PlanConfigurationRow = {
  id: string;
  plan_code: string;
  display_name: string;
  price_minor: number;
  currency: string;
  trial_days: number;
  razorpay_plan_id: string | null;
  limits: Json;
  features: Json;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_code: string;
  status: SubscriptionStatus;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  razorpay_plan_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_start: string | null;
  trial_end: string | null;
  cancelled_at: string | null;
  ended_at: string | null;
  cancel_at_period_end: boolean;
  last_verified_at: string | null;
  short_url: string | null;
  created_at: string;
  updated_at: string;
}

export type BillingEventRow = {
  id: string;
  organization_id: string | null;
  subscription_id: string | null;
  event_type: string;
  provider_event_id: string | null;
  amount_minor: number | null;
  currency: string | null;
  status: string | null;
  payload: Json;
  occurred_at: string;
  created_at: string;
}

export type CrawlRow = {
  id: string;
  project_id: string;
  triggered_by: string | null;
  status: CrawlStatus;
  trigger_source: string;
  max_urls: number;
  urls_discovered: number;
  urls_crawled: number;
  urls_failed: number;
  robots_txt_found: boolean | null;
  robots_txt_content: string | null;
  sitemap_urls: string[];
  sitemap_url_count: number;
  ai_crawlers_blocked: string[];
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Where a URL was discovered. `suggested` does not assert the page exists. */
export type UrlSourceDb =
  | "project_seed"
  | "internal_link"
  | "sitemap"
  | "redirect"
  | "canonical"
  | "search_console"
  | "bing_webmaster"
  | "analytics_landing_page"
  | "user_input"
  | "suggested";

export type UrlDiscoveryRow = {
  id: string;
  project_id: string;
  url: string;
  normalized_url: string;
  url_hash: string;
  source_type: UrlSourceDb;
  source_detail: string | null;
  crawl_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type CrawlPageRow = {
  id: string;
  crawl_id: string;
  project_id: string;
  url: string;
  url_hash: string;
  depth: number;
  http_status: number | null;
  content_type: string | null;
  response_time_ms: number | null;
  redirected_to: string | null;
  redirect_chain: string[];
  fetch_error: string | null;
  title: string | null;
  title_length: number | null;
  meta_description: string | null;
  meta_description_length: number | null;
  canonical_url: string | null;
  robots_meta: string | null;
  is_indexable: boolean | null;
  noindex: boolean;
  nofollow: boolean;
  h1: string[];
  h2: string[];
  h3: string[];
  question_headings: string[];
  word_count: number;
  language: string | null;
  content_text: string | null;
  direct_answer_paragraphs: string[];
  open_graph: Json;
  twitter_card: Json;
  structured_data: Json;
  schema_types: string[];
  image_count: number;
  images_missing_alt: number;
  internal_link_count: number;
  external_link_count: number;
  nofollow_link_count: number;
  has_faq_content: boolean;
  faq_pairs: Json;
  table_count: number;
  list_count: number;
  has_breadcrumbs: boolean;
  author_name: string | null;
  published_date: string | null;
  modified_date: string | null;
  content_classification: string | null;
  is_https: boolean;
  has_mixed_content: boolean;
  crawled_at: string;
  created_at: string;
}

export type PageLinkRow = {
  id: string;
  crawl_id: string;
  source_page_id: string;
  target_url: string;
  target_page_id: string | null;
  anchor_text: string | null;
  is_internal: boolean;
  is_nofollow: boolean;
  http_status: number | null;
  created_at: string;
}

export type PageIssueRow = {
  id: string;
  crawl_id: string;
  project_id: string;
  page_id: string | null;
  issue_code: string;
  title: string;
  description: string;
  severity: IssueSeverityDb;
  disciplines: DisciplineDb[];
  why_it_matters: string;
  seo_impact: string | null;
  aeo_impact: string | null;
  geo_impact: string | null;
  recommendation: string;
  implementation_example: string | null;
  effort: EffortLevelDb;
  affected_url: string | null;
  evidence: Json;
  created_at: string;
}

export type PageScoreRow = {
  id: string;
  page_id: string;
  crawl_id: string;
  project_id: string;
  seo_score: number;
  aeo_score: number;
  geo_score: number;
  experience_authority_score: number;
  heo_score: number;
  citation_readiness_score: number;
  breakdown: Json;
  created_at: string;
}

export type ProjectScoreRow = {
  id: string;
  project_id: string;
  crawl_id: string | null;
  captured_at: string;
  v_score: number;
  seo_score: number;
  aeo_score: number;
  geo_score: number;
  experience_authority_score: number;
  heo_score: number;
  ai_visibility_score: number | null;
  mention_rate: number | null;
  citation_rate: number | null;
  recommendation_rate: number | null;
  share_of_voice: number | null;
  prompt_coverage: number | null;
  engine_consistency: number | null;
  citation_diversity: number | null;
  critical_issue_count: number;
  breakdown: Json;
  created_at: string;
}

export type EntityProfileRow = {
  id: string;
  project_id: string;
  crawl_id: string | null;
  brand_name: string | null;
  organization_name: string | null;
  description: string | null;
  category: string | null;
  products: string[];
  services: string[];
  locations: string[];
  people: Json;
  same_as_urls: string[];
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  primary_topics: string[];
  target_audience: string | null;
  unique_selling_propositions: string[];
  structured_identity: Json;
  consistency_score: number;
  created_at: string;
  updated_at: string;
}

export type EntityIssueRow = {
  id: string;
  project_id: string;
  crawl_id: string | null;
  field: string;
  severity: IssueSeverityDb;
  description: string;
  conflicting_values: Json;
  recommendation: string;
  created_at: string;
}

export type PromptRow = {
  id: string;
  project_id: string;
  prompt_text: string;
  intent: string | null;
  topic: string | null;
  prompt_group: PromptGroupDb;
  country: string;
  language: string;
  priority: number;
  is_active: boolean;
  is_suggested: boolean;
  suggestion_source: string | null;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PromptTagRow = {
  id: string;
  prompt_id: string;
  tag: string;
  created_at: string;
}

export type AiScanRow = {
  id: string;
  project_id: string;
  triggered_by: string | null;
  trigger_source: string;
  status: CrawlStatus;
  engines: EngineIdDb[];
  prompts_total: number;
  prompts_completed: number;
  runs_succeeded: number;
  runs_failed: number;
  engines_succeeded: number;
  engines_attempted: number;
  estimated_cost_usd: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type AiRunRow = {
  id: string;
  project_id: string;
  scan_id: string | null;
  prompt_id: string;
  engine: EngineIdDb;
  model: string;
  observation_mode: ObservationModeDb;
  is_valid: boolean;
  failure_reason: string | null;
  prompt_text: string;
  answer: string | null;
  brand_mentioned: boolean;
  domain_cited: boolean;
  recommended: boolean;
  sentiment: SentimentDb;
  citation_count: number;
  brand_citation_count: number;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  dedupe_key: string | null;
  metadata: Json;
  executed_at: string;
  created_at: string;
}

export type AiCitationRow = {
  id: string;
  ai_run_id: string;
  project_id: string;
  url: string;
  domain: string;
  title: string | null;
  is_brand_domain: boolean;
  is_competitor_domain: boolean;
  position: number | null;
  created_at: string;
}

export type AiCompetitorMentionRow = {
  id: string;
  ai_run_id: string;
  project_id: string;
  competitor_id: string | null;
  brand_name: string;
  mentioned: boolean;
  recommended: boolean;
  created_at: string;
}

export type IntegrationCredentialRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  provider: IntegrationProvider;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  api_key_encrypted: string | null;
  token_expires_at: string | null;
  scopes: string[];
  account_identifier: string | null;
  created_at: string;
  updated_at: string;
}

export type IntegrationConnectionRow = {
  id: string;
  project_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatusDb;
  display_name: string | null;
  account_identifier: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export type SearchConsoleConnectionRow = {
  id: string;
  project_id: string;
  site_url: string;
  permission_level: string | null;
  is_verified: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SearchConsoleMetricRow = {
  id: string;
  project_id: string;
  date: string;
  dimension: string;
  dimension_value: string;
  country: string | null;
  device: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  created_at: string;
}

export type BingConnectionRow = {
  id: string;
  project_id: string;
  site_url: string;
  is_verified: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BingMetricRow = {
  id: string;
  project_id: string;
  date: string;
  dimension: string;
  dimension_value: string;
  clicks: number;
  impressions: number;
  position: number | null;
  crawled_pages: number | null;
  indexed_pages: number | null;
  inbound_links: number | null;
  created_at: string;
}

export type AnalyticsConnectionRow = {
  id: string;
  project_id: string;
  property_id: string;
  property_name: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AnalyticsMetricRow = {
  id: string;
  project_id: string;
  date: string;
  dimension: string;
  dimension_value: string;
  sessions: number;
  engaged_sessions: number;
  conversions: number;
  is_ai_referral: boolean;
  created_at: string;
}

export type PagespeedRunRow = {
  id: string;
  project_id: string;
  page_id: string | null;
  url: string;
  strategy: "mobile" | "desktop";
  performance_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  seo_score: number | null;
  lcp_ms: number | null;
  cls: number | null;
  inp_ms: number | null;
  fcp_ms: number | null;
  ttfb_ms: number | null;
  speed_index_ms: number | null;
  total_blocking_time_ms: number | null;
  opportunities: Json;
  raw_lighthouse: Json | null;
  fetched_at: string;
  created_at: string;
}

export type OpportunityRow = {
  id: string;
  project_id: string;
  crawl_id: string | null;
  source_key: string;
  title: string;
  opportunity_type: string;
  disciplines: DisciplineDb[];
  severity: IssueSeverityDb;
  expected_impact: string;
  effort: EffortLevelDb;
  priority_score: number;
  priority_breakdown: Json;
  affected_urls: string[];
  affected_page_count: number;
  explanation: string;
  recommendation: string;
  implementation_guidance: string | null;
  status: OpportunityStatus;
  assigned_to: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ReportRow = {
  id: string;
  project_id: string;
  created_by: string | null;
  title: string;
  report_type: string;
  status: ReportStatus;
  period_start: string | null;
  period_end: string | null;
  data_sources: string[];
  payload: Json | null;
  generated_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type JobRow = {
  id: string;
  project_id: string | null;
  organization_id: string | null;
  job_type: JobType;
  status: JobStatus;
  priority: number;
  idempotency_key: string | null;
  payload: Json;
  progress_current: number;
  progress_total: number;
  progress_label: string | null;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  result: Json | null;
  created_at: string;
  updated_at: string;
}

export type UsageEventRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  metric: UsageMetricDb;
  quantity: number;
  period_key: string;
  engine: EngineIdDb | null;
  estimated_cost_usd: number | null;
  reference_id: string | null;
  metadata: Json;
  created_at: string;
}

export type NotificationRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  project_id: string | null;
  notification_type: NotificationTypeDb;
  title: string;
  body: string;
  action_url: string | null;
  read_at: string | null;
  email_sent_at: string | null;
  created_at: string;
}

export type AuditLogRow = {
  id: string;
  organization_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Json;
  created_at: string;
}

export type SystemErrorRow = {
  id: string;
  scope: string;
  message: string;
  severity: IssueSeverityDb;
  organization_id: string | null;
  project_id: string | null;
  context: Json;
  created_at: string;
}

export type AdminResource = "leads" | "blog";

export type BlogPostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
  author_name: string;
  is_published: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AdminGrantRow = {
  id: string;
  email: string;
  resource: AdminResource;
  granted_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Database shape consumed by the Supabase client
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      profiles: TableShape<ProfileRow, Insertable<ProfileRow, "platform_role" | "marketing_opt_in" | "full_name" | "avatar_url" | "onboarding_completed_at" | "last_seen_at">>;
      organizations: TableShape<OrganizationRow, Insertable<OrganizationRow, "billing_email" | "country_code">>;
      organization_members: TableShape<OrganizationMemberRow, Insertable<OrganizationMemberRow, "role" | "invited_by">>;
      projects: TableShape<
        ProjectRow,
        Insertable<
          ProjectRow,
          | "created_by"
          | "brand_aliases"
          | "business_category"
          | "business_description"
          | "target_country"
          | "target_audience"
          | "primary_language"
          | "onboarding_step"
          | "onboarding_completed_at"
          | "initial_scan_completed_at"
          | "last_crawl_at"
          | "last_ai_scan_at"
          | "is_active"
        >
      >;
      project_settings: TableShape<
        ProjectSettingsRow,
        Insertable<
          ProjectSettingsRow,
          | "max_crawl_urls"
          | "crawl_delay_ms"
          | "crawl_concurrency"
          | "respect_robots"
          | "include_subdomains"
          | "ai_scan_schedule"
          | "notification_email"
          | "notification_in_app"
          | "excluded_paths"
        >
      >;
      competitors: TableShape<
        CompetitorRow,
        Insertable<CompetitorRow, "domain" | "site_url" | "notes" | "is_active">
      >;
      plan_configurations: TableShape<PlanConfigurationRow, Partial<PlanConfigurationRow>>;
      subscriptions: TableShape<SubscriptionRow, Partial<SubscriptionRow> & { organization_id: string }>;
      billing_events: TableShape<BillingEventRow, Partial<BillingEventRow> & { event_type: string }>;
      crawls: TableShape<CrawlRow, Partial<CrawlRow> & { project_id: string }>;
      crawl_pages: TableShape<
        CrawlPageRow,
        Partial<CrawlPageRow> & { crawl_id: string; project_id: string; url: string; url_hash: string }
      >;
      url_discoveries: TableShape<
        UrlDiscoveryRow,
        Partial<UrlDiscoveryRow> & {
          project_id: string;
          url: string;
          normalized_url: string;
          url_hash: string;
          source_type: UrlSourceDb;
        }
      >;
      page_links: TableShape<
        PageLinkRow,
        Partial<PageLinkRow> & {
          crawl_id: string;
          source_page_id: string;
          target_url: string;
          is_internal: boolean;
        }
      >;
      page_issues: TableShape<
        PageIssueRow,
        Partial<PageIssueRow> & {
          crawl_id: string;
          project_id: string;
          issue_code: string;
          title: string;
          description: string;
          severity: IssueSeverityDb;
          why_it_matters: string;
          recommendation: string;
        }
      >;
      page_scores: TableShape<
        PageScoreRow,
        Partial<PageScoreRow> & { page_id: string; crawl_id: string; project_id: string }
      >;
      project_scores: TableShape<ProjectScoreRow, Partial<ProjectScoreRow> & { project_id: string }>;
      entity_profiles: TableShape<EntityProfileRow, Partial<EntityProfileRow> & { project_id: string }>;
      entity_issues: TableShape<
        EntityIssueRow,
        Partial<EntityIssueRow> & {
          project_id: string;
          field: string;
          description: string;
          recommendation: string;
        }
      >;
      prompts: TableShape<
        PromptRow,
        Insertable<
          PromptRow,
          | "intent"
          | "topic"
          | "prompt_group"
          | "country"
          | "language"
          | "priority"
          | "is_active"
          | "is_suggested"
          | "suggestion_source"
          | "last_run_at"
          | "created_by"
        >
      >;
      prompt_tags: TableShape<PromptTagRow, Insertable<PromptTagRow>>;
      ai_scans: TableShape<AiScanRow, Partial<AiScanRow> & { project_id: string }>;
      ai_runs: TableShape<
        AiRunRow,
        Partial<AiRunRow> & {
          project_id: string;
          prompt_id: string;
          engine: EngineIdDb;
          model: string;
          prompt_text: string;
        }
      >;
      ai_citations: TableShape<
        AiCitationRow,
        Partial<AiCitationRow> & {
          ai_run_id: string;
          project_id: string;
          url: string;
          domain: string;
        }
      >;
      ai_competitor_mentions: TableShape<
        AiCompetitorMentionRow,
        Partial<AiCompetitorMentionRow> & {
          ai_run_id: string;
          project_id: string;
          brand_name: string;
        }
      >;
      integration_credentials: TableShape<
        IntegrationCredentialRow,
        Partial<IntegrationCredentialRow> & { organization_id: string; provider: IntegrationProvider }
      >;
      integration_connections: TableShape<
        IntegrationConnectionRow,
        Partial<IntegrationConnectionRow> & { project_id: string; provider: IntegrationProvider }
      >;
      search_console_connections: TableShape<
        SearchConsoleConnectionRow,
        Partial<SearchConsoleConnectionRow> & { project_id: string; site_url: string }
      >;
      search_console_metrics: TableShape<
        SearchConsoleMetricRow,
        Partial<SearchConsoleMetricRow> & {
          project_id: string;
          date: string;
          dimension: string;
          dimension_value: string;
        }
      >;
      bing_connections: TableShape<
        BingConnectionRow,
        Partial<BingConnectionRow> & { project_id: string; site_url: string }
      >;
      bing_metrics: TableShape<
        BingMetricRow,
        Partial<BingMetricRow> & {
          project_id: string;
          date: string;
          dimension: string;
          dimension_value: string;
        }
      >;
      analytics_connections: TableShape<
        AnalyticsConnectionRow,
        Partial<AnalyticsConnectionRow> & { project_id: string; property_id: string }
      >;
      analytics_metrics: TableShape<
        AnalyticsMetricRow,
        Partial<AnalyticsMetricRow> & {
          project_id: string;
          date: string;
          dimension: string;
          dimension_value: string;
        }
      >;
      pagespeed_runs: TableShape<
        PagespeedRunRow,
        Partial<PagespeedRunRow> & { project_id: string; url: string; strategy: "mobile" | "desktop" }
      >;
      opportunities: TableShape<
        OpportunityRow,
        Partial<OpportunityRow> & {
          project_id: string;
          source_key: string;
          title: string;
          opportunity_type: string;
          expected_impact: string;
          explanation: string;
          recommendation: string;
        }
      >;
      reports: TableShape<ReportRow, Partial<ReportRow> & { project_id: string; title: string }>;
      jobs: TableShape<JobRow, Partial<JobRow> & { job_type: JobType }>;
      usage_events: TableShape<
        UsageEventRow,
        Partial<UsageEventRow> & {
          organization_id: string;
          metric: UsageMetricDb;
          period_key: string;
        }
      >;
      notifications: TableShape<
        NotificationRow,
        Partial<NotificationRow> & {
          user_id: string;
          notification_type: NotificationTypeDb;
          title: string;
          body: string;
        }
      >;
      audit_logs: TableShape<AuditLogRow, Partial<AuditLogRow> & { action: string }>;
      system_errors: TableShape<
        SystemErrorRow,
        Partial<SystemErrorRow> & { scope: string; message: string }
      >;
      blog_posts: TableShape<
        BlogPostRow,
        Insertable<BlogPostRow, "excerpt" | "cover_image_url" | "author_name" | "is_published" | "published_at" | "created_by">
      >;
      admin_grants: TableShape<AdminGrantRow, Insertable<AdminGrantRow, "granted_by">>;
    };
    Views: { [_ in never]: never };
    Functions: {
      consume_rate_limit: {
        Args: {
          p_bucket: string;
          p_subject: string;
          p_window_start: string;
          p_window_seconds: number;
        };
        Returns: number;
      };
      claim_jobs: {
        Args: {
          p_worker_id: string;
          p_limit?: number;
          p_job_types?: JobType[] | null;
          p_lock_seconds?: number;
        };
        Returns: JobRow[];
      };
      release_job: {
        Args: { p_job_id: string; p_error: string; p_retry_after_seconds?: number };
        Returns: JobRow;
      };
      usage_totals: {
        Args: { p_organization_id: string; p_period_key: string };
        Returns: Array<{ metric: UsageMetricDb; total: number; estimated_cost_usd: number }>;
      };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      platform_role: PlatformRole;
      org_role: OrgRole;
      subscription_status: SubscriptionStatus;
      crawl_status: CrawlStatus;
      job_status: JobStatus;
      job_type: JobType;
      issue_severity: IssueSeverityDb;
      effort_level: EffortLevelDb;
      discipline: DisciplineDb;
      opportunity_status: OpportunityStatus;
      engine_id: EngineIdDb;
      sentiment: SentimentDb;
      observation_mode: ObservationModeDb;
      prompt_group: PromptGroupDb;
      integration_provider: IntegrationProvider;
      integration_status: IntegrationStatusDb;
      usage_metric: UsageMetricDb;
      notification_type: NotificationTypeDb;
      report_status: ReportStatus;
      admin_resource: AdminResource;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
