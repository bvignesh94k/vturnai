-- ============================================================================
-- V Turn AI: functions, triggers and RPCs
--
-- Membership helpers are SECURITY DEFINER so that RLS policies can call them
-- without recursing back through the policies on organization_members.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects p
    join public.organization_members m on m.organization_id = p.organization_id
    where p.id = p_project_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_write_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects p
    join public.organization_members m on m.organization_id = p.organization_id
    where p.id = p_project_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'member')
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.platform_role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile + personal organization + membership
-- ---------------------------------------------------------------------------

create or replace function public.slugify(p_value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_full_name text;
  v_org_name text;
  v_base_slug text;
  v_slug text;
  v_suffix integer := 0;
  v_org_id uuid;
begin
  v_full_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');

  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), v_full_name)
  on conflict (id) do nothing;

  v_org_name := coalesce(v_full_name, split_part(coalesce(new.email, 'workspace'), '@', 1)) || '''s workspace';
  v_base_slug := coalesce(nullif(public.slugify(v_org_name), ''), 'workspace');
  v_slug := v_base_slug;

  while exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  end loop;

  insert into public.organizations (name, slug, owner_id, billing_email)
  values (v_org_name, v_slug, new.id, new.email)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Rate limiting RPC, atomic increment inside a fixed window
-- ---------------------------------------------------------------------------

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_subject text,
  p_window_start timestamptz,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  insert into public.rate_limit_counters (bucket, subject, window_start, count, expires_at)
  values (
    p_bucket,
    p_subject,
    p_window_start,
    1,
    p_window_start + make_interval(secs => p_window_seconds)
  )
  on conflict (bucket, subject, window_start)
  do update set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of expired buckets, cheap enough to run inline.
  delete from public.rate_limit_counters where expires_at < now() - interval '1 day';

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job queue: claim the next runnable batch atomically
-- ---------------------------------------------------------------------------

create or replace function public.claim_jobs(
  p_worker_id text,
  p_limit integer default 1,
  p_job_types public.job_type[] default null,
  p_lock_seconds integer default 300
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimable as (
    select j.id
    from public.jobs j
    where j.status = 'queued'
      and j.run_after <= now()
      and (p_job_types is null or j.job_type = any (p_job_types))
      and (j.locked_at is null or j.locked_at < now() - make_interval(secs => p_lock_seconds))
    order by j.priority asc, j.run_after asc
    limit greatest(1, p_limit)
    for update skip locked
  )
  update public.jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      locked_at = now(),
      locked_by = p_worker_id,
      started_at = coalesce(j.started_at, now()),
      updated_at = now()
  from claimable c
  where j.id = c.id
  returning j.*;
end;
$$;

-- Release a job back to the queue, or fail it permanently once attempts run out.
create or replace function public.release_job(
  p_job_id uuid,
  p_error text,
  p_retry_after_seconds integer default 60
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job % not found', p_job_id;
  end if;

  if v_job.attempts >= v_job.max_attempts then
    update public.jobs
    set status = 'failed',
        last_error = p_error,
        locked_at = null,
        locked_by = null,
        completed_at = now(),
        updated_at = now()
    where id = p_job_id
    returning * into v_job;
  else
    update public.jobs
    set status = 'queued',
        last_error = p_error,
        locked_at = null,
        locked_by = null,
        run_after = now() + make_interval(secs => p_retry_after_seconds),
        updated_at = now()
    where id = p_job_id
    returning * into v_job;
  end if;

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usage aggregation
-- ---------------------------------------------------------------------------

create or replace function public.usage_totals(
  p_organization_id uuid,
  p_period_key text
)
returns table (metric public.usage_metric, total bigint, estimated_cost_usd numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.metric,
         sum(u.quantity)::bigint as total,
         coalesce(sum(u.estimated_cost_usd), 0)::numeric as estimated_cost_usd
  from public.usage_events u
  where u.organization_id = p_organization_id
    and u.period_key = p_period_key
  group by u.metric;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.consume_rate_limit(text, text, timestamptz, integer) from public;
revoke all on function public.claim_jobs(text, integer, public.job_type[], integer) from public;
revoke all on function public.release_job(uuid, text, integer) from public;

grant execute on function public.consume_rate_limit(text, text, timestamptz, integer) to service_role;
grant execute on function public.claim_jobs(text, integer, public.job_type[], integer) to service_role;
grant execute on function public.release_job(uuid, text, integer) to service_role;
grant execute on function public.usage_totals(uuid, text) to authenticated, service_role;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.can_write_project(uuid) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
