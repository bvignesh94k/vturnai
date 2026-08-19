"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScoreRing } from "@/components/app/score-ring";
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
  };
}

const SEVERITY_VARIANT = {
  critical: "destructive",
  high: "warning",
  medium: "info",
  low: "muted",
} as const;

export function FreeVisibilityCheck() {
  const [url, setUrl] = React.useState("");
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<QuickCheckResponse["result"] | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError(null);
    setData(null);

    try {
      const response = await fetch("/api/public/visibility-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload: unknown = await response.json();

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
      setError("Something went wrong. Please try again.");
      setState("error");
    }
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

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-5">
            <div className="flex-1">
              <p className="text-sm font-semibold">This is one page. Your site has more.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A trial crawls up to 500 URLs, tracks 25 AI prompts across five engines, and builds
                your ranked action list.
              </p>
            </div>
            <Button variant="gradient" asChild>
              <Link href={`/signup?site=${encodeURIComponent(data.finalUrl)}`}>
                Start 7-Day Free Trial
              </Link>
            </Button>
          </div>

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
