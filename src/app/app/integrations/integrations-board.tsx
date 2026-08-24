"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PlugIcon,
  RefreshCwIcon,
  SettingsIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  connectAnalyticsAction,
  connectBingAction,
  connectGoogleAction,
  disconnectIntegrationAction,
  selectSearchConsoleSiteAction,
  syncIntegrationAction,
} from "@/app/app/integrations/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IntegrationCard } from "@/app/app/integrations/page";
import type { ActionResult } from "@/app/app/actions";
import { relativeTime } from "@/lib/utils";

const STATUS_META = {
  connected: { label: "Connected", variant: "success", icon: CheckCircle2Icon },
  not_connected: { label: "Not connected", variant: "muted", icon: PlugIcon },
  configuration_required: { label: "Configuration required", variant: "warning", icon: SettingsIcon },
  error: { label: "Error", variant: "destructive", icon: XCircleIcon },
} as const;

export function IntegrationsBoard({
  projectId,
  searchCards,
  engineCards,
  canWrite,
  hasGoogleAccount,
  selectedSearchConsoleSite,
}: {
  projectId: string;
  searchCards: readonly IntegrationCard[];
  engineCards: readonly IntegrationCard[];
  canWrite: boolean;
  hasGoogleAccount: boolean;
  selectedSearchConsoleSite: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [expanded, setExpanded] = React.useState<string | null>(null);

  function run(action: (formData: FormData) => Promise<ActionResult>, formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        if (result.message) toast.success(result.message);
        setExpanded(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Search &amp; analytics
        </h3>
        <div className="space-y-3">
          {searchCards.map((card) => {
            const meta = STATUS_META[card.status];
            const Icon = meta.icon;

            return (
              <Card key={card.provider}>
                <CardContent className="px-5 py-4">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <p className="text-sm font-semibold">{card.name}</p>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {card.description}
                      </p>
                      {card.displayName ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {card.displayName}
                          {card.lastSyncedAt ? ` · Synced ${relativeTime(card.lastSyncedAt)}` : ""}
                        </p>
                      ) : null}
                      {card.statusMessage ? (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-[color-mix(in_oklch,var(--warning)_80%,var(--foreground))]">
                          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                          {card.statusMessage}
                        </p>
                      ) : null}
                    </div>

                    {canWrite ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {card.canSync ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              const formData = new FormData();
                              formData.set("projectId", projectId);
                              formData.set("provider", card.provider);
                              run(syncIntegrationAction, formData);
                            }}
                          >
                            <RefreshCwIcon /> Sync now
                          </Button>
                        ) : null}

                        {card.kind === "oauth" && card.status !== "connected" ? (
                          <form action={connectGoogleAction}>
                            <input type="hidden" name="projectId" value={projectId} />
                            <input
                              type="hidden"
                              name="integration"
                              value={card.provider === "google_analytics" ? "analytics" : "search_console"}
                            />
                            <Button type="submit" variant="gradient" size="sm" disabled={pending}>
                              Connect
                            </Button>
                          </form>
                        ) : null}

                        {card.kind === "api_key" && card.status !== "connected" ? (
                          <Button
                            variant="gradient"
                            size="sm"
                            onClick={() => setExpanded(expanded === card.provider ? null : card.provider)}
                          >
                            Connect
                          </Button>
                        ) : null}

                        {card.status === "connected" && card.kind !== "server_key" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              if (!window.confirm(`Disconnect ${card.name}?`)) return;
                              const formData = new FormData();
                              formData.set("projectId", projectId);
                              formData.set("provider", card.provider);
                              run(disconnectIntegrationAction, formData);
                            }}
                          >
                            Disconnect
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* Search Console property picker */}
                  {card.provider === "google_search_console" &&
                  hasGoogleAccount &&
                  canWrite &&
                  !selectedSearchConsoleSite ? (
                    <SearchConsoleSitePicker
                      projectId={projectId}
                      pending={pending}
                      onSubmit={(siteUrl) => {
                        const formData = new FormData();
                        formData.set("projectId", projectId);
                        formData.set("siteUrl", siteUrl);
                        run(selectSearchConsoleSiteAction, formData);
                      }}
                    />
                  ) : null}

                  {/* Bing API key form */}
                  {expanded === "bing_webmaster" && card.provider === "bing_webmaster" ? (
                    <form
                      action={(formData) => {
                        formData.set("projectId", projectId);
                        run(connectBingAction, formData);
                      }}
                      className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="bing-site">Verified site URL</Label>
                        <Input id="bing-site" name="siteUrl" required placeholder="https://yourdomain.com" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bing-key">API key (optional)</Label>
                        <Input
                          id="bing-key"
                          name="apiKey"
                          type="password"
                          placeholder="Leave blank to use the deployment key"
                          autoComplete="off"
                        />
                      </div>
                      <Button type="submit" variant="gradient" disabled={pending}>
                        {pending ? <Loader2Icon className="animate-spin" /> : null}
                        Connect
                      </Button>
                      <p className="text-xs text-muted-foreground sm:col-span-3">
                        Generate a key in Bing Webmaster Tools under Settings → API access. It is
                        encrypted before storage and never returned to the browser.
                      </p>
                    </form>
                  ) : null}

                  {/* GA4 property form */}
                  {card.provider === "google_analytics" &&
                  card.status === "not_connected" &&
                  canWrite ? (
                    <form
                      action={(formData) => {
                        formData.set("projectId", projectId);
                        run(connectAnalyticsAction, formData);
                      }}
                      className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="ga4-property">GA4 property ID</Label>
                        <Input id="ga4-property" name="propertyId" required placeholder="123456789" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ga4-name">Label (optional)</Label>
                        <Input id="ga4-name" name="propertyName" placeholder="Main website" />
                      </div>
                      <Button type="submit" variant="outline" disabled={pending}>
                        Save property
                      </Button>
                      <p className="text-xs text-muted-foreground sm:col-span-3">
                        Connect the Google account above first, then enter the numeric property ID
                        from GA4 Admin → Property Settings.
                      </p>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          AI engines
        </h3>
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          AI provider keys are configured at the deployment level, not per account, so no customer
          ever handles a provider secret. An engine without a key reports as unavailable and shows no
          data. We never estimate a figure to fill the gap.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {engineCards.map((card) => {
            const meta = STATUS_META[card.status];
            const Icon = meta.icon;
            return (
              <Card key={card.provider}>
                <CardContent className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-semibold">{card.name}</p>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{card.vendor}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {card.description}
                  </p>
                  {card.statusMessage ? (
                    <p className="mt-2 text-xs text-[color-mix(in_oklch,var(--warning)_80%,var(--foreground))]">
                      {card.statusMessage}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SearchConsoleSitePicker({
  projectId,
  pending,
  onSubmit,
}: {
  projectId: string;
  pending: boolean;
  onSubmit: (siteUrl: string) => void;
}) {
  const [sites, setSites] = React.useState<Array<{ siteUrl: string; permissionLevel: string }> | null>(
    null,
  );
  // Starts true: the fetch below begins immediately on mount, so there is no
  // frame where the picker is idle and not loading.
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/integrations/google/sites?projectId=${projectId}`);
        const payload: unknown = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setError(
            typeof payload === "object" && payload !== null && "error" in payload
              ? String((payload as { error: unknown }).error)
              : "Could not list your Search Console properties.",
          );
          return;
        }
        setSites((payload as { sites: Array<{ siteUrl: string; permissionLevel: string }> }).sites);
      } catch {
        if (!cancelled) setError("Could not reach Search Console.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="mt-4 border-t pt-4">
      <Label htmlFor="gsc-site">Choose the property to track</Label>
      {loading ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> Loading your properties…
        </p>
      ) : error ? (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      ) : (sites ?? []).length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          This Google account has no verified Search Console properties.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="gsc-site" className="min-w-64 flex-1">
              <SelectValue placeholder="Select a property" />
            </SelectTrigger>
            <SelectContent>
              {(sites ?? []).map((site) => (
                <SelectItem key={site.siteUrl} value={site.siteUrl}>
                  {site.siteUrl}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="gradient"
            disabled={!selected || pending}
            onClick={() => onSubmit(selected)}
          >
            Use this property
          </Button>
        </div>
      )}
    </div>
  );
}
