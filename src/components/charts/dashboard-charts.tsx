"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartEmpty, ChartFrame, tooltipStyles, useChartColors } from "@/components/charts/chart-primitives";
import type { TrendPoint } from "@/lib/data/dashboard";
import { formatDate } from "@/lib/utils";

const AXIS_PROPS = { tickLine: false, axisLine: false, fontSize: 11 } as const;

function formatAxisDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
}

/** Score trend across scans: the V Score plus its three main disciplines. */
export function ScoreTrendChart({ data }: { data: readonly TrendPoint[] }) {
  const colors = useChartColors();
  const styles = tooltipStyles(colors);

  return (
    <ChartFrame
      title="Visibility trend"
      description="Your V Score and its disciplines across every completed scan."
    >
      {data.length < 2 ? (
        <ChartEmpty
          message="Not enough history yet"
          hint="A trend appears once you have completed two scans."
        />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...data]} margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatAxisDate} stroke={colors.axis} {...AXIS_PROPS} />
            <YAxis domain={[0, 100]} stroke={colors.axis} {...AXIS_PROPS} />
            <Tooltip
              {...styles}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value, name) => [Math.round(Number(value)), String(name)]}
            />
            <Legend iconType="line" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line
              type="monotone"
              dataKey="vScore"
              name="V Score"
              stroke={colors.series[0]}
              strokeWidth={2.5}
              dot={false}
            />
            <Line type="monotone" dataKey="seo" name="SEO" stroke={colors.series[1]} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="aeo" name="AEO" stroke={colors.series[2]} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="geo" name="GEO" stroke={colors.series[3]} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

/** AI visibility and citation rate over time. */
export function AiVisibilityTrendChart({ data }: { data: readonly TrendPoint[] }) {
  const colors = useChartColors();
  const styles = tooltipStyles(colors);
  const points = data.filter((point) => point.aiVisibility !== null);

  return (
    <ChartFrame
      title="AI visibility trend"
      description="Your composite AI visibility score and how often engines cite your domain."
    >
      {points.length < 2 ? (
        <ChartEmpty
          message="No AI visibility history yet"
          hint="Run AI visibility scans on a schedule to build a trend."
        />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={[...points]} margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="aiVisibilityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.series[0]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={colors.series[0]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatAxisDate} stroke={colors.axis} {...AXIS_PROPS} />
            <YAxis domain={[0, 100]} stroke={colors.axis} {...AXIS_PROPS} />
            <Tooltip
              {...styles}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value, name) => [`${Math.round(Number(value))}%`, String(name)]}
            />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Area
              type="monotone"
              dataKey="aiVisibility"
              name="AI visibility"
              stroke={colors.series[0]}
              strokeWidth={2.5}
              fill="url(#aiVisibilityFill)"
            />
            <Line
              type="monotone"
              dataKey="citationRate"
              name="Citation rate"
              stroke={colors.series[2]}
              strokeWidth={1.8}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

/** Share of voice: you against the tracked competitors. */
export function ShareOfVoiceChart({
  data,
}: {
  data: ReadonlyArray<{ brand: string; mentions: number; share: number; isTrackedBrand: boolean }>;
}) {
  const colors = useChartColors();
  const styles = tooltipStyles(colors);
  const points = data.filter((entry) => entry.mentions > 0);

  return (
    <ChartFrame
      title="AI share of voice"
      description="Of every brand mention across your tracked prompts, the share that was you."
    >
      {points.length === 0 ? (
        <ChartEmpty
          message="No brand mentions recorded yet"
          hint="Run an AI visibility scan to see how the conversation splits."
        />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[...points]}
              dataKey="mentions"
              nameKey="brand"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {points.map((entry, index) => (
                <Cell
                  key={entry.brand}
                  fill={
                    entry.isTrackedBrand
                      ? colors.series[0]
                      : (colors.series[(index % (colors.series.length - 1)) + 1] ?? colors.series[1])
                  }
                />
              ))}
            </Pie>
            <Tooltip
              {...styles}
              formatter={(value, name, payload) => {
                const share = (payload as { payload?: { share?: number } })?.payload?.share ?? 0;
                return [`${value} mentions (${share}%)`, String(name)];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) => String(value)}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

/** Per-engine comparison of mention, citation and recommendation rates. */
export function EngineComparisonChart({
  data,
}: {
  data: ReadonlyArray<{
    engine: string;
    mentionRate: number;
    citationRate: number;
    recommendationRate: number;
  }>;
}) {
  const colors = useChartColors();
  const styles = tooltipStyles(colors);

  return (
    <ChartFrame
      title="Engine comparison"
      description="Where you are strong and where you are absent, engine by engine."
    >
      {data.length === 0 ? (
        <ChartEmpty
          message="No engine data yet"
          hint="Connect at least one AI provider and run a scan."
        />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...data]} margin={{ top: 4, right: 12, bottom: 0, left: -18 }} barGap={2}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="engine" stroke={colors.axis} {...AXIS_PROPS} />
            <YAxis domain={[0, 100]} stroke={colors.axis} {...AXIS_PROPS} unit="%" />
            <Tooltip
              {...styles}
              formatter={(value, name) => [`${Math.round(Number(value))}%`, String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="mentionRate" name="Mentioned" fill={colors.series[0]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="citationRate" name="Cited" fill={colors.series[1]} radius={[3, 3, 0, 0]} />
            <Bar
              dataKey="recommendationRate"
              name="Recommended"
              fill={colors.series[2]}
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

/** Organic search performance from Search Console. */
export function SearchPerformanceChart({
  data,
}: {
  data: ReadonlyArray<{ date: string; clicks: number; impressions: number }>;
}) {
  const colors = useChartColors();
  const styles = tooltipStyles(colors);

  return (
    <ChartFrame
      title="Google organic performance"
      description="Clicks and impressions from Google Search Console."
    >
      {data.length < 2 ? (
        <ChartEmpty
          message="No Search Console data"
          hint="Connect Google Search Console under Integrations to see organic performance."
        />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={[...data]} margin={{ top: 4, right: 12, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.series[1]} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors.series[1]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatAxisDate} stroke={colors.axis} {...AXIS_PROPS} />
            <YAxis stroke={colors.axis} {...AXIS_PROPS} />
            <Tooltip
              {...styles}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value, name) => [Number(value).toLocaleString("en-IN"), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Area
              type="monotone"
              dataKey="clicks"
              name="Clicks"
              stroke={colors.series[1]}
              strokeWidth={2.2}
              fill="url(#clicksFill)"
            />
            <Line
              type="monotone"
              dataKey="impressions"
              name="Impressions"
              stroke={colors.series[3]}
              strokeWidth={1.5}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

/** SEO health across scans, used on the audit page. */
export function SeoHealthChart({ data }: { data: readonly TrendPoint[] }) {
  const colors = useChartColors();
  const styles = tooltipStyles(colors);

  return (
    <ChartFrame title="SEO health trend" description="Your SEO score across completed audits." height={220}>
      {data.length < 2 ? (
        <ChartEmpty message="Run a second audit to see the trend" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={[...data]} margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="seoFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.series[1]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={colors.series[1]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatAxisDate} stroke={colors.axis} {...AXIS_PROPS} />
            <YAxis domain={[0, 100]} stroke={colors.axis} {...AXIS_PROPS} />
            <Tooltip {...styles} labelFormatter={(label) => formatDate(String(label))} />
            <Area
              type="monotone"
              dataKey="seo"
              name="SEO score"
              stroke={colors.series[1]}
              strokeWidth={2.4}
              fill="url(#seoFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
