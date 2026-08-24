"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { blogPostSchema, blogPostUpdateSchema } from "@/lib/validation/schemas";
import { errorMessage, logger } from "@/lib/logger";

const log = logger.child("admin-blog-actions");

export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

function fail(error: unknown): ActionResult {
  const message = errorMessage(error);
  log.warn("Blog action failed", { message });
  return { ok: false, error: message || "Something went wrong. Please try again." };
}

function readForm(formData: FormData) {
  return {
    title: formData.get("title"),
    slug: formData.get("slug"),
    excerpt: formData.get("excerpt") || undefined,
    bodyMarkdown: formData.get("bodyMarkdown"),
    coverImageUrl: formData.get("coverImageUrl") || undefined,
    authorName: formData.get("authorName") || undefined,
    isPublished: formData.get("isPublished") === "true",
  };
}

export async function createBlogPostAction(formData: FormData): Promise<ActionResult> {
  try {
    const access = await requireAdminAccess("blog");
    const parsed = blogPostSchema.parse(readForm(formData));
    const supabase = createServiceRoleClient();

    const { error } = await supabase.from("blog_posts").insert({
      title: parsed.title,
      slug: parsed.slug,
      excerpt: parsed.excerpt ?? null,
      body_markdown: parsed.bodyMarkdown,
      cover_image_url: parsed.coverImageUrl || null,
      author_name: parsed.authorName || "V Turn AI Team",
      is_published: parsed.isPublished ?? false,
      published_at: parsed.isPublished ? new Date().toISOString() : null,
      created_by: access.user.id,
    });
    if (error) {
      if (error.code === "23505") throw new Error("That slug is already in use.");
      throw new Error(error.message);
    }

    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    return { ok: true, message: "Post created." };
  } catch (error) {
    return fail(error);
  }
}

export async function updateBlogPostAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAdminAccess("blog");
    const parsed = blogPostUpdateSchema.parse({ id: formData.get("id"), ...readForm(formData) });
    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase
      .from("blog_posts")
      .select("is_published, published_at")
      .eq("id", parsed.id)
      .maybeSingle();

    const update: Record<string, unknown> = {};
    if (parsed.title !== undefined) update["title"] = parsed.title;
    if (parsed.slug !== undefined) update["slug"] = parsed.slug;
    if (parsed.excerpt !== undefined) update["excerpt"] = parsed.excerpt || null;
    if (parsed.bodyMarkdown !== undefined) update["body_markdown"] = parsed.bodyMarkdown;
    if (parsed.coverImageUrl !== undefined) update["cover_image_url"] = parsed.coverImageUrl || null;
    if (parsed.authorName !== undefined) update["author_name"] = parsed.authorName;
    if (parsed.isPublished !== undefined) {
      update["is_published"] = parsed.isPublished;
      // A post gets exactly one published_at, set the first time it goes live.
      // Unpublishing and republishing does not reset it, so the byline date
      // stays meaningful rather than jumping to today on every toggle.
      if (parsed.isPublished && !existing?.published_at) {
        update["published_at"] = new Date().toISOString();
      }
    }

    const { error } = await supabase.from("blog_posts").update(update as never).eq("id", parsed.id);
    if (error) {
      if (error.code === "23505") throw new Error("That slug is already in use.");
      throw new Error(error.message);
    }

    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    if (parsed.slug) revalidatePath(`/blog/${parsed.slug}`);
    return { ok: true, message: "Post saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteBlogPostAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAdminAccess("blog");
    const id = String(formData.get("id") ?? "");
    if (!id) throw new Error("Missing post id.");

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    return { ok: true, message: "Post deleted." };
  } catch (error) {
    return fail(error);
  }
}
