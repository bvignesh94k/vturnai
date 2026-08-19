"use client";

import * as React from "react";
import { AlertCircleIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/app/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScoreBreakdown } from "@/components/app/score-breakdown";
import { ScoreRing } from "@/components/app/score-ring";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SUGGESTION_GROUP_LABELS, type SuggestionGroup } from "@/lib/analysis/types";
import type { ScoreComponent } from "@/lib/metrics/scores";
import { round } from "@/lib/utils";

interface AnalysisResult {
  url: string | null;
  scores: { vScore: number; seo: number; aeo: number; geo: number; citationReadiness: number };
  formula: string;
  breakdown: {
    seo: ScoreComponent[];
    aeo: ScoreComponent[];
    geo: ScoreComponent[];
    citationReadiness: ScoreComponent[];
  };
  signals: {
    title: string | null;
    titleLength: number;
    metaDescription: string | null;
    metaDescriptionLength: number;
    h1: string[];
    wordCount: number;
    questionHeadings: string[];
    directAnswers: number;
    faqPairs: number;
    tables: number;
    lists: number;
    statistics: number;
    definitions: number;
    schemaTypes: string[];
    authorName: string | null;
    authoritativeSources: string[];
    internalLinks: number;
  };
  suggestions: Array<{ group: SuggestionGroup; discipline: string; title: string; detail: string; example?: string }>;
  citationRecommendations: string[];
  issues: Array<{ title: string; severity: string; recommendation: string; implementationExample: string | null }>;
  proposals: Array<{ label: string; value: string; note: string }>;
}

const GROUP_ORDER: SuggestionGroup[] = ["must-fix", "high-impact", "enhancement"];

