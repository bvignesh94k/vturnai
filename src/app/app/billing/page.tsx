import type { Metadata } from "next";
import { CreditCardIcon, InfoIcon } from "lucide-react";
import { BillingPanel } from "@/app/app/billing/billing-panel";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadPageContext } from "@/lib/data/project-context";
import { buildUsageLines, getEstimatedSpendUsd } from "@/lib/billing/usage";
import { isRazorpayConfigured } from "@/lib/billing/razorpay";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currentUsagePeriod } from "@/lib/metrics/usage";
import { formatCurrencyINR, formatDate, formatDateTime, round } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

const STATUS_LABEL: Record<string, string> = {
  none: "No subscription",
  created: "Awaiting authorisation",
  authenticated: "Mandate registered",
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  halted: "Halted",
  paused: "Paused",
  cancelled: "Cancelled",
  expired: "Expired",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, entitlements } = await loadPageContext(searchParams);
  const supabase = await createServerSupabaseClient();

  const [usage, spendUsd, { data: events }] = await Promise.all([
    buildUsageLines(context.activeOrganization.id, entitlements.limits),
    getEstimatedSpendUsd(context.activeOrganization.id),
    supabase
      .from("billing_events")
      .select("*")
      .eq("organization_id", context.activeOrganization.id)
      .order("occurred_at", { ascending: false })
      .limit(25),
  ]);

  const period = currentUsagePeriod();
  const isBillingAdmin = ["owner", "admin"].includes(context.activeRole);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Your plan, what you have used this month, and your payment history."
      />

      {!isRazorpayConfigured() ? (
        <Alert variant="warning">
          <InfoIcon />
          <AlertTitle>Billing is not configured on this deployment</AlertTitle>
          <AlertDescription>
            Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET and the plan id to
            enable subscriptions.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Plan status */}
      <Card>
        <CardContent className="px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CreditCardIcon className="size-4 text-primary" />
                <p className="text-sm font-semibold">{entitlements.planName}</p>
                <Badge
                  variant={
                    entitlements.isActive
                      ? entitlements.isTrialing
                        ? "info"
                        : "success"
                      : "destructive"
                  }
                >
                  {STATUS_LABEL[entitlements.status] ?? entitlements.status}
                </Badge>
              </div>

              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {formatCurrencyINR(entitlements.priceMinor)}
                <span className="text-base font-normal text-muted-foreground">/month</span>
              </p>

              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                {entitlements.isTrialing && entitlements.trialEndsAt ? (
                  <p>
                    Trial ends {formatDate(entitlements.trialEndsAt)} —{" "}
                    {entitlements.daysRemainingInTrial} day
                    {entitlements.daysRemainingInTrial === 1 ? "" : "s"} left. Your first payment is
                    collected then.
                  </p>
                ) : null}
                {entitlements.currentPeriodEnd && !entitlements.isTrialing ? (
                  <p>
                    {entitlements.cancelAtPeriodEnd ? "Access ends" : "Renews"}{" "}
                    {formatDate(entitlements.currentPeriodEnd)}
                  </p>
                ) : null}
                {entitlements.subscription?.last_verified_at ? (
                  <p className="text-xs">
                    Status verified with Razorpay {formatDateTime(entitlements.subscription.last_verified_at)}
                  </p>
                ) : null}
              </div>

              {!entitlements.isActive && entitlements.blockedReason ? (
                <p className="mt-3 max-w-md text-sm text-destructive">{entitlements.blockedReason}</p>
              ) : null}
            </div>

            <BillingPanel
              status={entitlements.status}
              isActive={entitlements.isActive}
              isTrialing={entitlements.isTrialing}
              cancelAtPeriodEnd={entitlements.cancelAtPeriodEnd}
              canManage={isBillingAdmin}
              razorpayConfigured={isRazorpayConfigured()}
              publicKeyId={process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() ?? ""}
              organizationName={context.activeOrganization.name}
              email={context.user.email}
              planName={entitlements.planName}
              priceMinor={entitlements.priceMinor}
              trialDays={entitlements.trialDays}
            />
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage this month</CardTitle>
          <CardDescription>
            Period {period.key}. Limits are enforced on the server — an action that would exceed one
            is refused before any provider is called.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {usage.map((line) => (
            <div key={line.metric}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{line.label}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {line.used.toLocaleString("en-IN")}
                  {line.limit === null ? " (no limit)" : ` / ${line.limit.toLocaleString("en-IN")}`}
                  {line.state === "warning" ? (
                    <Badge variant="warning" className="ml-2">
                      {line.percentUsed}%
                    </Badge>
                  ) : line.state === "exhausted" ? (
                    <Badge variant="destructive" className="ml-2">
                      Limit reached
                    </Badge>
                  ) : null}
                </p>
              </div>
              {line.limit !== null ? (
                <Progress
                  value={line.percentUsed ?? 0}
                  className="mt-1.5 h-1.5"
                  indicatorClassName={
                    line.state === "exhausted"
                      ? "bg-destructive"
                      : line.state === "warning"
                        ? "bg-[var(--warning)]"
                        : undefined
                  }
                />
              ) : null}
            </div>
          ))}

          <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            Estimated AI provider spend this month:{" "}
            <span className="font-medium text-foreground">${round(spendUsd, 2)}</span>. This is our
            cost of running your scans, shown for transparency — it is not billed to you.
          </p>
        </CardContent>
      </Card>

      {/* Plan limits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What your plan includes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Website projects", value: entitlements.limits.projects },
              { label: "Crawled URLs per audit", value: entitlements.limits.crawledUrls },
              { label: "Active AI prompts", value: entitlements.limits.activePrompts },
              { label: "Tracked competitors", value: entitlements.limits.competitors },
              { label: "Scheduled AI scans / month", value: entitlements.limits.scheduledAiScansPerMonth },
              { label: "Manual AI scans / month", value: entitlements.limits.manualAiScansPerMonth },
              { label: "Website audits / month", value: entitlements.limits.websiteAuditsPerMonth },
              { label: "PageSpeed checks / month", value: entitlements.limits.pagespeedRunsPerMonth },
              { label: "Reports / month", value: entitlements.limits.reportsPerMonth },
            ].map((entry) => (
              <div key={entry.label}>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {entry.label}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {entry.value.toLocaleString("en-IN")}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Billing history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing history</CardTitle>
          <CardDescription>
            Every subscription and payment event we received from Razorpay.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {(events ?? []).length === 0 ? (
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
                {(events ?? []).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="pl-5 text-sm">{event.event_type}</TableCell>
                    <TableCell className="text-sm capitalize text-muted-foreground">
                      {event.status ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {event.amount_minor ? formatCurrencyINR(event.amount_minor) : "—"}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-xs text-muted-foreground">
                      {formatDateTime(event.occurred_at)}
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
