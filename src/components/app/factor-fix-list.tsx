import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FactorFix } from "@/lib/data/page-analysis";
import { round, truncate } from "@/lib/utils";

/**
 * The "fix these first" panel shared by the AEO and GEO analysers.
 *
 * A factor bar alone tells a marketer they are losing points but not where the
 * loss sits or what recovering it is worth, which is why these pages read as
 * scores rather than as work. Each row here names the points on offer, how many
 * pages fail the factor, and the worst URLs, so the list can be worked
 * top-down and the effort justified before it starts.
 */
export function FactorFixList({
  fixes,
  currentScore,
  discipline,
}: {
  fixes: FactorFix[];
  currentScore: number;
  discipline: "AEO" | "GEO";
}) {
  if (fixes.length === 0) return null;

  const available = fixes.reduce((sum, fix) => sum + fix.pointsAvailable, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fix these first</CardTitle>
        <CardDescription>
          Ordered by the {discipline} points each one returns. Clearing all {fixes.length} moves this
          score from {round(currentScore, 0)} to {round(Math.min(100, currentScore + available), 0)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {fixes.map((fix) => (
          <div key={fix.key} className="rounded-lg border bg-secondary/40 p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{fix.label}</p>
              <Badge variant={fix.score < 30 ? "destructive" : "warning"}>
                +{round(fix.pointsAvailable, 1)} pts
              </Badge>
            </div>
            {fix.description ? (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {fix.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs font-medium">
              {fix.failingPages} of {fix.totalPages} pages fail this, averaging {round(fix.score, 0)}
              .
            </p>
            {fix.worstPages.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {fix.worstPages.map((page) => (
                  <li key={page.pageId} className="flex items-baseline gap-2 text-xs">
                    <span className="w-6 shrink-0 tabular-nums text-destructive">{page.score}</span>
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-muted-foreground hover:text-primary"
                    >
                      {truncate(page.url.replace(/^https?:\/\//, ""), 44)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
