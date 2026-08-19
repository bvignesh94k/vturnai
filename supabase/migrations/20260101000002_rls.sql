-- ============================================================================
-- V Turn AI — Row Level Security
--
-- Model:
--   * A user sees only organizations they are a member of, and only the
--     projects belonging to those organizations.
--   * Read access follows membership. Write access requires owner/admin/member;
--     the `viewer` role is read-only.
--   * Derived analysis tables (crawl results, AI runs, scores) are written
--     exclusively by server jobs running as the service role. Clients may read
--     them but never insert or mutate them, so a compromised browser session
--     cannot fabricate visibility data.
--   * integration_credentials has RLS enabled and NO policies at all, which
--     denies every request from anon and authenticated. Only the service role,
--     which bypasses RLS, can touch it.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_settings enable row level security;
alter table public.competitors enable row level security;
alter table public.plan_configurations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.crawls enable row level security;
alter table public.crawl_pages enable row level security;
alter table public.page_links enable row level security;
alter table public.page_issues enable row level security;
alter table public.page_scores enable row level security;
alter table public.project_scores enable row level security;
alter table public.entity_profiles enable row level security;
alter table public.entity_issues enable row level security;
alter table public.prompts enable row level security;
alter table public.prompt_tags enable row level security;
alter table public.ai_scans enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_citations enable row level security;
alter table public.ai_competitor_mentions enable row level security;
alter table public.integration_credentials enable row level security;
alter table public.integration_connections enable row level security;
alter table public.search_console_connections enable row level security;
alter table public.search_console_metrics enable row level security;
alter table public.bing_connections enable row level security;
alter table public.bing_metrics enable row level security;
alter table public.analytics_connections enable row level security;
alter table public.analytics_metrics enable row level security;
alter table public.pagespeed_runs enable row level security;
alter table public.opportunities enable row level security;
alter table public.reports enable row level security;
alter table public.jobs enable row level security;
alter table public.usage_events enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limit_counters enable row level security;
alter table public.system_errors enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and platform_role = (select p.platform_role from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Organizations and membership
-- ---------------------------------------------------------------------------

create policy organizations_select_member on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.is_platform_admin());

create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.org_role[]));

create policy organization_members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy organization_members_write_admin on public.organization_members
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create policy projects_select_member on public.projects
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy projects_insert_member on public.projects
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'member']::public.org_role[]));

create policy projects_update_member on public.projects
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'member']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'member']::public.org_role[]));

create policy projects_delete_admin on public.projects
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy project_settings_select on public.project_settings
  for select to authenticated
  using (public.is_project_member(project_id));

create policy project_settings_write on public.project_settings
  for all to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));

create policy competitors_select on public.competitors
  for select to authenticated
  using (public.is_project_member(project_id));

create policy competitors_write on public.competitors
  for all to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));

-- ---------------------------------------------------------------------------
-- Billing — readable by members, written only by verified server-side webhooks
-- ---------------------------------------------------------------------------

create policy plan_configurations_select on public.plan_configurations
  for select to authenticated
  using (true);

create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy billing_events_select on public.billing_events
  for select to authenticated
  using (
    organization_id is not null
    and (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]) or public.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- Crawl and analysis output — read-only to clients
-- ---------------------------------------------------------------------------

create policy crawls_select on public.crawls
  for select to authenticated
  using (public.is_project_member(project_id));

create policy crawl_pages_select on public.crawl_pages
  for select to authenticated
  using (public.is_project_member(project_id));

create policy page_links_select on public.page_links
  for select to authenticated
  using (
    exists (
      select 1 from public.crawls c
      where c.id = page_links.crawl_id and public.is_project_member(c.project_id)
    )
  );

create policy page_issues_select on public.page_issues
  for select to authenticated
  using (public.is_project_member(project_id));

create policy page_scores_select on public.page_scores
  for select to authenticated
  using (public.is_project_member(project_id));

create policy project_scores_select on public.project_scores
  for select to authenticated
  using (public.is_project_member(project_id));

create policy entity_profiles_select on public.entity_profiles
  for select to authenticated
  using (public.is_project_member(project_id));

create policy entity_issues_select on public.entity_issues
  for select to authenticated
  using (public.is_project_member(project_id));

