-- ============================================================================
-- V Turn AI. Admin CRM: blog posts and scoped admin grants.
--
-- Two additions on top of the existing binary platform_role:
--   * blog_posts backs the public /blog section. Public reads see only
--     published rows; every write goes through the service role from an
--     admin-gated server action, so RLS here carries only the public read
--     policy.
--   * admin_grants lets a full platform admin hand a named email narrow,
--     resource-scoped access (leads, blog) without promoting them to
--     platform_role admin, which would also expose billing and system
--     metrics. RLS enables and grants no policies, the same pattern already
--     used for integration_credentials: only the service role, reached from
--     requireAdminAccess()'s server-side check, may touch it.
-- ============================================================================

create type public.admin_resource as enum ('leads', 'blog');

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  body_markdown text not null,
  cover_image_url text,
  author_name text not null default 'V Turn AI Team',
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

-- Serves the /blog listing query directly: published posts, newest first.
create index blog_posts_published_idx on public.blog_posts (published_at desc) where is_published;

create table public.admin_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  resource public.admin_resource not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (email, resource)
);

alter table public.blog_posts enable row level security;
alter table public.admin_grants enable row level security;

create policy blog_posts_public_select on public.blog_posts
  for select
  to anon, authenticated
  using (is_published);

-- admin_grants intentionally carries no policy for anon or authenticated:
-- RLS enabled with zero policies denies every client-role request. Only the
-- service role, which bypasses RLS, may read or write it.
