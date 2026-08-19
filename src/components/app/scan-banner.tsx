"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Progress } from "@/components/ui/progress";

/**
 * Live progress banner for a running crawl or scan.
 *
 * Polls the same status endpoint the onboarding screen uses, which also nudges
 * the job queue — so a user watching their scan keeps it moving even before a
 * cron schedule is configured.
 */
export function ScanBanner({
  projectId,
  initialLabel,
  initialCurrent,
  initialTotal,
}: {
  projectId: string;
  initialLabel: string;
  initialCurrent: number;
  initialTotal: number;
}) {
  const router = useRouter();
  const [label, setLabel] = React.useState(initialLabel);
  const [current, setCurrent] = React.useState(initialCurrent);
  const [total, setTotal] = React.useState(initialTotal);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      try {
        const response = await fetch(`/api/projects/${projectId}/scan-status`, { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as {
            stage: string;
            label: string;
            current: number;
            total: number;
          };
          if (cancelled) return;
          setLabel(payload.label);
          setCurrent(payload.current);
          setTotal(payload.total);

          if (payload.stage !== "running") {
            setDone(true);
            router.refresh();
            return;
          }
        }
      } catch {
        // Transient failures are not worth surfacing; keep polling.
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 5000);
    }

    timer = setTimeout(() => void poll(), 4000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, router]);

  if (done) return null;

  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null;

  return (
    <div className="mb-6 rounded-xl border border-[color-mix(in_oklch,var(--info)_35%,transparent)] bg-[color-mix(in_oklch,var(--info)_8%,transparent)] px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Loader2Icon className="size-4 shrink-0 animate-spin text-[var(--info)]" />
        <p className="text-sm font-medium">{label}</p>
        {percent !== null ? (
          <p className="ml-auto text-xs tabular-nums text-muted-foreground">
            {current.toLocaleString("en-IN")} / {total.toLocaleString("en-IN")}
          </p>
        ) : null}
      </div>
      {percent !== null ? <Progress value={percent} className="mt-3 h-1.5" /> : null}
      <p className="mt-2.5 text-xs text-muted-foreground">
        This runs in the background. You can keep working or leave the page.
      </p>
    </div>
  );
}
