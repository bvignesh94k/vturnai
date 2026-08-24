"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Application error boundary.
 *
 * Scoped inside the app shell so the sidebar stays usable, a failure on one
 * screen should not strand someone with no way to reach the rest of the product.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Alert variant="destructive">
        <AlertTriangleIcon />
        <AlertTitle>This screen could not be loaded</AlertTitle>
        <AlertDescription>
          <p>
            Your data is safe and any running scan is unaffected. The problem has been logged.
          </p>
          {error.digest ? (
            <p className="mt-2 font-mono text-xs">Reference: {error.digest}</p>
          ) : null}
        </AlertDescription>
      </Alert>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="gradient" onClick={reset}>
          <RotateCcwIcon /> Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/app">Back to overview</Link>
        </Button>
      </div>
    </div>
  );
}
