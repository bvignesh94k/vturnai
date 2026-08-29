import Link from "next/link";
import { AlertCircleIcon, CheckCircle2Icon, CircleDashedIcon, MinusCircleIcon } from "lucide-react";
import type { EngineCoverage } from "@/lib/ai-engines/coverage";
import { Card, CardContent } from "@/components/ui/card";
import { relativeTime } from "@/lib/utils";

/**
 * AI engine coverage.
 *
 * Reads as a matrix rather than a list of connections, because the question a
 * marketer has is not "is this configured" but "where am I visible, and which
 * of these actually sends me anyone". Every engine shows both signals or says
 * which one it cannot give, so a row is never blank and never invented.
 */
export function EngineCoverageBoard({
  engines,
  ga4Connected,
}: {
  engines: EngineCoverage[];
  ga4Connected: boolean;
}) {
  const answering = engines.filter((engine) => engine.scanState === "answering").length;
  const withTraffic = engines.filter((engine) => (engine.referral?.sessions ?? 0) > 0).length;

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        AI engine coverage
      </h3>
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Two different things are worth knowing about an answer engine: whether it names you when
        someone asks, and whether it sends you anyone. We measure the first by putting your tracked
        questions to it, and the second from your Google Analytics referrers. An engine can do one
        without the other, so both are shown separately and neither is guessed.
      </p>

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{answering}</span>
          <span className="text-muted-foreground"> of {engines.length} answering your scans</span>
        </span>
        {ga4Connected ? (
          <span>
            <span className="font-semibold tabular-nums">{withTraffic}</span>
            <span className="text-muted-foreground"> sending you traffic</span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            <Link href="/app/integrations" className="text-primary underline-offset-4 hover:underline">
              Connect Google Analytics
            </Link>{" "}
            to see which engines send traffic
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {engines.map((engine) => (
          <EngineRow key={engine.engineId} engine={engine} ga4Connected={ga4Connected} />
        ))}
      </div>
    </section>
  );
}

function EngineRow({
  engine,
  ga4Connected,
}: {
  engine: EngineCoverage;
  ga4Connected: boolean;
}) {
  const mentionRate =
    engine.visibility && engine.visibility.promptsAnswered > 0
      ? Math.round(
          (engine.visibility.promptsMentioningYou / engine.visibility.promptsAnswered) * 100,
        )
      : null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: engine.accent }}
          >
            {engine.name.slice(0, 2).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{engine.name}</span>
              <span className="text-xs text-muted-foreground">{engine.vendor}</span>
            </div>

            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{engine.summary}</p>

            {engine.failureSummary ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-[color-mix(in_oklch,var(--warning)_80%,var(--foreground))]">
                <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                {engine.failureSummary}
              </p>
            ) : null}
          </div>
        </div>

        {/* The two signals, side by side, each labelled with where it came from. */}
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Mentions you
            </dt>
            <dd className="mt-0.5 flex items-baseline gap-1.5">
              {mentionRate === null ? (
                <span className="text-sm text-muted-foreground">
                  {engine.scanState === "unavailable" ? "Not measurable" : "Not measured yet"}
                </span>
              ) : (
                <>
                  <span className="text-lg font-semibold tabular-nums">{mentionRate}%</span>
                  <span className="text-xs text-muted-foreground">
                    of {engine.visibility?.promptsAnswered} answers
                  </span>
                </>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Visits sent
            </dt>
            <dd className="mt-0.5 flex items-baseline gap-1.5">
              {!ga4Connected ? (
                <span className="text-sm text-muted-foreground">Needs Analytics</span>
              ) : (
                <>
                  <span className="text-lg font-semibold tabular-nums">
                    {engine.referral?.sessions ?? 0}
                  </span>
                  <span className="text-xs text-muted-foreground">last 28 days</span>
                </>
              )}
            </dd>
          </div>
        </dl>

        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <StateIcon state={engine.scanState} />
          {engine.scanStateLabel}
          {engine.lastScanAt ? ` · ${relativeTime(engine.lastScanAt.toISOString())}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function StateIcon({ state }: { state: EngineCoverage["scanState"] }) {
  const className = "size-3.5 shrink-0";
  if (state === "answering") return <CheckCircle2Icon className={`${className} text-[var(--success)]`} />;
  if (state === "failing") return <AlertCircleIcon className={`${className} text-[var(--warning)]`} />;
  if (state === "untested") return <CircleDashedIcon className={className} />;
  return <MinusCircleIcon className={className} />;
}
