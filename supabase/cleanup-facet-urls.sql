-- Remove faceted listing URLs recorded before the crawler learned to skip them.
--
-- WordPress category and tag links such as /blog/?cat=SEO are real, reachable
-- URLs, so the crawler was right to find them, but they render a slice of a
-- page it already had. Counting them inflated site totals and manufactured
-- duplicate-title findings against a template the owner only wrote once.
--
-- The crawler stopped collecting these on 2026-08-29. Rows captured before then
-- are still in the database and still feeding audits and opportunities, so they
-- have to be removed once, by hand.
--
-- HOW TO RUN
-- Run each numbered step on its own, in order, and read the result before
-- moving to the next. Do not run the whole file at once: there is no wrapping
-- transaction here on purpose, because the Supabase SQL editor manages its own
-- and a temporary table does not survive between statements.
--
-- The pattern below matches FACET_QUERY_KEYS in src/lib/crawler/url.ts. If a key
-- is added there, add it here too.


-- ===========================================================================
-- 1. Look before deleting. Read these two numbers first.
-- ===========================================================================

select
  count(*) filter (
    where url ~* '[?&](cat|category|category_name|tag|tag_id|author|author_name|m|monthnum|year|day|p|page_id|attachment_id|preview|preview_id|paged|orderby|order|sort|sort_by|per_page|posts_per_page|product_cat|product_tag|min_price|max_price|rating_filter|stock_status)='
       or url ~* '[?&](filter_|facet_)'
  ) as facet_pages,
  count(*) as total_pages
from public.crawl_pages;


-- ===========================================================================
-- 2. See a sample of exactly what will go. Sanity-check these are facets.
-- ===========================================================================

select url
from public.crawl_pages
where url ~* '[?&](cat|category|category_name|tag|tag_id|author|author_name|m|monthnum|year|day|p|page_id|attachment_id|preview|preview_id|paged|orderby|order|sort|sort_by|per_page|posts_per_page|product_cat|product_tag|min_price|max_price|rating_filter|stock_status)='
   or url ~* '[?&](filter_|facet_)'
order by url
limit 30;


-- ===========================================================================
-- 3. Drop opportunities whose evidence is entirely facet URLs.
-- ===========================================================================
-- These findings exist only because the same template was counted several
-- times. Removing the pages without removing the finding would leave a
-- conclusion on screen with nothing behind it, which is the behaviour this
-- cleanup exists to end.

delete from public.opportunities o
where cardinality(o.affected_urls) > 0
  and not exists (
    select 1
    from unnest(o.affected_urls) as u
    where u !~* '[?&](cat|category|category_name|tag|tag_id|author|author_name|m|monthnum|year|day|p|page_id|attachment_id|preview|preview_id|paged|orderby|order|sort|sort_by|per_page|posts_per_page|product_cat|product_tag|min_price|max_price|rating_filter|stock_status)='
      and u !~* '[?&](filter_|facet_)'
  );


-- ===========================================================================
-- 4. Strip facet URLs from opportunities that also cite real pages.
-- ===========================================================================
-- These findings survive, but their affected-page list and count must stop
-- including URLs that were never distinct pages.

with cleaned as (
  select
    o.id,
    coalesce(
      array_agg(u order by u) filter (
        where u !~* '[?&](cat|category|category_name|tag|tag_id|author|author_name|m|monthnum|year|day|p|page_id|attachment_id|preview|preview_id|paged|orderby|order|sort|sort_by|per_page|posts_per_page|product_cat|product_tag|min_price|max_price|rating_filter|stock_status)='
          and u !~* '[?&](filter_|facet_)'
      ),
      '{}'::text[]
    ) as urls
  from public.opportunities o
  cross join lateral unnest(o.affected_urls) as u
  group by o.id
)
update public.opportunities o
set
  affected_urls = c.urls,
  affected_page_count = cardinality(c.urls),
  updated_at = now()
from cleaned c
where o.id = c.id
  and o.affected_urls is distinct from c.urls;


-- ===========================================================================
-- 5. Delete the pages themselves.
-- ===========================================================================
-- page_scores, page_issues and page_links cascade on delete.

delete from public.crawl_pages
where url ~* '[?&](cat|category|category_name|tag|tag_id|author|author_name|m|monthnum|year|day|p|page_id|attachment_id|preview|preview_id|paged|orderby|order|sort|sort_by|per_page|posts_per_page|product_cat|product_tag|min_price|max_price|rating_filter|stock_status)='
   or url ~* '[?&](filter_|facet_)';


-- ===========================================================================
-- 6. Confirm. This should return zero.
-- ===========================================================================

select count(*) as facet_pages_remaining
from public.crawl_pages
where url ~* '[?&](cat|category|category_name|tag|tag_id|author|author_name|m|monthnum|year|day|p|page_id|attachment_id|preview|preview_id|paged|orderby|order|sort|sort_by|per_page|posts_per_page|product_cat|product_tag|min_price|max_price|rating_filter|stock_status)='
   or url ~* '[?&](filter_|facet_)';


-- ===========================================================================
-- 7. Re-crawl so the totals reflect reality.
-- ===========================================================================
-- Trigger a fresh audit from the application (Website Audit -> Run audit), or
-- wait for the daily cron. Page counts, duplicate-title findings and the
-- opportunity list are all rebuilt from the new crawl.
