"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ScanStatus {
  stage: "running" | "ready" | "failed";
  label: string;
  current: number;
  total: number;
  steps: Array<{ key: string; label: string; state: "pending" | "running" | "done" }>;
  message?: string;
}

/**
 * "Building your visibility profile…"
 *
 * Polls the scan status endpoint rather than holding a connection open, and
 * shows real per-stage progress so the wait is legible instead of a spinner.
 */
export function BuildingProfile({
  projectId,
  projectName,
  siteUrl,
  initialLabel,
  initialCurrent,
  initialTotal,
}: {
  projectId: string;
  projectName: string;
  siteUrl: string;
  initialLabel: string;
  initialCurrent: number;
  initialTotal: number;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<ScanStatus>({
    stage: "running",
    label: initialLabel,
    current: initialCurrent,
    total: initialTotal,
    steps: [
      { key: "discover", label: "Reading robots.txt and your sitemap", state: "running" },
      { key: "crawl", label: "Crawling and extracting your pages", state: "pending" },
      { key: "analyse", label: "Scoring SEO, AEO and GEO", state: "pending" },
      { key: "prompts", label: "Suggesting prompts to track", state: "pending" },
    ],
  });

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      try {
        const response = await fetch(`/api/projects/${projectId}/scan-status`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("status unavailable");
        const payload = (await response.json()) as ScanStatus;
        if (cancelled) return;

        setStatus(payload);

        if (payload.stage === "ready") {
          // Give the user a beat to see the completed state before moving on.
          timer = setTimeout(() => router.replace("/app"), 1200);
          return;
        }
      } catch {
        // A transient failure is not worth surfacing; keep polling.
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 3000);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, router]);

  const percent =
    status.total > 0 ? Math.min(100, Math.round((status.current / status.total) * 100)) : null;

  return (
    <div className="card-elevated rounded-2xl border bg-card p-8 text-center sm:p-12">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        {status.stage === "ready" ? (
          <CheckIcon className="size-7" />
        ) : (
          <Loader2Icon className="size-7 animate-spin" />
        )}
      </div>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {status.stage === "ready" ? "Your visibility profile is ready" : "Building your visibility profile…"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {projectName} · {siteUrl.replace(/^https?:\/\//, "")}
      </p>

      <p className="mt-6 text-sm font-medium">{status.label}</p>

      {percent !== null ? (
        <div className="mt-4">
          <Progress value={percent} />
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">
            {status.current.toLocaleString("en-IN")} of {status.total.toLocaleString("en-IN")} pages
          </p>
        </div>
      ) : null}

      <ul className="mx-auto mt-9 max-w-sm space-y-3 text-left">
        {status.steps.map((step) => (
          <li key={step.key} className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px]",
                step.state === "done" && "border-transparent bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[var(--success)]",
                step.state === "running" && "border-primary text-primary",
                step.state === "pending" && "text-muted-foreground",
              )}
            >
              {step.state === "done" ? (
                <CheckIcon className="size-3.5" />
              ) : step.state === "running" ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : null}
            </span>
            <span
              className={cn(
                "text-sm",
                step.state === "pending" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ul>

      {status.message ? (
        <p className="mt-6 text-sm text-muted-foreground">{status.message}</p>
      ) : null}

      <div className="mt-9 border-t pt-6">
        <p className="text-sm text-muted-foreground">
          This usually takes a few minutes. You can leave this page — the scan keeps running.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/app")}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
