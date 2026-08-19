import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { SettingsForm } from "@/app/app/settings/settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/app/sign-out-button";
import { loadPageContext } from "@/lib/data/project-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SITE } from "@/lib/config/site";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, project, entitlements, canWrite } = await loadPageContext(searchParams);
  const supabase = await createServerSupabaseClient();

  const { data: settings } = await supabase
    .from("project_settings")
    .select("*")
    .eq("project_id", project.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="How we crawl your site, what we call your brand, and when we notify you."
      />

      <SettingsForm
        projectId={project.id}
        canWrite={canWrite}
        maxCrawlLimit={entitlements.limits.crawledUrls}
        values={{
          name: project.name,
          brandName: project.brand_name,
          brandAliases: project.brand_aliases.join(", "),
          businessCategory: project.business_category ?? "",
          businessDescription: project.business_description ?? "",
          targetCountry: project.target_country,
          targetAudience: project.target_audience ?? "",
          maxCrawlUrls: settings?.max_crawl_urls ?? entitlements.limits.crawledUrls,
          respectRobots: settings?.respect_robots ?? true,
          notificationEmail: settings?.notification_email ?? true,
          notificationInApp: settings?.notification_in_app ?? true,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your account</CardTitle>
          <CardDescription>Details of the person signed in right now.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              { label: "Name", value: context.user.profile.full_name ?? "Not set" },
              { label: "Email", value: context.user.email },
              { label: "Workspace", value: context.activeOrganization.name },
              { label: "Your role", value: context.activeRole },
              { label: "Member since", value: formatDate(context.user.profile.created_at) },
              {
                label: "Marketing email",
                value: context.user.profile.marketing_opt_in ? "Subscribed" : "Not subscribed",
              },
            ].map((entry) => (
              <div key={entry.label}>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {entry.label}
                </dt>
                <dd className="mt-1 text-sm capitalize">{entry.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 border-t pt-4">
            <SignOutButton variant="outline" size="sm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How we crawl your site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0 text-sm leading-relaxed text-muted-foreground">
          <p>
            Our crawler identifies itself as{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{SITE.crawlerToken}</code>{" "}
            and sends the user agent{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{SITE.crawlerUserAgent}</code>.
          </p>
          <p>
            It respects robots.txt by default, honours crawl-delay, requests pages at controlled
            concurrency, and only ever reads publicly accessible content. It never submits forms,
            never signs in, and never modifies anything on your site.
          </p>
          <p>
            Requests to private networks, loopback addresses and cloud metadata endpoints are blocked,
            and DNS is validated before every fetch.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
