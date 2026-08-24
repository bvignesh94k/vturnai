import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, FileTextIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { JsonLd, Section, SectionHeading } from "@/components/marketing/sections";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { breadcrumbSchema } from "@/lib/config/structured-data";
import { markdownToPlainText } from "@/lib/content/markdown";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Blog",
  description: "Notes on AI visibility, SEO, AEO and GEO from the V Turn AI team.",
  alternates: { canonical: "/blog" },
};

// Built statically otherwise, which would freeze the listing at whatever it
// was on the last deploy. revalidatePath in the admin actions covers the
// instant case; this is the fallback for anyone still viewing a cached page.
export const revalidate = 60;

export default async function BlogIndexPage() {
  const supabase = createServiceRoleClient();
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("slug, title, excerpt, body_markdown, cover_image_url, author_name, published_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(100);

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Blog", path: "/blog" }])} />
      <Section className="pb-8 pt-16 sm:pt-24">
        <SectionHeading
          eyebrow="Blog"
          title="Notes on AI visibility, SEO, AEO and GEO"
          description="Short, practical pieces on getting found and cited across search and AI answer engines."
        />
      </Section>

      <Section className="pb-24">
        {(posts ?? []).length === 0 ? (
          <EmptyState
            icon={<FileTextIcon className="size-5" />}
            title="Nothing published yet"
            description="Check back soon."
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(posts ?? []).map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
              >
                {post.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-supplied URL, arbitrary host, no remotePatterns configured
                  <img
                    src={post.cover_image_url}
                    alt=""
                    loading="lazy"
                    className="aspect-[16/9] w-full object-cover"
                  />
                ) : null}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  {post.published_at ? (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {formatDateTime(post.published_at)}
                    </p>
                  ) : null}
                  <h2 className="text-lg font-semibold leading-snug tracking-tight group-hover:text-primary">
                    {post.title}
                  </h2>
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {post.excerpt || markdownToPlainText(post.body_markdown, 160)}
                  </p>
                  <span className="mt-auto flex items-center gap-1.5 pt-2 text-sm font-medium text-primary">
                    Read more <ArrowRightIcon className="size-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
