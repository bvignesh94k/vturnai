import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, ShieldIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getProviderStatuses } from "@/lib/ai-engines/registry";
import { PLANS } from "@/lib/config/plans";
import { currentUsagePeriod } from "@/lib/metrics/usage";
import { formatCurrencyINR, formatDateTime, relativeTime, round, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  // Role-based: a normal user is redirected before any admin data is read.
  await requirePlatformAdmin();

  const supabase = createServiceRoleClient();
  const period = currentUsagePeriod();

  const [
    { count: userCount },
    { count: projectCount },
    { data: subscriptions },
    { data: usageEvents },
    { data: failedJobs },
    { data: systemErrors },
    { data: planConfigs },
    { data: recentBilling },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("subscriptions").select("status, plan_code, organization_id").limit(1000),
    supabase
      .from("usage_events")
      .select("metric, quantity, estimated_cost_usd, engine")
      .eq("period_key", period.key)
      .limit(5000),
    supabase
      .from("jobs")
      .select("id, job_type, project_id, attempts, last_error, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("system_errors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("plan_configurations").select("*").order("plan_code"),
    supabase
      .from("billing_events")
      .select("event_type, amount_minor, status, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(15),
  ]);

  const statusCounts = new Map<string, number>();
  for (const subscription of subscriptions ?? []) {
    statusCounts.set(subscription.status, (statusCounts.get(subscription.status) ?? 0) + 1);
  }

  const usageByMetric = new Map<string, number>();
  const usageByEngine = new Map<string, number>();
  let estimatedSpend = 0;
  for (const event of usageEvents ?? []) {
    usageByMetric.set(event.metric, (usageByMetric.get(event.metric) ?? 0) + event.quantity);
    estimatedSpend += Number(event.estimated_cost_usd ?? 0);
    if (event.engine) {
      usageByEngine.set(event.engine, (usageByEngine.get(event.engine) ?? 0) + event.quantity);
    }
  }

  const activeSubscriptions =
    (statusCounts.get("active") ?? 0) + (statusCounts.get("trialing") ?? 0);
  const mrrMinor = (statusCounts.get("active") ?? 0) * PLANS.pro.priceMinor;

  const providerStatuses = getProviderStatuses();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <ShieldIcon className="size-3.5" /> Platform admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">System overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Usage period {period.key}. All figures read directly from the database.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/app">
            <ArrowLeftIcon /> Back to app
          </Link>
        </Button>
      </div>

      {/* Headline numbers */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Users", value: (userCount ?? 0).toLocaleString("en-IN") },
          { label: "Active projects", value: (projectCount ?? 0).toLocaleString("en-IN") },
          { label: "Active + trialing", value: activeSubscriptions.toLocaleString("en-IN") },
          { label: "MRR (paying)", value: formatCurrencyINR(mrrMinor) },
          { label: "Est. AI spend (month)", value: `$${round(estimatedSpend, 2)}` },
        ].map((entry) => (
          <Card key={entry.label}>
            <CardContent className="px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {entry.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{entry.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscriptions by status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {[...statusCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <div key={status} className="flex items-center justify-between gap-3">
                  <Badge
                    variant={
                      status === "active"
                        ? "success"
                        : status === "trialing"
                          ? "info"
                          : ["past_due", "halted", "expired", "cancelled"].includes(status)
                            ? "destructive"
                            : "muted"
                    }
                    className="capitalize"
                  >
                    {status.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums">{count}</span>
                </div>
              ))}
            {statusCounts.size === 0 ? (
              <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* AI usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage this period</CardTitle>
            <CardDescription>Across every organization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {[...usageByMetric.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([metric, total]) => (
                <div key={metric} className="flex items-center justify-between gap-3">
                  <span className="text-sm capitalize text-muted-foreground">
                    {metric.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {total.toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
            {usageByEngine.size > 0 ? (
              <div className="border-t pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  By engine
                </p>
                {[...usageByEngine.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([engine, total]) => (
                    <div key={engine} className="flex items-center justify-between gap-3">
                      <span className="text-sm capitalize text-muted-foreground">{engine}</span>
                      <span className="text-sm tabular-nums">{total.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
              </div>
            ) : null}
            {usageByMetric.size === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded this period.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Provider status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI provider status</CardTitle>
          <CardDescription>
            Read from the deployment environment. An unconfigured provider reports as unavailable to
            every customer rather than returning estimated data.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {providerStatuses.map((status) => (
              <div
                key={status.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{status.name}</p>
                  {status.missingEnvKeys.length > 0 ? (
                    <p className="truncate text-xs text-muted-foreground">
                      Missing: {status.missingEnvKeys.join(", ")}
                    </p>
                  ) : null}
                </div>
                <Badge variant={status.configured ? "success" : "warning"}>
                  {status.configured ? "Configured" : "Unavailable"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Plan configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan configuration</CardTitle>
          <CardDescription>
            Limits and pricing are read from these rows at runtime, so they can be changed without a
            code deploy. Invalid or negative overrides fall back to the compiled defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Razorpay plan</TableHead>
                <TableHead className="pr-5">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(planConfigs ?? []).map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="pl-5">
                    <p className="text-sm font-medium">{plan.display_name}</p>
                    <p className="text-xs text-muted-foreground">{plan.plan_code}</p>
                  </TableCell>
                  <TableCell className="text-sm">{formatCurrencyINR(plan.price_minor)}</TableCell>
                  <TableCell className="text-sm">{plan.trial_days} days</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {plan.razorpay_plan_id ?? "Not set"}
                  </TableCell>
                  <TableCell className="pr-5">
                    <Badge variant={plan.is_active ? "success" : "muted"}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Failed jobs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Failed jobs</CardTitle>
          <CardDescription>Jobs that exhausted their retries.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {(failedJobs ?? []).length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No failed jobs.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Type</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="pr-5 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(failedJobs ?? []).map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="pl-5 text-sm">{job.job_type}</TableCell>
                    <TableCell className="tabular-nums text-sm">{job.attempts}</TableCell>
                    <TableCell className="max-w-md text-xs text-destructive">
                      {truncate(job.last_error ?? "", 160)}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-xs text-muted-foreground">
                      {relativeTime(job.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* System errors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System errors</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {(systemErrors ?? []).length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No system errors recorded.</p>
          ) : (
            <ul className="divide-y">
              {(systemErrors ?? []).map((error) => (
                <li key={error.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive" className="capitalize">
                      {error.severity}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{error.scope}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDateTime(error.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm">{truncate(error.message, 240)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Billing events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent billing events</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {(recentBilling ?? []).length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No billing events yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="pr-5 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recentBilling ?? []).map((event, index) => (
                  <TableRow key={`${event.event_type}-${event.occurred_at}-${index}`}>
                    <TableCell className="pl-5 text-sm">{event.event_type}</TableCell>
                    <TableCell className="text-sm capitalize text-muted-foreground">
                      {event.status ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {event.amount_minor ? formatCurrencyINR(event.amount_minor) : "—"}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-xs text-muted-foreground">
                      {relativeTime(event.occurred_at)}
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
