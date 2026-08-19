"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies a recommendation or snippet. Never modifies the user's content for them. */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the text is visible on screen regardless.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => void copy()}
      aria-label={label}
    >
      {copied ? <CheckIcon className="text-[var(--success)]" /> : <CopyIcon />}
      <span className="text-xs">{copied ? "Copied" : label}</span>
    </Button>
  );
}
