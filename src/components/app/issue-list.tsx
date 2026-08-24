import * as React from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/app/copy-button";
import type { IssueSeverityDb, DisciplineDb, EffortLevelDb } from "@/lib/db/types";
import { truncate } from "@/lib/utils";

export interface IssueView {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: IssueSeverityDb;
  disciplines: DisciplineDb[];
  whyItMatters: string;
  seoImpact: string | null;
  aeoImpact: string | null;
  geoImpact: string | null;
  recommendation: string;
  implementationExample: string | null;
  effort: EffortLevelDb;
  affectedUrls: string[];
}

export const SEVERITY_VARIANT: Record<IssueSeverityDb, "destructive" | "warning" | "info" | "muted"> = {
  critical: "destructive",
  high: "warning",
  medium: "info",
  low: "muted",
  information: "muted",
};

const EFFORT_LABEL: Record<EffortLevelDb, string> = {
  easy: "Easy",
  moderate: "Moderate",
  advanced: "Advanced",
};

/**
 * The expandable issue row.
 *
 * Every issue shows why it matters, its impact on each discipline, the exact
 * recommendation and a copyable implementation example, the difference between
 * a finding a user can act on and one they will ignore.
 */
export function IssueList({ issues }: { issues: readonly IssueView[] }) {
  return (
    <ul className="space-y-2">
      {issues.map((issue) => (
        <li key={issue.id} className="card-elevated overflow-hidden rounded-xl border bg-card">
          <details className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-secondary/40">
              <Badge variant={SEVERITY_VARIANT[issue.severity]} className="shrink-0 capitalize">
                {issue.severity}
              </Badge>
              <span className="min-w-0 flex-1 text-sm font-medium">{issue.title}</span>
              <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                {issue.disciplines.map((discipline) => (
                  <Badge key={discipline} variant="soft" className="uppercase">
                    {discipline}
                  </Badge>
                ))}
                <Badge variant="outline">{EFFORT_LABEL[issue.effort]}</Badge>
                {issue.affectedUrls.length > 0 ? (
                  <Badge variant="muted">
                    {issue.affectedUrls.length} page{issue.affectedUrls.length === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </span>
            </summary>

            <div className="space-y-5 border-t px-5 py-5">
              <p className="text-sm leading-relaxed text-muted-foreground">{issue.description}</p>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Why it matters
                </h4>
                <p className="mt-1.5 text-sm leading-relaxed">{issue.whyItMatters}</p>
              </div>

              {issue.seoImpact || issue.aeoImpact || issue.geoImpact ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "SEO impact", value: issue.seoImpact },
                    { label: "AEO impact", value: issue.aeoImpact },
                    { label: "GEO impact", value: issue.geoImpact },
                  ]
                    .filter((entry) => entry.value)
                    .map((entry) => (
                      <div key={entry.label} className="rounded-lg border bg-secondary/40 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {entry.label}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">{entry.value}</p>
                      </div>
                    ))}
                </div>
              ) : null}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What to do
                </h4>
                <p className="mt-1.5 text-sm leading-relaxed">{issue.recommendation}</p>
              </div>

              {issue.implementationExample ? (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Example
                    </h4>
                    <CopyButton value={issue.implementationExample} label="Copy example" />
                  </div>
                  <pre className="scrollbar-thin mt-2 overflow-x-auto rounded-lg border bg-secondary/50 p-3 text-xs leading-relaxed">
                    <code>{issue.implementationExample}</code>
                  </pre>
                </div>
              ) : null}

              {issue.affectedUrls.length > 0 ? (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Affected pages
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {issue.affectedUrls.slice(0, 15).map((url) => (
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
                      </li>
                    ))}
                  </ul>
                  {issue.affectedUrls.length > 15 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      …and {issue.affectedUrls.length - 15} more.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