export function ContentOptimizer({ projectId, siteUrl }: { projectId: string; siteUrl: string }) {
  const [mode, setMode] = React.useState<"url" | "draft">("url");
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AnalysisResult | null>(null);

  async function analyse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/content-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "url"
            ? { projectId, url }
            : { projectId, content, title: title || undefined },
        ),
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "That content could not be analysed.",
        );
        setState("error");
        return;
      }

      setResult((payload as { result: AnalysisResult }).result);
      setState("done");
    } catch {
      setError("Something went wrong. Please try again.");
      setState("error");
    }
  }

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: (result?.suggestions ?? []).filter((suggestion) => suggestion.group === group),
  })).filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What do you want to check?</CardTitle>
          <CardDescription>
            Analyse a published page, or paste a draft before it goes live.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(value) => setMode(value as "url" | "draft")}>
            <TabsList>
              <TabsTrigger value="url">Existing URL</TabsTrigger>
              <TabsTrigger value="draft">Draft content</TabsTrigger>
            </TabsList>

            <form onSubmit={analyse} className="mt-4 space-y-4">
              <TabsContent value="url" className="mt-0 space-y-2">
                <Label htmlFor="content-url">Page URL</Label>
                <Input
                  id="content-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={`${siteUrl.replace(/^https?:\/\//, "")}/your-page`}
                  className="h-11"
                  required={mode === "url"}
                />
                <p className="text-xs text-muted-foreground">
                  We fetch the page exactly as a search engine would. Nothing is modified.
                </p>
              </TabsContent>

              <TabsContent value="draft" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="draft-title">Working title</Label>
                  <Input
                    id="draft-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="How to choose CRM software for a small sales team"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="draft-content">Draft</Label>
                  <Textarea
                    id="draft-content"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    rows={12}
                    placeholder="Paste your draft. Plain text, Markdown headings and HTML all work."
                    required={mode === "draft"}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    {content.trim().split(/\s+/).filter(Boolean).length.toLocaleString("en-IN")} words
                  </p>
                </div>
              </TabsContent>

              <Button
                type="submit"
                variant="gradient"
                size="lg"
                disabled={state === "loading" || (mode === "url" ? url.length < 4 : content.length < 50)}
              >
                {state === "loading" ? (
                  <>
                    <Loader2Icon className="animate-spin" /> Analysing…
                  </>
                ) : (
                  <>
                    <SparklesIcon /> Analyse content
                  </>
                )}
              </Button>
            </form>
          </Tabs>
        </CardContent>
      </Card>

      {state === "error" && error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {state === "done" && result ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-8 px-6 py-6">
              <ScoreRing value={result.scores.vScore} label="V Score" size={128} />
              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: "SEO", value: result.scores.seo },
                  { label: "AEO", value: result.scores.aeo },
                  { label: "GEO", value: result.scores.geo },
                  { label: "Citation", value: result.scores.citationReadiness },
                ].map((entry) => (
                  <div key={entry.label} className="rounded-lg border bg-secondary/40 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {entry.label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                      {round(entry.value, 0)}
                    </p>
                  </div>
                ))}
                <p className="col-span-2 text-[11px] leading-relaxed text-muted-foreground sm:col-span-4">
                  {result.formula}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Grouped recommendations */}
          {grouped.map((entry) => (
            <Card key={entry.group}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge
                    variant={
                      entry.group === "must-fix"
                        ? "destructive"
                        : entry.group === "high-impact"
                          ? "warning"
                          : "muted"
                    }
                  >
                    {SUGGESTION_GROUP_LABELS[entry.group]}
                  </Badge>
                  {entry.items.length} recommendation{entry.items.length === 1 ? "" : "s"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {entry.items.map((suggestion) => (
                  <div key={suggestion.title} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="soft" className="uppercase">
                        {suggestion.discipline}
                      </Badge>
                      <p className="text-sm font-medium">{suggestion.title}</p>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {suggestion.detail}
                    </p>
                    {suggestion.example ? (
                      <div className="mt-3">
                        <div className="flex items-center justify-end">
                          <CopyButton value={suggestion.example} />
                        </div>
                        <pre className="scrollbar-thin overflow-x-auto rounded-md border bg-secondary/50 p-3 text-xs leading-relaxed">
                          <code>{suggestion.example}</code>
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Copyable proposals */}
          {result.proposals.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Starting points you can copy</CardTitle>
                <CardDescription>
                  Shapes to adapt, not finished copy. Nothing here is applied to your page
                  automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {result.proposals.map((proposal) => (
                  <div key={proposal.label} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{proposal.label}</p>
                      <CopyButton value={proposal.value} />
                    </div>
                    <pre className="scrollbar-thin mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border bg-secondary/50 p-3 text-xs leading-relaxed">
                      <code>{proposal.value}</code>
                    </pre>
                    <p className="mt-2 text-xs text-muted-foreground">{proposal.note}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* Citation readiness actions */}
          {result.citationRecommendations.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">To make this page more citable</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2.5">
                  {result.citationRecommendations.map((action, index) => (
                    <li key={action} className="flex gap-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-relaxed">{action}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {/* Breakdowns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ScoreBreakdown
              title="AEO breakdown"
              score={result.scores.aeo}
              components={result.breakdown.aeo}
            />
            <ScoreBreakdown
              title="GEO breakdown"
              score={result.scores.geo}
              components={result.breakdown.geo}
            />
          </div>

          {/* Signals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What we found on the page</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {[
                  { label: "Words", value: result.signals.wordCount.toLocaleString("en-IN") },
                  { label: "Title length", value: `${result.signals.titleLength} chars` },
                  { label: "Description length", value: `${result.signals.metaDescriptionLength} chars` },
                  { label: "H1 headings", value: String(result.signals.h1.length) },
                  { label: "Question headings", value: String(result.signals.questionHeadings.length) },
                  { label: "Quotable answers", value: String(result.signals.directAnswers) },
                  { label: "FAQ pairs", value: String(result.signals.faqPairs) },
                  { label: "Tables", value: String(result.signals.tables) },
                  { label: "Lists", value: String(result.signals.lists) },
                  { label: "Statements with figures", value: String(result.signals.statistics) },
                  { label: "Definitions", value: String(result.signals.definitions) },
                  { label: "Authoritative sources", value: String(result.signals.authoritativeSources.length) },
                  { label: "Internal links", value: String(result.signals.internalLinks) },
                  { label: "Author", value: result.signals.authorName ?? "None" },
                  {
                    label: "Schema types",
                    value: result.signals.schemaTypes.length
                      ? result.signals.schemaTypes.join(", ")
                      : "None",
                  },
                ].map((entry) => (
                  <div key={entry.label}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {entry.label}
                    </dt>
                    <dd className="mt-0.5 text-sm">{entry.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
