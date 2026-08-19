"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary.
 *
 * Shows what went wrong in plain language and gives two ways out. The digest is
 * surfaced because it is the id an operator needs to find the matching server
 * log — the message itself is deliberately not detailed in production.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--destructive)_14%,transparent)] text-destructive">
          <AlertTriangleIcon className="size-6" />
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This page could not be loaded. The problem has been logged. Trying again often works — if
          it does not, the details below will help us find it.
        </p>

        {error.digest ? (
          <p className="mt-4 rounded-lg border bg-secondary/50 px-3 py-2 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="gradient" onClick={reset}>
            <RotateCcwIcon /> Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/app">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
