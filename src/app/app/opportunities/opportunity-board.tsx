"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ExternalLinkIcon, EyeOffIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { updateOpportunityStatusAction } from "@/app/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/app/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PRIORITY_BAND_LABELS, priorityBand } from "@/lib/metrics/opportunity-priority";
import type { DisciplineDb, EffortLevelDb, IssueSeverityDb, OpportunityStatus } from "@/lib/db/types";
import { formatDate, round, truncate } from "@/lib/utils";

export interface OpportunityView {
  id: string;
  title: string;
  type: string;
  disciplines: DisciplineDb[];
  severity: IssueSeverityDb;
  expectedImpact: string;
  effort: EffortLevelDb;
  priorityScore: number;
  priorityComponents: Array<{ key: string; label: string; weight: number; value: number; contribution: number }>;
  affectedUrls: string[];
  affectedPageCount: number;
  explanation: string;
  recommendation: string;
  implementationGuidance: string | null;
  status: OpportunityStatus;
  createdAt: string;
  completedAt: string | null;
}

const STATUS_TABS: Array<{ value: OpportunityStatus | "all"; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "ignored", label: "Ignored" },
  { value: "all", label: "All" },
];

const EFFORT_LABEL: Record<EffortLevelDb, string> = {
  easy: "Easy",
  moderate: "Moderate",
  advanced: "Advanced",
};

export function OpportunityBoard({
  projectId,
  opportunities,
  canWrite,
  provenance,
}: {
  projectId: string;
  opportunities: readonly OpportunityView[];
  canWrite: boolean;
  /** How each affected page was discovered, keyed by URL. */
  provenance: Record<string, string>;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<OpportunityStatus | "all">("open");
  const [pending, startTransition] = React.useTransition();

  const visible = opportunities.filter((entry) => (tab === "all" ? true : entry.status === tab));

  function setStatus(opportunityId: string, status: OpportunityStatus) {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("opportunityId", opportunityId);
    formData.set("status", status);

    startTransition(async () => {
      const result = await updateOpportunityStatusAction(formData);
      if (result.ok) {
        toast.success(
          status === "completed"
            ? "Marked complete. Re-run an audit to confirm the fix."
            : status === "ignored"
              ? "Hidden from your list."
              : "Status updated.",
        );
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not update that opportunity.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as OpportunityStatus | "all")}>
        <TabsList>
          {STATUS_TABS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label} (
              {entry.value === "all"
                ? opportunities.length
                : opportunities.filter((item) => item.status === entry.value).length}
              )
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <EmptyState
          title={tab === "open" ? "Nothing open" : "Nothing here"}
          description={
            tab === "open"
              ? "You have worked through the list. Run a fresh audit to find what changed."
              : "No opportunities in this state."
          }
        />
      ) : (
        <ol className="space-y-3">
          {visible.map((opportunity, index) => {
            const band = priorityBand(opportunity.priorityScore);
            return (
              <li
                key={opportunity.id}
                className="card-elevated overflow-hidden rounded-xl border bg-card"
              >
                <details open={tab === "open" && index === 0} className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-start gap-3 px-5 py-4 transition-colors hover:bg-secondary/40">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={`mt-0.5 flex size-10 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] font-semibold ${
                            band === "urgent"
                              ? "bg-[color-mix(in_oklch,var(--destructive)_14%,transparent)] text-destructive"
                              : band === "high"
                                ? "bg-[color-mix(in_oklch,var(--warning)_18%,transparent)] text-[color-mix(in_oklch,var(--warning)_80%,var(--foreground))]"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          <span className="text-sm tabular-nums">
                            {round(opportunity.priorityScore, 0)}
                          </span>
                          <span className="text-[8px] uppercase">score</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="w-72">
                        <p className="mb-1.5 font-medium">How this priority was calculated</p>
                        <ul className="space-y-0.5">
                          {opportunity.priorityComponents.map((component) => (
                            <li key={component.key} className="flex justify-between gap-3">
                              <span>{component.label}</span>
                              <span className="tabular-nums">
                                {round(component.value, 0)} × {Math.round(component.weight * 100)}% ={" "}
                                {round(component.contribution, 1)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{opportunity.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {opportunity.expectedImpact}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={
                            band === "urgent" ? "destructive" : band === "high" ? "warning" : "muted"
                          }
                        >
                          {PRIORITY_BAND_LABELS[band]}
                        </Badge>
                        <Badge variant="outline">{EFFORT_LABEL[opportunity.effort]}</Badge>
                        {opportunity.disciplines.map((discipline) => (
                          <Badge key={discipline} variant="soft" className="uppercase">
                            {discipline}
                          </Badge>
                        ))}
                        {opportunity.affectedPageCount > 0 ? (
                          <Badge variant="muted">
                            {opportunity.affectedPageCount} page
                            {opportunity.affectedPageCount === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </summary>

                  <div className="space-y-5 border-t px-5 py-5">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Why this matters
                      </h4>
                      <p className="mt-1.5 text-sm leading-relaxed">{opportunity.explanation}</p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          What to do
                        </h4>
                        <CopyButton value={opportunity.recommendation} label="Copy" />
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed">{opportunity.recommendation}</p>
                    </div>

                    {opportunity.implementationGuidance ? (
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            How to implement it
                          </h4>
                          <CopyButton value={opportunity.implementationGuidance} label="Copy" />
                        </div>
                        <pre className="scrollbar-thin mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border bg-secondary/50 p-3 text-xs leading-relaxed">
                          <code>{opportunity.implementationGuidance}</code>
                        </pre>
                      </div>
                    ) : null}

                    {opportunity.affectedUrls.length > 0 ? (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Affected pages
                        </h4>
                        <ul className="mt-2 space-y-1.5">
                          {opportunity.affectedUrls.slice(0, 10).map((url) => (
                            <li key={url}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                              >
                                {truncate(url.replace(/^https?:\/\//, ""), 80)}
                                <ExternalLinkIcon className="size-3 shrink-0" />
                              </a>
                              {/* How we found this page. Shown so a reader can
                                  verify the URL themselves rather than taking
                                  our word that it belongs to their site. */}
                              {provenance[url] ? (
                                <span className="block text-[11px] leading-snug text-muted-foreground">
                                  {provenance[url]}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                      <p className="mr-auto text-xs text-muted-foreground">
                        Created {formatDate(opportunity.createdAt)}
                        {opportunity.completedAt
                          ? ` · Completed ${formatDate(opportunity.completedAt)}`
                          : ""}
                      </p>

                      {canWrite ? (
                        <>
                          {opportunity.status !== "in_progress" && opportunity.status !== "completed" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => setStatus(opportunity.id, "in_progress")}
                            >
                              <PlayIcon /> Start
                            </Button>
                          ) : null}

                          {opportunity.status !== "completed" ? (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={pending}
                              onClick={() => setStatus(opportunity.id, "completed")}
                            >
                              <CheckIcon /> Mark complete
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => setStatus(opportunity.id, "open")}
                            >
                              <RotateCcwIcon /> Reopen
                            </Button>
                          )}

                          {opportunity.status !== "ignored" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => setStatus(opportunity.id, "ignored")}
                            >
                              <EyeOffIcon /> Ignore
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
