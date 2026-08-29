-- URL provenance.
--
-- Until now a URL could reach an opportunity's "affected pages" list without
-- anything recording where it came from, so neither we nor the customer could
-- audit it. That is what produced findings citing /blog/?cat=AI+Search and left
-- the site owner correctly insisting no such page existed: the URL was real,
-- but nothing could show why it had been counted.
--
-- Every URL the product mentions now carries its origin. A page found three
-- ways keeps all three records, because "the sitemap declares it and nothing
-- links to it" is itself a finding.

-- ---------------------------------------------------------------------------
-- How a URL came to our attention.
-- ---------------------------------------------------------------------------
create type public.url_source as enum (
  -- The project's own address, entered during onboarding.
  'project_seed',
  -- An <a href> on a page we crawled.
  'internal_link',
  -- Declared in an XML sitemap.
  'sitemap',
  -- The destination of a redirect we followed.
  'redirect',
  -- Named by a rel=canonical on another page.
  'canonical',
  -- Returned by Google Search Console as a page with impressions.
  'search_console',
  -- Returned by Bing Webmaster Tools.
  'bing_webmaster',
  -- A GA4 landing page with sessions.
  'analytics_landing_page',
  -- Typed by a person.
  'user_input',
  -- Proposed by analysis. Does not exist yet, and must never be presented as
  -- a page the site already has.
  'suggested'
);

comment on type public.url_source is
  'Where a URL was discovered. "suggested" is the one value that does not assert the page exists.';

-- ---------------------------------------------------------------------------
-- One row per (url, source). Deliberately not one row per url.
-- ---------------------------------------------------------------------------
create table public.url_discoveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,

  -- As discovered, byte for byte, so it can be shown back to the user exactly
  -- as it appeared wherever we found it.
  url text not null,
  -- Post-normalisation identity: the de-duplication key the crawler uses.
  normalized_url text not null,
  url_hash text not null,

  source_type public.url_source not null,
  -- Where specifically: the page carrying the link, the sitemap's own URL, the
  -- integration that reported it. Null when the source needs no further detail.
  source_detail text,

  -- The crawl that observed this, when it came from one.
  crawl_id uuid references public.crawls (id) on delete set null,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  -- The same URL found on the same page twice is one discovery, seen again.
  unique (project_id, url_hash, source_type, source_detail)
);

comment on table public.url_discoveries is
  'Provenance for every URL the product knows about. Nothing may be shown as an affected page without a row here.';

create index url_discoveries_project_hash_idx
  on public.url_discoveries (project_id, url_hash);
create index url_discoveries_project_normalized_idx
  on public.url_discoveries (project_id, normalized_url);
create index url_discoveries_crawl_idx
  on public.url_discoveries (crawl_id) where crawl_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: readable by the organisation that owns the project, written by the
-- service role only. Discovery happens in job workers, never in a browser.
-- ---------------------------------------------------------------------------
alter table public.url_discoveries enable row level security;

create policy url_discoveries_select_by_member
  on public.url_discoveries
  for select
  using (
    exists (
      select 1
      from public.projects p
      join public.organization_members m on m.organization_id = p.organization_id
      where p.id = url_discoveries.project_id
        and m.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Record a discovery, or note that an existing one was seen again.
-- ---------------------------------------------------------------------------
create or replace function public.record_url_discovery(
  p_project_id uuid,
  p_url text,
  p_normalized_url text,
  p_url_hash text,
  p_source_type public.url_source,
  p_source_detail text default null,
  p_crawl_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.url_discoveries as d (
    project_id, url, normalized_url, url_hash, source_type, source_detail, crawl_id
  )
  values (
    p_project_id, p_url, p_normalized_url, p_url_hash, p_source_type, p_source_detail, p_crawl_id
  )
  on conflict (project_id, url_hash, source_type, source_detail)
  do update set
    last_seen_at = now(),
    crawl_id = coalesce(excluded.crawl_id, d.crawl_id)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.record_url_discovery is
  'Upsert a URL discovery. Re-finding a URL updates last_seen_at rather than duplicating the row.';
