/**
 * Application navigation.
 *
 * Ordered the way a user actually works: understand the position, investigate
 * the cause, decide what to do, then manage the account. The sidebar renders
 * straight from this list so the order is defined in exactly one place.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Lucide icon name, resolved in the sidebar component. */
  icon: string;
  description: string;
  group: "overview" | "analyse" | "act" | "account";
  /**
   * Hidden from platform administrators.
   *
   * An operator's workspace is never billed, so a Billing page offering to
   * charge them a plan they are already exempt from is noise at best and
   * confusing at worst.
   */
  hideForPlatformAdmin?: boolean;
}

export const NAV_GROUPS = [
  { key: "overview", label: "Overview" },
  { key: "analyse", label: "Analyse" },
  { key: "act", label: "Act" },
  { key: "account", label: "Account" },
] as const;

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/app",
    label: "Overview",
    icon: "LayoutDashboard",
    description: "Your V Score, KPIs and what changed",
    group: "overview",
  },
  {
    href: "/app/ai-visibility",
    label: "AI Visibility",
    icon: "Bot",
    description: "How AI engines mention and cite you",
    group: "analyse",
  },
  {
    href: "/app/prompts",
    label: "Prompt Tracker",
    icon: "MessageSquareQuote",
    description: "The questions you monitor",
    group: "analyse",
  },
  {
    href: "/app/audit",
    label: "Website Audit",
    icon: "Gauge",
    description: "Technical SEO findings by severity",
    group: "analyse",
  },
  {
    href: "/app/aeo",
    label: "AEO Analyzer",
    icon: "Quote",
    description: "How answer-ready your pages are",
    group: "analyse",
  },
  {
    href: "/app/geo",
    label: "GEO Analyzer",
    icon: "Sparkles",
    description: "How citable you are to generative engines",
    group: "analyse",
  },
  {
    href: "/app/competitors",
    label: "Competitors",
    icon: "Users",
    description: "Share of voice and content gaps",
    group: "analyse",
  },
  {
    href: "/app/content-optimizer",
    label: "Content Optimizer",
    icon: "PenLine",
    description: "Score a URL or a draft before publishing",
    group: "act",
  },
  {
    href: "/app/opportunities",
    label: "Opportunities",
    icon: "ListChecks",
    description: "Your ranked action list",
    group: "act",
  },
  {
    href: "/app/reports",
    label: "Reports",
    icon: "FileText",
    description: "Client-ready visibility reports",
    group: "act",
  },
  {
    href: "/app/integrations",
    label: "Integrations",
    icon: "Plug",
    description: "Search Console, Bing, GA4, AI providers",
    group: "account",
  },
  {
    href: "/app/billing",
    label: "Billing",
    icon: "CreditCard",
    description: "Plan, usage and invoices",
    group: "account",
    hideForPlatformAdmin: true,
  },
  {
    href: "/app/settings",
    label: "Settings",
    icon: "Settings",
    description: "Project and notification preferences",
    group: "account",
  },
];

/** Match the most specific nav item for a pathname. */
export function activeNavHref(pathname: string): string {
  const matches = NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (matches.length === 0) return "/app";
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).href;
}

export function navItemFor(pathname: string): NavItem {
  const href = activeNavHref(pathname);
  return NAV_ITEMS.find((item) => item.href === href) ?? NAV_ITEMS[0]!;
}
