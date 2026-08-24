import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostForm } from "@/app/admin/blog/post-form";
import { requireAdminAccess } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Edit post", robots: { index: false, follow: false } };

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAccess("blog");
  const { id } = await params;

  const supabase = createServiceRoleClient();
  const { data: post } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle();
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PostForm
        initial={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          bodyMarkdown: post.body_markdown,
          coverImageUrl: post.cover_image_url ?? "",
          authorName: post.author_name,
          isPublished: post.is_published,
        }}
      />
    </div>
  );
}
