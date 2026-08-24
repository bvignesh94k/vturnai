import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Clamp a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to a fixed number of decimals without floating point noise. */
export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Safe percentage that returns 0 instead of NaN/Infinity for empty denominators. */
export function percentage(numerator: number, denominator: number, decimals = 1): number {
  if (!denominator || denominator <= 0) return 0;
  return round((numerator / denominator) * 100, decimals);
}

export function formatNumber(value: number | null | undefined, locale = "en-IN"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

export function formatCompact(value: number | null | undefined, locale = "en-IN"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${round(value, decimals)}%`;
}

export function formatCurrencyINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatDate(value: string | Date | null | undefined, locale = "en-IN"): string {
  if (!value) return "N/A";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined, locale = "en-IN"): string {
  if (!value) return "N/A";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "Never";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Never";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const thresholds: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [2592000, "day"],
    [31536000, "month"],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 45) return "Just now";
  for (let i = 0; i < thresholds.length; i += 1) {
    const entry = thresholds[i];
    if (!entry) break;
    const [limit, unit] = entry;
    if (seconds < limit) {
      const previous = i === 0 ? 1 : (thresholds[i - 1]?.[0] ?? 1);
      return formatter.format(-Math.round(seconds / previous), unit);
    }
  }
  return formatter.format(-Math.round(seconds / 31536000), "year");
}

export function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Deterministic slug used for cache keys and idempotency tokens. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

export function chunk<T>(values: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be greater than zero");
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
