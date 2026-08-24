import { CheckIcon, MinusIcon, QuoteIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The hero's product proof.
 *
 * A composed illustration of a real V Turn AI result, not a screenshot and not
 * live data, so it is labelled as an example. The product's entire position is
 * that it never dresses a guess up as a measurement; the marketing page has to
 * hold the same line.
 */

const SCORE = 78;
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DISCIPLINES = [
  { label: "SEO", value: 84, color: "var(--chart-1)" },
  { label: "AEO", value: 71, color: "var(--chart-3)" },
  { label: "GEO", value: 66, color: "var(--chart-2)" },
  { label: "HEO", value: 78, color: "var(--chart-4)" },
] as const;

const ENGINES = [
  { name: "ChatGPT", state: "cited", detail: "Cited · position 2" },
  { name: "Perplexity", state: "cited", detail: "Cited · position 1" },
  { name: "Gemini", state: "mentioned", detail: "Mentioned, not cited" },
  { name: "Claude", state: "absent", detail: "Not mentioned" },
] as const;

const STATE_STYLES = {
  cited: {
    icon: <QuoteIcon className="size-3" />,
    className: "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-[var(--success)]",
  },
  mentioned: {
    icon: <CheckIcon className="size-3" />,
    className: "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-[var(--warning)]",
  },
  absent: {
    icon: <MinusIcon className="size-3" />,
    className: "bg-muted text-muted-foreground",
  },
} as const;

export function HeroVisual({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)} aria-hidden="true">
      {/* Glow behind the panel, tinted with the mark's own gradient. */}
      <div
        className="pointer-events-none absolute -inset-8 rounded-[2.5rem] bg-brand-gradient opacity-[0.14] blur-3xl"
      />

      <div className="card-elevated relative rounded-2xl border bg-card/95 p-5 backdrop-blur-xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-[var(--success)]" />
            <span className="font-mono text-[13px] text-muted-foreground">acme.com</span>
          </div>
          <span className="rounded-full border border-dashed px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Example
          </span>
        </div>

        <div className="mt-5 flex items-center gap-5">
          <div className="relative shrink-0">
            <svg viewBox="0 0 128 128" className="size-[124px] -rotate-90">
              <circle
                cx="64"
                cy="64"
                r={RADIUS}
                fill="none"
                strokeWidth="11"
                className="stroke-muted"
              />
              <defs>
                <linearGradient id="heroRing" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="var(--brand-indigo)" />
                  <stop offset="0.55" stopColor="var(--brand-violet)" />
                  <stop offset="1" stopColor="var(--brand-cyan)" />
                </linearGradient>
              </defs>
              <circle
                cx="64"
                cy="64"
                r={RADIUS}
                fill="none"
                stroke="url(#heroRing)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - SCORE / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-extrabold tabular-nums tracking-tight">
                {SCORE}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                V Score
              </span>
            </div>
          </div>

          <dl className="min-w-0 flex-1 space-y-2.5">
            {DISCIPLINES.map((discipline) => (
              <div key={discipline.label}>
                <div className="flex items-baseline justify-between text-[11px]">
                  <dt className="font-semibold uppercase tracking-wider text-muted-foreground">
                    {discipline.label}
                  </dt>
                  <dd className="font-semibold tabular-nums">{discipline.value}</dd>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${discipline.value}%`, backgroundColor: discipline.color }}
                  />
                </div>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-6 border-t pt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            “Best project management tool for agencies”
          </p>
          <ul className="mt-3 space-y-2">
            {ENGINES.map((engine) => {
              const style = STATE_STYLES[engine.state];
              return (
                <li key={engine.name} className="flex items-center gap-3 text-[13px]">
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full",
                      style.className,
                    )}
                  >
                    {style.icon}
                  </span>
                  <span className="font-medium">{engine.name}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {engine.detail}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
