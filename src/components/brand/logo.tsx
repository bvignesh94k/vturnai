import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * V Turn AI mark — the letter V drawn as a descending stroke that turns and
 * rises into a visibility signal. Placeholder identity: replace the SVG when a
 * final logo is commissioned, but keep the component API.
 */
export function LogoMark({ className, ...props }: React.ComponentProps<"svg">) {
  const gradientId = React.useId();
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="V Turn AI"
      className={cn("size-8", className)}
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="2" y1="28" x2="30" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      {/* The V: down-stroke, vertex, then the turn upward past the baseline. */}
      <path
        d="M8 8.5 L15 21.5 L20.5 12"
        stroke="white"
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.96"
      />
      {/* The rising signal the V turns into. */}
      <path
        d="M20.5 12 L25.5 6"
        stroke="white"
        strokeWidth="2.9"
        strokeLinecap="round"
        opacity="0.96"
      />
      <circle cx="25.5" cy="6" r="2.6" fill="white" />
    </svg>
  );
}

export function Logo({
  className,
  wordmarkClassName,
  showWordmark = true,
  ...props
}: React.ComponentProps<"div"> & { wordmarkClassName?: string; showWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} {...props}>
      <LogoMark />
      {showWordmark ? (
        <span
          className={cn(
            "text-[15px] font-semibold tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          V Turn <span className="text-primary">AI</span>
        </span>
      ) : null}
    </div>
  );
}
