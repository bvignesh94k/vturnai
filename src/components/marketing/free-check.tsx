"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircleIcon,
  BotIcon,
  CheckCircle2Icon,
  Loader2Icon,
  LockIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScoreRing } from "@/components/app/score-ring";
import { PRO_PLAN } from "@/lib/config/plans";
import { cn, formatDateTime } from "@/lib/utils";

interface QuickCheckResponse {
  result: {
    finalUrl: string;
    fetchedAt: string;
    title: string | null;
    scores: { vScore: number; seo: number; aeo: number; geo: number; citationReadiness: number };
    signals: {
      wordCount: number;
      questionHeadings: number;
      schemaTypes: string[];
      hasOrganizationSchema: boolean;
      statisticCount: number;
      authorNamed: boolean;
      isIndexable: boolean;
      aiCrawlersBlocked: Array<{ agent: string; engine: string }>;
    };
    topFindings: Array<{ title: string; detail: string; severity: "critical" | "high" | "medium" | "low" }>;
    aiPrompts: string[];
  };
}

const SEVERITY_VARIANT = {
  critical: "destructive",
  high: "warning",
  medium: "info",
  low: "muted",
} as const;

export function FreeVisibilityCheck() {
  const searchParams = useSearchParams();
  const handoffUrl = searchParams.get("url")?.trim() ?? "";

  const [url, setUrl] = React.useState(handoffUrl);
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<QuickCheckResponse["result"] | null>(null);

  /**
   * `isLive` lets a caller abandon a result it no longer owns — an unmount, or
   * a second address arriving while the first is still in flight.
   */
  const runCheck = React.useCallback(
    async (target: string, isLive: () => boolean = () => true) => {
      setState("loading");
      setError(null);
      setData(null);

      try {
        const response = await fetch("/api/public/visibility-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: target }),
        });
        const payload: unknown = await response.json();
        if (!isLive()) return;

        if (!response.ok) {
          const message =
            typeof payload === "object" && payload !== null && "error" in payload
              ? String((payload as { error: unknown }).error)
              : "That site could not be analysed.";
          setError(message);
          setState("error");
          return;
        }

        setData((payload as QuickCheckResponse).result);
        setState("done");
      } catch {
        if (!isLive()) return;
        setError("Something went wrong. Please try again.");
        setState("error");
      }
    },
    [],
  );

  /**
   * The hero hands an address over in `?url=`. Running it on arrival is the
   * whole point of asking for it there — the visitor should land on their own
   * result, not on an input they have to fill in a second time. The field is
   * seeded from the same value at initialisation, so this only fires the
   * request, and it does so off the effect body so the render that mounts the
   * component is not immediately invalidated by a `loading` state.
   */
  React.useEffect(() => {
    if (handoffUrl.length < 4) return;

    let live = true;
    const started = Promise.resolve().then(() => {
      if (live) return runCheck(handoffUrl, () => live);
    });
    void started;

    return () => {
      live = false;
    };
  }, [handoffUrl, runCheck]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runCheck(url);
  }

  return (
    <div className="card-elevated rounded-2xl border bg-card p-6 sm:p-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="free-check-url" className="sr-only">
          Website address
        </label>
        <Input
          id="free-check-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="yourwebsite.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
          className="h-11 flex-1 text-base"
          disabled={state === "loading"}
        />
        <Button type="submit" size="lg" variant="gradient" disabled={state === "loading" || url.trim().length < 4}>
          {state === "loading" ? (
            <>
              <Loader2Icon className="animate-spin" /> Checking…
            </>
          ) : (
            <>
              <SearchIcon /> Run Free Check
            </>
          )}
        </Button>
      </form>

      <p className="mt-3 text-xs text-muted-foreground">
        Analyses your homepage only, and does not run any paid AI engine calls. Start a free trial
        for the full site crawl and AI visibility scan.
      </p>

      {state === "error" && error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircleIcon />
          <AlertTitle>Could not analyse that address</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {state === "done" && data ? (
        <div className="mt-8 space-y-8">
          <div className="flex flex-col items-center gap-6 rounded-xl border bg-secondary/40 p-6 sm:flex-row sm:items-center">
            <ScoreRing value={data.scores.vScore} label="V Score" size={128} />
            <div className="flex-1">
              <p className="text-sm font-medium">{data.title ?? data.finalUrl}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">{data.finalUrl}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Homepage checked {formatDateTime(data.fetchedAt)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "SEO", value: data.scores.seo },
                  { label: "AEO", value: data.scores.aeo },
                  { label: "GEO", value: data.scores.geo },
                  { label: "Citation", value: data.scores.citationReadiness },
                ].map((score) => (
                  <div key={score.label} className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {score.label}
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums">{Math.round(score.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {data.topFindings.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                What we found
              </h3>
              <ul className="mt-4 space-y-3">
                {data.topFindings.map((finding) => (
                  <li key={finding.title} className="rounded-lg border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[finding.severity]}>{finding.severity}</Badge>
                      <p className="text-sm font-semibold">{finding.title}</p>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {finding.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Alert variant="success">
              <CheckCircle2Icon />
              <AlertTitle>No blocking problems on your homepage</AlertTitle>
              <AlertDescription>
                The obvious issues are clear. A full crawl checks every page and adds AI visibility
                across the engines.
              </AlertDescription>
            </Alert>
          )}

          {/*
            * The scores above answer "is my page well built?" — but the visitor
            * arrived asking "does AI mention me?". These are the real questions
            * generated from their own page, shown unanswered on purpose: the
            * gap between seeing the question and knowing the answer is the
            * reason to start a trial, and it costs us no API call to show.
            */}
          {data.aiPrompts.length > 0 ? (
            <div className="rounded-xl border bg-card p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <BotIcon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-snug">
                    Your buyers are asking AI these questions right now
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Generated from your own homepage. Notice that none of them name you — that is
                    the point. Whether you appear in the answer is the measurement.
                  </p>
                </div>
              </div>

              <ul className="mt-5 space-y-2.5">
                {data.aiPrompts.map((prompt) => (
                  <li
                    key={prompt}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-secondary/40 px-4 py-3"
                  >
                    <p className="min-w-0 flex-1 text-sm font-medium">
                      <span className="text-primary">&ldquo;</span>
                      {prompt}
                      <span className="text-primary">&rdquo;</span>
                    </p>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <LockIcon className="size-3.5" aria-hidden="true" />
                      Answer hidden
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-5">
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    See who ChatGPT, Claude and Gemini actually name.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A trial asks these questions for real, crawls up to{" "}
                    {PRO_PLAN.limits.crawledUrls} URLs and tracks{" "}
                    {PRO_PLAN.limits.activePrompts} prompts — so you find out whether it is you or a
                    competitor being recommended.
                  </p>
                </div>
                <Button variant="gradient" asChild>
                  <Link href={`/signup?site=${encodeURIComponent(data.finalUrl)}`}>
                    Reveal the answers &mdash; free trial
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-5">
              <div className="flex-1">
                <p className="text-sm font-semibold">This is one page. Your site has more.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A trial crawls up to {PRO_PLAN.limits.crawledUrls} URLs, tracks{" "}
                  {PRO_PLAN.limits.activePrompts} AI prompts across the engines, and builds your
                  ranked action list.
                </p>
              </div>
              <Button variant="gradient" asChild>
                <Link href={`/signup?site=${encodeURIComponent(data.finalUrl)}`}>
                  Start 7-Day Free Trial
                </Link>
              </Button>
            </div>
          )}

          <p className={cn("text-xs text-muted-foreground")}>
            Signals detected: {data.signals.wordCount.toLocaleString("en-IN")} words,{" "}
            {data.signals.questionHeadings} question headings, {data.signals.statisticCount}{" "}
            statements with figures,{" "}
            {data.signals.hasOrganizationSchema ? "Organization schema present" : "no Organization schema"},{" "}
            {data.signals.authorNamed ? "author named" : "no named author"}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
