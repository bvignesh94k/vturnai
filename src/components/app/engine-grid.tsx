import * as React from "react";
import { AlertCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricInfo } from "@/components/ui/metric-info";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ENGINES, type EngineId } from "@/lib/config/engines";
import { METRIC_EXPLANATIONS } from "@/lib/config/metric-explanations";
import { scoreBand } from "@/lib/config/scoring";
import type { EngineVisibilityRow } from "@/lib/metrics/ai-visibility";
import type { ProviderStatus } from "@/lib/ai-engines/types";
import { formatPercent, relativeTime, round } from "@/lib/utils";

const SENTIMENT_VARIANT = {
  positive: "success",
  neutral: "muted",
  mixed: "warning",
  negative: "destructive",
  unknown: "muted",
} as const;

const SENTIMENT_LABEL = {
  positive: "Positive",
  neutral: "Neutral",
  mixed: "Mixed",
  negative: "Negative",
  unknown: "No mention",
} as const;

/**
 * The AI Engine Visibility grid.
 *
 * Engines with no authorised connection show their configuration state instead
 * of a zero, a zero would read as "the engine ignores you", which is a
 * materially different and untrue claim.
 */
export function EngineGrid({
  rows,
  providerStatuses,
}: {
  rows: readonly EngineVisibilityRow[];
  providerStatuses: readonly ProviderStatus[];
}) {
  const statusById = new Map(providerStatuses.map((status) => [status.id, status]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          AI Engine Visibility
          <MetricInfo explanation={METRIC_EXPLANATIONS.enginesMonitoring} />
        </CardTitle>
        <CardDescription>
          How each engine treated your brand across the prompts you track. Every figure is an API
          observation, not a reading of the consumer product.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Engine</TableHead>
              <TableHead className="text-right">Visibility</TableHead>
              <TableHead className="text-right">Mentions</TableHead>
              <TableHead className="text-right">Citations</TableHead>
              <TableHead className="text-right">Recommends</TableHead>
              <TableHead>Sentiment</TableHead>
              <TableHead className="pr-5 text-right">Last checked</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => {
              const engineId = row.engineId as EngineId;
              const engine = ENGINES[engineId];
              const status = statusById.get(engineId);
              const unavailable = status ? !status.configured : false;
              const hasData = row.validResponses > 0;
              const band = hasData ? scoreBand(row.visibilityScore) : null;

              return (
                <TableRow key={row.engineId}>
                  <TableCell className="pl-5">
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: engine.accent }}
                      >
                        {engine.monogram}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{engine.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {engine.vendor}
                        </span>
                      </span>
                    </span>
                  </TableCell>

                  {unavailable ? (
                    <TableCell colSpan={5} className="text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <AlertCircleIcon className="size-4 shrink-0" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted underline-offset-4">
                              {engineId === "copilot"
                                ? "Copilot connection unavailable"
                                : "Not connected"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{status?.message ?? engine.observationNote}</TooltipContent>
                        </Tooltip>
                      </span>
                    </TableCell>
                  ) : !hasData ? (
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      No data yet. Run an AI visibility scan.
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            band?.tone === "success"
                              ? "success"
                              : band?.tone === "info"
                                ? "info"
                                : band?.tone === "warning"
                                  ? "warning"
                                  : "destructive"
                          }
                        >
                          {round(row.visibilityScore, 0)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.mentions}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({formatPercent(row.mentionRate, 0)})
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.citations}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({formatPercent(row.citationRate, 0)})
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.recommendations}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({formatPercent(row.recommendationRate, 0)})
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={SENTIMENT_VARIANT[row.sentiment]}>
                          {SENTIMENT_LABEL[row.sentiment]}
                        </Badge>
                      </TableCell>
                    </>
                  )}

                  <TableCell className="pr-5 text-right text-xs text-muted-foreground">
                    {unavailable ? "N/A" : relativeTime(row.lastCheckedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <p className="border-t px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Percentages are calculated over valid responses only. Failed or skipped provider calls are
          excluded from both the numerator and the denominator, so an outage never looks like a
          visibility collapse.
        </p>
      </CardContent>
    </Card>
  );
}
