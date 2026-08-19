import * as React from "react";
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MetricInfo } from "@/components/ui/metric-info";
import { Skeleton } from "@/components/ui/skeleton";
import { METRIC_EXPLANATIONS, type MetricKey } from "@/lib/config/metric-explanations";
import { cn, formatCompact, formatPercent, round } from "@/lib/utils";

export type DeltaDirection = "higher-is-better" | "lower-is-better";

/**
 * The KPI tile used across the product.
 *
 * Three rules it enforces: a metric always carries its explanation, an
 * unmeasured metric shows an em dash rather than a zero, and a delta is only
 * rendered when there is a genuine baseline to compare against.
 */
export function MetricCard({
  metricKey,
  label,
  value,
  format = "number",
  delta,
  deltaDirection = "higher-is-better",
  suffix,
  footnote,
  emptyHint,
  className,
}: {
  metricKey?: MetricKey;
  label?: string;
  value: number | null;
  format?: "number" | "percent" | "score" | "raw";
  delta?: number | null;
  deltaDirection?: DeltaDirection;
  suffix?: string;
  footnote?: React.ReactNode;
  emptyHint?: string;
  className?: string;
}) {
  const explanation = metricKey ? METRIC_EXPLANATIONS[metricKey] : null;
  const title = label ?? explanation?.label ?? "Metric";

  const display =
    value === null
      ? "—"
      : format === "percent"
        ? formatPercent(value, value >= 10 ? 0 : 1)
        : format === "score"
          ? String(round(value, 0))
          : format === "raw"
            ? String(round(value, 1))
            : formatCompact(value);

  const hasDelta = delta !== null && delta !== undefined && Math.abs(delta) >= 0.05;
  const improved = hasDelta ? (deltaDirection === "higher-is-better" ? delta > 0 : delta < 0) : false;

  return (
    <Card className={className}>
      <CardContent className="px-5 py-4">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          {explanation ? <MetricInfo explanation={explanation} /> : null}
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{display}</span>
          {suffix && value !== null ? (
            <span className="text-sm text-muted-foreground">{suffix}</span>
          ) : null}
        </div>

        <div className="mt-2 min-h-5">
          {value === null ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {emptyHint ?? "Not measured yet"}
            </p>
          ) : hasDelta ? (
            <p
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                improved ? "text-[var(--success)]" : "text-destructive",
              )}
            >
              {improved ? (
                <TrendingUpIcon className="size-3.5" />
              ) : (
                <TrendingDownIcon className="size-3.5" />
              )}
              {delta > 0 ? "+" : ""}
              {round(delta, 1)}
              {format === "percent" ? " pts" : ""}
              <span className="font-normal text-muted-foreground">vs previous</span>
            </p>
          ) : delta === 0 ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MinusIcon className="size-3.5" /> No change
            </p>
          ) : footnote ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{footnote}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card>
      <CardContent className="px-5 py-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-16" />
        <Skeleton className="mt-3 h-3 w-28" />
      </CardContent>
    </Card>
  );
}
