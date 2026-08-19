import * as React from "react";
import { scoreBand } from "@/lib/config/scoring";
import { cn, round } from "@/lib/utils";

const TONE_COLOR = {
  success: "var(--success)",
  info: "var(--info)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
} as const;

/**
 * The product's signature score display.
 *
 * An SVG arc rather than a chart library: it renders on the server, needs no
 * JavaScript, and stays crisp at every size the dashboard uses it.
 */
export function ScoreRing({
  value,
  label,
  sublabel,
  size = 120,
  strokeWidth,
  className,
}: {
  value: number | null;
  label?: string;
  sublabel?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const stroke = strokeWidth ?? Math.max(6, Math.round(size * 0.075));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeValue = value === null ? 0 : Math.min(100, Math.max(0, value));
  const dash = (safeValue / 100) * circumference;
  const band = scoreBand(safeValue);
  const color = value === null ? "var(--muted-foreground)" : TONE_COLOR[band.tone];

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${label ?? "Score"}: ${value === null ? "not measured" : `${round(safeValue, 0)} out of 100`}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-semibold tabular-nums leading-none"
            style={{ fontSize: size * 0.29 }}
          >
            {value === null ? "—" : round(safeValue, 0)}
          </span>
          {value !== null ? (
            <span
              className="mt-1 text-[10px] font-medium uppercase tracking-wider"
              style={{ color }}
            >
              {band.label}
            </span>
          ) : null}
        </div>
      </div>
      {label ? <p className="mt-3 text-sm font-medium">{label}</p> : null}
      {sublabel ? <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p> : null}
    </div>
  );
}
