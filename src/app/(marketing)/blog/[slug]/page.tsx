import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { JsonLd, Section } from "@/components/marketing/sections";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { articleSchema, breadcrumbSchema } from "@/lib/config/structured-data";
import { markdownToPlainText, renderMarkdown } from "@/lib/content/markdown";
import { formatDateTime } from "@/lib/utils";

export const revalidate = 60;

async function getPost(slug: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post not found" };

  const description = post.excerpt || markdownToPlainText(post.body_markdown, 160);
  return {
    title: post.title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description,
      type: "article",
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      ...(post.cover_image_url ? { images: [post.cover_image_url] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const description = post.excerpt || markdownToPlainText(post.body_markdown, 160);

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.title, path: `/blog/${post.slug}` },
        ])}
      />
      <JsonLd
        data={articleSchema({
          title: post.title,
          description,
          path: `/blog/${post.slug}`,
          authorName: post.author_name,
          publishedAt: post.published_at ?? post.created_at,
          updatedAt: post.updated_at,
          imageUrl: post.cover_image_url,
        })}
      />

      <Section className="pb-24 pt-16 sm:pt-24">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" /> Back to blog
          </Link>

          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {post.author_name}
            {post.published_at ? ` · ${formatDateTime(post.published_at)}` : ""}
          </p>

          {post.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-supplied URL, arbitrary host, no remotePatterns configured
            <img
              src={post.cover_image_url}
              alt=""
              className="mt-8 aspect-[16/9] w-full rounded-xl object-cover"
            />
          ) : null}

          <div className="mt-8 space-y-4 text-base">{renderMarkdown(post.body_markdown)}</div>
        </div>
      </Section>
    </>
  );
}
