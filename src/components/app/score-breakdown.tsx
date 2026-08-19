import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { scoreBand } from "@/lib/config/scoring";
import type { ScoreComponent } from "@/lib/metrics/scores";
import { round } from "@/lib/utils";

const TONE_COLOR = {
  success: "var(--success)",
  info: "var(--info)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
} as const;

/**
 * The score breakdown table.
 *
 * Shows each component's score, its weight and the points it contributed, so a
 * user can always reconstruct the total themselves. Unmeasured components carry
 * zero weight and say so, rather than silently scoring zero.
 */
export function ScoreBreakdown({
  title,
  description,
  score,
  components,
  formula,
}: {
  title: string;
  description?: string;
  score: number;
  components: readonly ScoreComponent[];
  formula?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          <p className="shrink-0 text-3xl font-semibold tabular-nums tracking-tight">
            {round(score, 0)}
          </p>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ul className="divide-y">
          {components.map((component) => {
            const measured = component.weight > 0;
            const band = scoreBand(component.score);
            return (
              <li key={component.key} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{component.label}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {measured ? (
                      <>
                        <span className="font-semibold text-foreground">
                          {round(component.score, 0)}
                        </span>{" "}
                        × {Math.round(component.weight * 100)}% ={" "}
                        <span className="font-semibold text-foreground">
                          {round(component.contribution, 1)}
                        </span>{" "}
                        pts
                      </>
                    ) : (
                      "Not measured"
                    )}
                  </p>
                </div>

                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: measured ? `${component.score}%` : "0%",
                      backgroundColor: TONE_COLOR[band.tone],
                    }}
                  />
                </div>

                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {component.detail ?? component.description}
                </p>
              </li>
            );
          })}
        </ul>

        {formula ? (
          <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
            {formula}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
