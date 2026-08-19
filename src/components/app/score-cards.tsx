import * as React from "react";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MetricInfo } from "@/components/ui/metric-info";
import { ScoreRing } from "@/components/app/score-ring";
import { METRIC_EXPLANATIONS } from "@/lib/config/metric-explanations";
import { HEO_WEIGHTS, scoreBand } from "@/lib/config/scoring";
import type { ScoreSnapshot } from "@/lib/data/dashboard";
import { cn, formatDateTime, round } from "@/lib/utils";

const SUB_SCORES = [
  { key: "seo", metric: "seoScore", label: "SEO", weight: HEO_WEIGHTS.seo },
  { key: "aeo", metric: "aeoScore", label: "AEO", weight: HEO_WEIGHTS.aeo },
  { key: "geo", metric: "geoScore", label: "GEO", weight: HEO_WEIGHTS.geo },
  { key: "heo", metric: "heoScore", label: "HEO", weight: null },
] as const;

/**
 * The score header: the V Score plus its four contributing disciplines.
 *
 * The HEO weighting is printed underneath, taken from the same config object the
 * calculation uses, so what the user reads is provably what we computed.
 */
export function ScoreCards({ snapshot }: { snapshot: ScoreSnapshot }) {
  const band = snapshot.vScore === null ? null : scoreBand(snapshot.vScore);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      {/* V Score */}
      <Card>
        <CardContent className="flex items-center gap-5 px-5 py-5">
          <ScoreRing value={snapshot.vScore} size={112} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold">V Score</p>
              <MetricInfo explanation={METRIC_EXPLANATIONS.vScore} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {snapshot.vScore === null
                ? "Run your first audit to get a score."
                : (band?.label ?? "")}
            </p>

            {snapshot.deltas.vScore !== null ? (
              <p
                className={cn(
                  "mt-2 flex items-center gap-1 text-xs font-medium",
                  snapshot.deltas.vScore > 0 ? "text-[var(--success)]" : "text-destructive",
                )}
              >
                {snapshot.deltas.vScore > 0 ? (
                  <TrendingUpIcon className="size-3.5" />
                ) : (
                  <TrendingDownIcon className="size-3.5" />
                )}
                {snapshot.deltas.vScore > 0 ? "+" : ""}
                {round(snapshot.deltas.vScore, 1)} pts
                <span className="font-normal text-muted-foreground">vs previous scan</span>
              </p>
            ) : null}

            {snapshot.capturedAt ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Measured {formatDateTime(snapshot.capturedAt)}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Sub-scores */}
      <Card>
        <CardContent className="px-5 py-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SUB_SCORES.map((entry) => {
              const value = snapshot[entry.key];
              const change = snapshot.deltas[entry.key];
              const entryBand = value === null ? null : scoreBand(value);

              return (
                <div key={entry.key}>
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {entry.label}
                    </p>
                    <MetricInfo
                      explanation={METRIC_EXPLANATIONS[entry.metric]}
                      side="bottom"
                    />
                  </div>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
                    {value === null ? "—" : round(value, 0)}
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${value ?? 0}%`,
                        backgroundColor:
                          entryBand === null
                            ? "var(--muted-foreground)"
                            : entryBand.tone === "success"
                              ? "var(--success)"
                              : entryBand.tone === "info"
                                ? "var(--info)"
                                : entryBand.tone === "warning"
                                  ? "var(--warning)"
                                  : "var(--destructive)",
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {entry.weight !== null ? `${Math.round(entry.weight * 100)}% of V Score` : "Unified"}
                    {change !== null ? ` · ${change > 0 ? "+" : ""}${round(change, 1)}` : ""}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="mt-5 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">
            V Score = SEO {Math.round(HEO_WEIGHTS.seo * 100)}% + AEO{" "}
            {Math.round(HEO_WEIGHTS.aeo * 100)}% + GEO {Math.round(HEO_WEIGHTS.geo * 100)}% +
            Experience &amp; Authority {Math.round(HEO_WEIGHTS.experienceAuthority * 100)}%
            {snapshot.experienceAuthority !== null
              ? ` · Experience & Authority ${round(snapshot.experienceAuthority, 0)}`
              : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
