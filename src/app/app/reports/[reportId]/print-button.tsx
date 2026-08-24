"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

/**
 * Print entry point.
 *
 * The report is print-friendly HTML today, the browser's own "Save as PDF"
 * produces the deliverable. A server-side PDF renderer can be added behind the
 * export service later without changing the report data itself.
 */
export function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      {children}
    </Button>
  );
}
