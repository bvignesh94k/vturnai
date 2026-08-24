import type { Metadata } from "next";
import Link from "next/link";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteBlogPostAction } from "@/app/admin/blog/actions";
import { requireAdminAccess } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Blog admin", robots: { index: false, follow: false } };

export default async function AdminBlogListPage() {
  await requireAdminAccess("blog");

  const supabase = createServiceRoleClient();
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, title, slug, is_published, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <FileTextIcon className="size-3.5" /> Admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Blog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Published posts appear at /blog immediately. Drafts are visible only here.
          </p>
        </div>
        <Button variant="gradient" asChild>
          <Link href="/admin/blog/new">
            <PlusIcon /> New post
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="px-0 py-0">
          {(posts ?? []).length === 0 ? (
            <EmptyState
              icon={<FileTextIcon className="size-5" />}
              title="No posts yet"
              description="Write the first one and the public blog section goes live."
              action={
                <Button variant="gradient" asChild>
                  <Link href="/admin/blog/new">
                    <PlusIcon /> New post
                  </Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="pr-5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(posts ?? []).map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="pl-5">
                      <p className="text-sm font-medium">{post.title}</p>
                      <p className="text-xs text-muted-foreground">/blog/{post.slug}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={post.is_published ? "success" : "muted"}>
                        {post.is_published ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(post.updated_at)}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/admin/blog/${post.id}`}>Edit</Link>
                        </Button>
                        <ActionButton
                          action={deleteBlogPostAction}
                          fields={{ id: post.id }}
                          variant="outline"
                          size="sm"
                          confirm={`Delete "${post.title}"? This cannot be undone.`}
                        >
                          Delete
                        </ActionButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
