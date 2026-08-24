import type { Metadata } from "next";
import { PostForm } from "@/app/admin/blog/post-form";
import { requireAdminAccess } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New post", robots: { index: false, follow: false } };

export default async function NewBlogPostPage() {
  await requireAdminAccess("blog");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PostForm
        initial={{
          title: "",
          slug: "",
          excerpt: "",
          bodyMarkdown: "",
          coverImageUrl: "",
          authorName: "V Turn AI Team",
          isPublished: false,
        }}
      />
    </div>
  );
}
