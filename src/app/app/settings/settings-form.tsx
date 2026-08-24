"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { updateProjectSettingsAction } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export interface SettingsValues {
  name: string;
  brandName: string;
  brandAliases: string;
  businessCategory: string;
  businessDescription: string;
  targetCountry: string;
  targetAudience: string;
  maxCrawlUrls: number;
  respectRobots: boolean;
  notificationEmail: boolean;
  notificationInApp: boolean;
}

export function SettingsForm({
  projectId,
  values,
  maxCrawlLimit,
  canWrite,
}: {
  projectId: string;
  values: SettingsValues;
  maxCrawlLimit: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [respectRobots, setRespectRobots] = React.useState(values.respectRobots);
  const [notificationEmail, setNotificationEmail] = React.useState(values.notificationEmail);
  const [notificationInApp, setNotificationInApp] = React.useState(values.notificationInApp);

  return (
    <form
      action={(formData) => {
        formData.set("projectId", projectId);
        formData.set("respectRobots", String(respectRobots));
        formData.set("notificationEmail", String(notificationEmail));
        formData.set("notificationInApp", String(notificationInApp));

        startTransition(async () => {
          const result = await updateProjectSettingsAction(formData);
          if (result.ok) {
            toast.success(result.message ?? "Settings saved.");
            router.refresh();
          } else {
            toast.error(result.error ?? "Could not save your settings.");
          }
        });
      }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project &amp; brand</CardTitle>
          <CardDescription>
            The brand name is what we look for in AI answers. Aliases widen the match without
            producing false positives.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 pt-0 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Project name</Label>
            <Input id="name" name="name" defaultValue={values.name} disabled={!canWrite} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="brandName">Brand name</Label>
            <Input
              id="brandName"
              name="brandName"
              defaultValue={values.brandName}
              disabled={!canWrite}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="brandAliases">Brand aliases</Label>
            <Input
              id="brandAliases"
              name="brandAliases"
              defaultValue={values.brandAliases}
              placeholder="Acme, Acme Tech, AcmeCRM"
              disabled={!canWrite}
            />
            <p className="text-xs text-muted-foreground">
              Comma separated. Add only names customers genuinely use: a loose alias inflates your
              mention rate and makes the number useless.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessCategory">Business category</Label>
            <Input
              id="businessCategory"
              name="businessCategory"
              defaultValue={values.businessCategory}
              disabled={!canWrite}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetCountry">Target country</Label>
            <Input
              id="targetCountry"
              name="targetCountry"
              defaultValue={values.targetCountry}
              maxLength={2}
              disabled={!canWrite}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="targetAudience">Target audience</Label>
            <Input
              id="targetAudience"
              name="targetAudience"
              defaultValue={values.targetAudience}
              disabled={!canWrite}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="businessDescription">Business description</Label>
            <Textarea
              id="businessDescription"
              name="businessDescription"
              defaultValue={values.businessDescription}
              rows={3}
              disabled={!canWrite}
            />
            <p className="text-xs text-muted-foreground">
              Used to generate prompt suggestions. Write it the way you would explain it to a
              customer.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crawling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          <div className="space-y-2">
            <Label htmlFor="maxCrawlUrls">Maximum URLs per audit</Label>
            <Input
              id="maxCrawlUrls"
              name="maxCrawlUrls"
              type="number"
              min={10}
              max={maxCrawlLimit}
              defaultValue={values.maxCrawlUrls}
              disabled={!canWrite}
              className="max-w-40"
            />
            <p className="text-xs text-muted-foreground">
              Your plan allows up to {maxCrawlLimit.toLocaleString("en-IN")}. Lowering this makes
              audits faster on large sites.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Respect robots.txt</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Keep this on. Turning it off only makes sense on a site you own where robots.txt
                blocks a section you genuinely need audited.
              </p>
            </div>
            <Switch
              checked={respectRobots}
              onCheckedChange={setRespectRobots}
              disabled={!canWrite}
              aria-label="Respect robots.txt"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
          <CardDescription>
            Audit complete, AI scan complete, visibility drops, new critical issues, trial expiry,
            payment failures and reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <p className="text-sm font-medium">In-app notifications</p>
            <Switch
              checked={notificationInApp}
              onCheckedChange={setNotificationInApp}
              disabled={!canWrite}
              aria-label="In-app notifications"
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Only sent when an email provider is configured on the deployment.
              </p>
            </div>
            <Switch
              checked={notificationEmail}
              onCheckedChange={setNotificationEmail}
              disabled={!canWrite}
              aria-label="Email notifications"
            />
          </div>
        </CardContent>
      </Card>

      {canWrite ? (
        <div className="flex justify-end">
          <Button type="submit" variant="gradient" size="lg" disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            Save settings
          </Button>
        </div>
      ) : null}
    </form>
  );
}
