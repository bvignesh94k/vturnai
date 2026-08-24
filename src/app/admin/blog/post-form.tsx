"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { createBlogPostAction, updateBlogPostAction } from "@/app/admin/blog/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { renderMarkdown } from "@/lib/content/markdown";

export interface PostFormValues {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  coverImageUrl: string;
  authorName: string;
  isPublished: boolean;
}

/** Lowercase, hyphenated: matches blogSlugSchema exactly, so a user rarely sees the format error. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function PostForm({ initial }: { initial: PostFormValues }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [title, setTitle] = React.useState(initial.title);
  const [slug, setSlug] = React.useState(initial.slug);
  const [slugTouched, setSlugTouched] = React.useState(Boolean(initial.id));
  const [body, setBody] = React.useState(initial.bodyMarkdown);
  const [isPublished, setIsPublished] = React.useState(initial.isPublished);
  const [preview, setPreview] = React.useState(false);
  const isEdit = Boolean(initial.id);

  return (
    <form
      action={(formData) => {
        formData.set("title", title);
        formData.set("slug", slug);
        formData.set("bodyMarkdown", body);
        formData.set("isPublished", String(isPublished));
        if (initial.id) formData.set("id", initial.id);

        startTransition(async () => {
          const result = isEdit
            ? await updateBlogPostAction(formData)
            : await createBlogPostAction(formData);
          if (result.ok) {
            toast.success(result.message ?? "Saved.");
            router.push("/admin/blog");
            router.refresh();
          } else {
            toast.error(result.error ?? "Could not save that post.");
          }
        });
      }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEdit ? "Edit post" : "New post"}</CardTitle>
          <CardDescription>Written in markdown. Headings, bold, italic, links, lists and code are supported.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">URL slug</Label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">/blog/</span>
              <Input
                id="slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea
              id="excerpt"
              name="excerpt"
              defaultValue={initial.excerpt}
              rows={2}
              placeholder="Shown on the blog listing. Leave blank to use the first line of the body."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverImageUrl">Cover image URL</Label>
            <Input
              id="coverImageUrl"
              name="coverImageUrl"
              defaultValue={initial.coverImageUrl}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorName">Author name</Label>
            <Input id="authorName" name="authorName" defaultValue={initial.authorName} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="bodyMarkdown">Body</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((value) => !value)}>
                {preview ? "Edit" : "Preview"}
              </Button>
            </div>
            {preview ? (
              <div className="min-h-64 rounded-md border bg-card px-4 py-3 text-sm">
                {body.trim() ? renderMarkdown(body) : (
                  <p className="text-muted-foreground">Nothing written yet.</p>
                )}
              </div>
            ) : (
              <Textarea
                id="bodyMarkdown"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={18}
                className="font-mono text-sm"
                required
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Published</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Off keeps this as a draft, visible only here in the admin panel.
              </p>
            </div>
            <Switch checked={isPublished} onCheckedChange={setIsPublished} aria-label="Published" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="gradient" size="lg" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          {isEdit ? "Save changes" : "Create post"}
        </Button>
      </div>
    </form>
  );
}
