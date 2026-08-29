-- Remove faceted listing URLs recorded before the crawler learned to skip them.
--
-- WordPress category and tag links such as /blog/?cat=SEO are real, reachable
-- URLs, so the crawler was right to find them, but they render a slice of a
-- page it already had. Counting them inflated site totals and manufactured
-- duplicate-title findings against a template the owner only wrote once.
--
-- The crawler stopped collecting these on 2026-08-29. Rows captured before that
-- are still in the database and still feeding audits and opportunities, so they
-- have to be removed once, by hand.
--
-- Dependent rows (page_scores, page_issues, page_links) cascade on delete.
-- Run against the project database with the service role.

begin;

-- ---------------------------------------------------------------------------
-- 1. Look before deleting. Run this on its own first.
-- ---------------------------------------------------------------------------
-- The pattern list matches FACET_QUERY_KEYS in src/lib/crawler/url.ts. Keep the
-- two in step: a key added there should be added here.

create temporary table facet_pages on commit drop as
select id, url
from public.crawl_pages
where url ~* '[?&](cat|category|category_name|tag|tag_id|author|author_name|m|monthnum|year|day|p|page_id|attachment_id|preview|preview_id|paged|orderby|order|sort|sort_by|per_page|posts_per_page|product_cat|product_tag|min_price|max_price|rating_filter|stock_status)='
   or url ~* '[?&](filter_|facet_)';

-- How many, and a sample. Read this before continuing.
select count(*) as facet_pages_found from facet_pages;
select url from facet_pages order by url limit 25;

-- ---------------------------------------------------------------------------
-- 2. Delete. Cascades clear the scores, issues and links attached to them.
-- ---------------------------------------------------------------------------
delete from public.crawl_pages
where id in (select id from facet_pages);

-- ---------------------------------------------------------------------------
-- 3. Drop opportunities that no longer reference any real page.
-- ---------------------------------------------------------------------------
-- An opportunity built entirely from facet URLs has just lost its evidence.
-- Leaving it in place would keep showing a finding nothing supports, which is
-- the behaviour this whole cleanup exists to end.

delete from public.opportunities
where affected_page_count > 0
  and not exists (
    select 1
    from public.crawl_pages cp
    where cp.project_id = opportunities.project_id
  );

commit;

-- ---------------------------------------------------------------------------
-- 4. Re-crawl so the totals reflect reality.
-- ---------------------------------------------------------------------------
-- Trigger a fresh audit from the application (Website Audit -> Run audit), or
-- wait for the daily cron. Page counts, duplicate-title findings and the
-- opportunity list are all rebuilt from the new crawl.
