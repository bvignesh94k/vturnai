"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared chart infrastructure.
 *
 * The palette is read from CSS custom properties so charts stay correct in both
 * themes without any JavaScript theme detection. Values are resolved after mount
 * because Recharts needs concrete colours, not `var(...)` references, for its
 * SVG gradients.
 */
export const CHART_TOKENS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
] as const;

export function useChartColors(): { series: string[]; axis: string; grid: string; tooltipBg: string; tooltipBorder: string; text: string } {
  const [colors, setColors] = React.useState({
    series: ["#6d4aff", "#3aa7e0", "#3fb98a", "#e0a13a", "#e05a4f", "#b061d6"],
    axis: "#8b8b9e",
    grid: "#e4e4ec",
    tooltipBg: "#ffffff",
    tooltipBorder: "#e4e4ec",
    text: "#1c1a26",
  });

  React.useEffect(() => {
    function read(): void {
      const styles = getComputedStyle(document.documentElement);
      const value = (token: string, fallback: string): string =>
        styles.getPropertyValue(token).trim() || fallback;

      setColors({
        series: CHART_TOKENS.map((token, index) =>
          value(token, ["#6d4aff", "#3aa7e0", "#3fb98a", "#e0a13a", "#e05a4f", "#b061d6"][index] ?? "#6d4aff"),
        ),
        axis: value("--muted-foreground", "#8b8b9e"),
        grid: value("--border", "#e4e4ec"),
        tooltipBg: value("--popover", "#ffffff"),
        tooltipBorder: value("--border", "#e4e4ec"),
        text: value("--foreground", "#1c1a26"),
      });
    }

    read();

    // Re-read when the theme class changes.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

export function ChartFrame({
  title,
  description,
  action,
  children,
  className,
  height = 260,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  height?: number;
}) {
  return (
    <div className={cn("card-elevated rounded-xl border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="px-2 pb-3 pt-4" style={{ height }}>
        {children}
      </div>
    </div>
  );
}

export function ChartEmpty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      {hint ? <p className="mt-1.5 max-w-xs text-xs text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}

/** Tooltip styling shared by every chart, matching the popover surface. */
export function tooltipStyles(colors: ReturnType<typeof useChartColors>) {
  return {
    contentStyle: {
      backgroundColor: colors.tooltipBg,
      border: `1px solid ${colors.tooltipBorder}`,
      borderRadius: "0.6rem",
      fontSize: "12px",
      padding: "8px 10px",
      boxShadow: "0 8px 24px -12px rgba(0,0,0,0.25)",
      color: colors.text,
    },
    labelStyle: { color: colors.text, fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: colors.text, padding: 0 },
  };
}
