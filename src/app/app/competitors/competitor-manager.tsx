"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { addCompetitorAction, removeCompetitorAction } from "@/app/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CompetitorView {
  id: string;
  brandName: string;
  domain: string | null;
  siteUrl: string | null;
  notes: string | null;
}

export function CompetitorManager({
  projectId,
  competitors,
  limit,
  canWrite,
  activePrompts,
}: {
  projectId: string;
  competitors: readonly CompetitorView[];
  limit: number;
  canWrite: boolean;
  activePrompts: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const atLimit = competitors.length >= limit;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tracked competitors</CardTitle>
        <CardDescription>
          We look for these brand names in every AI answer across your {activePrompts} active prompt
          {activePrompts === 1 ? "" : "s"}. Use the name customers would actually say.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {competitors.length > 0 ? (
          <ul className="space-y-2">
            {competitors.map((competitor) => (
              <li
                key={competitor.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-secondary/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{competitor.brandName}</p>
                  {competitor.domain ? (
                    <p className="text-xs text-muted-foreground">{competitor.domain}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground/70">
                      No website. Citation matching is disabled for this competitor
                    </p>
                  )}
                </div>

                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${competitor.brandName}`}
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Stop tracking ${competitor.brandName}?`)) return;
                      const formData = new FormData();
                      formData.set("projectId", projectId);
                      formData.set("competitorId", competitor.id);
                      startTransition(async () => {
                        const result = await removeCompetitorAction(formData);
                        if (result.ok) {
                          toast.success(result.message ?? "Competitor removed.");
                          router.refresh();
                        } else {
                          toast.error(result.error ?? "Could not remove that competitor.");
                        }
                      });
                    }}
                  >
                    <Trash2Icon className="text-muted-foreground" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No competitors tracked yet. Adding them is what turns mention counts into share of voice.
          </p>
        )}

        {canWrite ? (
          atLimit ? (
            <Badge variant="muted">
              You are tracking the maximum of {limit} competitors on your plan.
            </Badge>
          ) : (
            <form
              action={(formData) => {
                formData.set("projectId", projectId);
                startTransition(async () => {
                  const result = await addCompetitorAction(formData);
                  if (result.ok) {
                    toast.success(result.message ?? "Competitor added.");
                    router.refresh();
                  } else {
                    toast.error(result.error ?? "Could not add that competitor.");
                  }
                });
              }}
              className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            >
              <div className="space-y-2">
                <Label htmlFor="brandName">Competitor name</Label>
                <Input id="brandName" name="brandName" required minLength={2} placeholder="Acme Rival" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="siteUrl">Website (optional)</Label>
                <Input id="siteUrl" name="siteUrl" placeholder="rival.com" />
              </div>
              <Button type="submit" variant="outline" disabled={pending}>
                {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                Add
              </Button>
            </form>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