-- ---------------------------------------------------------------------------
-- Prompts — user-managed
-- ---------------------------------------------------------------------------

create policy prompts_select on public.prompts
  for select to authenticated
  using (public.is_project_member(project_id));

create policy prompts_write on public.prompts
  for all to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));

create policy prompt_tags_select on public.prompt_tags
  for select to authenticated
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_tags.prompt_id and public.is_project_member(p.project_id)
    )
  );

create policy prompt_tags_write on public.prompt_tags
  for all to authenticated
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_tags.prompt_id and public.can_write_project(p.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_tags.prompt_id and public.can_write_project(p.project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- AI visibility output — read-only to clients
-- ---------------------------------------------------------------------------

create policy ai_scans_select on public.ai_scans
  for select to authenticated
  using (public.is_project_member(project_id));

create policy ai_runs_select on public.ai_runs
  for select to authenticated
  using (public.is_project_member(project_id));

create policy ai_citations_select on public.ai_citations
  for select to authenticated
  using (public.is_project_member(project_id));

create policy ai_competitor_mentions_select on public.ai_competitor_mentions
  for select to authenticated
  using (public.is_project_member(project_id));

-- ---------------------------------------------------------------------------
-- Integrations
--
-- integration_credentials intentionally has NO policy: RLS is on, so every
-- authenticated and anonymous request is denied. Server code uses the service
-- role, which bypasses RLS, and is the only thing holding ENCRYPTION_KEY.
-- ---------------------------------------------------------------------------

create policy integration_connections_select on public.integration_connections
  for select to authenticated
  using (public.is_project_member(project_id));

create policy search_console_connections_select on public.search_console_connections
  for select to authenticated
  using (public.is_project_member(project_id));

create policy search_console_metrics_select on public.search_console_metrics
  for select to authenticated
  using (public.is_project_member(project_id));

create policy bing_connections_select on public.bing_connections
  for select to authenticated
  using (public.is_project_member(project_id));

create policy bing_metrics_select on public.bing_metrics
  for select to authenticated
  using (public.is_project_member(project_id));

create policy analytics_connections_select on public.analytics_connections
  for select to authenticated
  using (public.is_project_member(project_id));

create policy analytics_metrics_select on public.analytics_metrics
  for select to authenticated
  using (public.is_project_member(project_id));

create policy pagespeed_runs_select on public.pagespeed_runs
  for select to authenticated
  using (public.is_project_member(project_id));

-- ---------------------------------------------------------------------------
-- Opportunities — clients may update workflow status only
-- ---------------------------------------------------------------------------

create policy opportunities_select on public.opportunities
  for select to authenticated
  using (public.is_project_member(project_id));

create policy opportunities_update_status on public.opportunities
  for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));

-- ---------------------------------------------------------------------------
-- Reports, jobs, usage, notifications
-- ---------------------------------------------------------------------------

create policy reports_select on public.reports
  for select to authenticated
  using (public.is_project_member(project_id));

create policy jobs_select on public.jobs
  for select to authenticated
  using (
    (project_id is not null and public.is_project_member(project_id))
    or (organization_id is not null and public.is_org_member(organization_id))
    or public.is_platform_admin()
  );

create policy usage_events_select on public.usage_events
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    (organization_id is not null and public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
    or public.is_platform_admin()
  );

create policy system_errors_select_admin on public.system_errors
  for select to authenticated
  using (public.is_platform_admin());

-- rate_limit_counters: RLS enabled, no policies. Service role only.

-- ---------------------------------------------------------------------------
-- Baseline grants. RLS still applies on top of these.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, anon;
grant select on all tables in schema public to authenticated;

grant insert, update, delete on public.projects to authenticated;
grant insert, update, delete on public.project_settings to authenticated;
grant insert, update, delete on public.competitors to authenticated;
grant insert, update, delete on public.prompts to authenticated;
grant insert, update, delete on public.prompt_tags to authenticated;
grant update on public.opportunities to authenticated;
grant update on public.profiles to authenticated;
grant update on public.organizations to authenticated;
grant insert, update, delete on public.organization_members to authenticated;
grant update on public.notifications to authenticated;

revoke all on public.integration_credentials from authenticated, anon;
revoke all on public.rate_limit_counters from authenticated, anon;
