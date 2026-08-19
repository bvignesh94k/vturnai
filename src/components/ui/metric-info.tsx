"use client";

import * as React from "react";
import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MetricExplanation } from "@/lib/config/metric-explanations";

/**
 * Every number shown in V Turn AI is paired with this control. It answers the
 * four questions a non-specialist actually has: what is it, why does it matter,
 * how was it worked out, and what do I do about it.
 */
export function MetricInfo({
  explanation,
  className,
  side = "top",
}: {
  explanation: MetricExplanation;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${explanation.label}?`}
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
            className,
          )}
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="w-80 max-w-[min(20rem,calc(100vw-2rem))] p-0">
        <div className="space-y-2.5 p-3.5">
          <p className="text-[13px] font-semibold text-popover-foreground">{explanation.label}</p>
          <dl className="space-y-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                What it means
              </dt>
              <dd className="mt-0.5 text-xs leading-relaxed">{explanation.whatItMeans}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Why it matters
              </dt>
              <dd className="mt-0.5 text-xs leading-relaxed">{explanation.whyItMatters}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                How it is calculated
              </dt>
              <dd className="mt-0.5 text-xs leading-relaxed">{explanation.howCalculated}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                How to improve it
              </dt>
              <dd className="mt-0.5 text-xs leading-relaxed">{explanation.howToImprove}</dd>
            </div>
          </dl>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
