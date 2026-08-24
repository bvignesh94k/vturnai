import type { Metadata } from "next";
import { ShieldIcon, UsersIcon } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddGrantForm, BulkGrantForm, PromoteAdminForm } from "@/app/admin/team/grant-forms";
import { revokeAdminGrantAction, setPlatformRoleAction } from "@/app/admin/team/actions";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Team access", robots: { index: false, follow: false } };

export default async function AdminTeamPage() {
  const { user } = await requirePlatformAdmin();

  const supabase = createServiceRoleClient();
  const [{ data: admins }, { data: grants }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, created_at")
      .eq("platform_role", "admin")
      .order("created_at", { ascending: true }),
    supabase
      .from("admin_grants")
      .select("id, email, resource, created_at")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <ShieldIcon className="size-3.5" /> Admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Team access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Full admins see everything, including billing and system metrics. A resource grant opens
          only that one section, so a writer or a sales hire never sees the rest of the panel.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform admins</CardTitle>
          <CardDescription>Full access to every admin section, including this one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          <PromoteAdminForm />
          <div className="divide-y rounded-lg border">
            {(admins ?? []).map((admin) => (
              <div key={admin.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{admin.full_name ?? admin.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
                </div>
                <ActionButton
                  action={setPlatformRoleAction}
                  fields={{ profileId: admin.id, role: "user" }}
                  variant="outline"
                  size="sm"
                  confirm={
                    admin.id === user.id
                      ? "Remove your own admin access? You will need another admin to restore it."
                      : `Remove admin access for ${admin.email}?`
                  }
                >
                  Remove
                </ActionButton>
              </div>
            ))}
            {(admins ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No platform admins.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resource access</CardTitle>
          <CardDescription>
            Grant one section without full admin. The person does not need an account yet; the grant
            applies automatically once they sign up and sign in with this email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          <AddGrantForm />
          <div className="border-t pt-5">
            <p className="mb-3 text-sm font-medium">Bulk grant</p>
            <BulkGrantForm />
          </div>

          {(grants ?? []).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-0">Email</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead className="pr-0 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(grants ?? []).map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell className="pl-0 text-sm">{grant.email}</TableCell>
                    <TableCell>
                      <Badge variant="soft" className="capitalize">
                        {grant.resource}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(grant.created_at)}
                    </TableCell>
                    <TableCell className="pr-0 text-right">
                      <ActionButton
                        action={revokeAdminGrantAction}
                        fields={{ id: grant.id }}
                        variant="outline"
                        size="sm"
                        confirm={`Revoke ${grant.resource} access for ${grant.email}?`}
                      >
                        Revoke
                      </ActionButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UsersIcon className="size-4" /> No resource-scoped grants yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
