import type { Metadata } from "next";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdminAccess } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import type { SubscriptionStatus } from "@/lib/db/types";

export const metadata: Metadata = { title: "Leads", robots: { index: false, follow: false } };

const STATUS_VARIANT: Record<SubscriptionStatus, "success" | "info" | "destructive" | "warning" | "muted"> = {
  created: "muted",
  authenticated: "muted",
  trialing: "info",
  active: "success",
  halted: "warning",
  paused: "warning",
  past_due: "destructive",
  cancelled: "destructive",
  expired: "destructive",
};

const FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Paying" },
  { value: "lost", label: "Lost" },
];

interface LeadRow {
  organizationId: string;
  companyName: string;
  brandName: string | null;
  domain: string | null;
  contactName: string | null;
  contactEmail: string;
  signedUpAt: string;
  status: SubscriptionStatus | null;
  trialEndsAt: string | null;
  planCode: string | null;
}

/**
 * Every organization is a lead by definition. There is no separate
 * contact-form capture on the marketing site yet, so signup is the only
 * source, and this view is simply that list joined to how each one is doing.
 */
export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminAccess("leads");
  const params = await searchParams;
  const activeFilter = typeof params.status === "string" ? params.status : "all";

  const supabase = createServiceRoleClient();

  const [{ data: organizations }, { data: profiles }, { data: projects }, { data: subscriptions }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, owner_id, billing_email, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("profiles").select("id, email, full_name").limit(5000),
      supabase.from("projects").select("organization_id, brand_name, domain").limit(2000),
      supabase
        .from("subscriptions")
        .select("organization_id, status, plan_code, trial_end, created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

  const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));
  const projectByOrg = new Map<string, { brand_name: string; domain: string }>();
  for (const project of projects ?? []) {
    if (!projectByOrg.has(project.organization_id)) {
      projectByOrg.set(project.organization_id, project);
    }
  }
  // Latest subscription per organization: rows arrive newest-first already.
  const subscriptionByOrg = new Map<string, NonNullable<typeof subscriptions>[number]>();
  for (const subscription of subscriptions ?? []) {
    if (!subscriptionByOrg.has(subscription.organization_id)) {
      subscriptionByOrg.set(subscription.organization_id, subscription);
    }
  }

  const leads: LeadRow[] = (organizations ?? []).map((org) => {
    const owner = profileById.get(org.owner_id);
    const project = projectByOrg.get(org.id);
    const subscription = subscriptionByOrg.get(org.id);
    return {
      organizationId: org.id,
      companyName: org.name,
      brandName: project?.brand_name ?? null,
      domain: project?.domain ?? null,
      contactName: owner?.full_name ?? null,
      contactEmail: owner?.email ?? org.billing_email ?? "Unknown",
      signedUpAt: org.created_at,
      status: (subscription?.status as SubscriptionStatus | undefined) ?? null,
      trialEndsAt: subscription?.trial_end ?? null,
      planCode: subscription?.plan_code ?? null,
    };
  });

  const filtered = leads.filter((lead) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "active") return lead.status === "active";
    if (activeFilter === "trialing") return lead.status === "trialing";
    if (activeFilter === "lost") {
      return lead.status === "cancelled" || lead.status === "expired" || lead.status === "past_due";
    }
    return true;
  });

  const counts = {
    all: leads.length,
    trialing: leads.filter((lead) => lead.status === "trialing").length,
    active: leads.filter((lead) => lead.status === "active").length,
    lost: leads.filter(
      (lead) => lead.status === "cancelled" || lead.status === "expired" || lead.status === "past_due",
    ).length,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <UsersIcon className="size-3.5" /> Admin
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every account that has ever signed up, joined to how the subscription is doing right now.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "all" ? "/admin/leads" : `/admin/leads?status=${filter.value}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              activeFilter === filter.value
                ? "border-primary bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {filter.label}{" "}
            <span className="tabular-nums">{counts[filter.value as keyof typeof counts]}</span>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="px-0 py-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<UsersIcon className="size-5" />}
              title="No leads in this view"
              description="Signups will appear here as soon as someone creates an account."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="pr-5 text-right">Signed up</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => (
                  <TableRow key={lead.organizationId}>
                    <TableCell className="pl-5">
                      <p className="text-sm font-medium">{lead.brandName ?? lead.companyName}</p>
                      {lead.domain ? (
                        <p className="text-xs text-muted-foreground">{lead.domain}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{lead.contactName ?? "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{lead.contactEmail}</p>
                    </TableCell>
                    <TableCell>
                      {lead.status ? (
                        <Badge variant={STATUS_VARIANT[lead.status]} className="capitalize">
                          {lead.status.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <Badge variant="muted">No subscription</Badge>
                      )}
                      {lead.status === "trialing" && lead.trialEndsAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Trial ends {formatDateTime(lead.trialEndsAt)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm capitalize text-muted-foreground">
                      {lead.planCode ?? "None"}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-xs text-muted-foreground">
                      {relativeTime(lead.signedUpAt)}
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
