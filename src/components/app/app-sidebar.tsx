"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BotIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CreditCardIcon,
  FileTextIcon,
  GaugeIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MessageSquareQuoteIcon,
  PenLineIcon,
  PlugIcon,
  QuoteIcon,
  SettingsIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_GROUPS, NAV_ITEMS, activeNavHref } from "@/lib/config/navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard: LayoutDashboardIcon,
  Bot: BotIcon,
  MessageSquareQuote: MessageSquareQuoteIcon,
  Gauge: GaugeIcon,
  Quote: QuoteIcon,
  Sparkles: SparklesIcon,
  Users: UsersIcon,
  PenLine: PenLineIcon,
  ListChecks: ListChecksIcon,
  FileText: FileTextIcon,
  Plug: PlugIcon,
  CreditCard: CreditCardIcon,
  Settings: SettingsIcon,
};

const STORAGE_KEY = "vturnai:sidebar-collapsed";

/**
 * Sidebar collapse state, persisted in localStorage.
 *
 * Read through `useSyncExternalStore` so the server renders the expanded
 * default and the client adopts the stored value during hydration — no effect,
 * no cascading render, and no flash of the wrong width after the first paint.
 */
const collapseStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void): () => void {
    collapseStore.listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      collapseStore.listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },
  getSnapshot(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // Private browsing can block storage; the expanded default is fine.
      return false;
    }
  },
  getServerSnapshot(): boolean {
    return false;
  },
  set(value: boolean): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Ignore storage failures — the toggle still works for this session.
    }
    for (const listener of collapseStore.listeners) listener();
  },
};

export function AppSidebar({
  projectSelector,
  accountControls,
  mobileOpen,
  onMobileClose,
}: {
  projectSelector: React.ReactNode;
  accountControls: React.ReactNode;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const activeHref = activeNavHref(pathname);
  const isCollapsed = React.useSyncExternalStore(
    collapseStore.subscribe,
    collapseStore.getSnapshot,
    collapseStore.getServerSnapshot,
  );

  function toggle() {
    collapseStore.set(!isCollapsed);
  }

  return (
    <>
      {/* Mobile scrim */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200",
          isCollapsed ? "w-[4.5rem]" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        aria-label="Application"
      >
        {/* Brand + project selector */}
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-3">
          <Link
            href="/app"
            className="flex min-w-0 items-center"
            aria-label="V Turn AI overview"
          >
            {isCollapsed ? <LogoMark /> : <Logo />}
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto lg:hidden"
            onClick={onMobileClose}
            aria-label="Close navigation"
          >
            <XIcon />
          </Button>
        </div>

        {!isCollapsed ? (
          <div className="border-b border-sidebar-border p-3">{projectSelector}</div>
        ) : null}

        {/* Navigation */}
        <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((group) => {
            const items = NAV_ITEMS.filter((item) => item.group === group.key);
            if (items.length === 0) return null;

            return (
              <div key={group.key} className="mb-4 last:mb-0">
                {!isCollapsed ? (
                  <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                ) : (
                  <div className="mx-2 mb-2 border-t border-sidebar-border" aria-hidden="true" />
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = ICONS[item.icon] ?? LayoutDashboardIcon;
                    const isActive = activeHref === item.href;

                    const link = (
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                          isCollapsed && "justify-center px-0",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Icon className="size-[18px] shrink-0" />
                        {!isCollapsed ? <span className="truncate">{item.label}</span> : null}
                      </Link>
                    );

                    return (
                      <li key={item.href}>
                        {isCollapsed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>{link}</TooltipTrigger>
                            <TooltipContent side="right">
                              <p className="font-medium">{item.label}</p>
                              <p className="text-muted-foreground">{item.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          link
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Account controls */}
        <div className="border-t border-sidebar-border p-2">
          {accountControls}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className={cn("mt-1 w-full text-muted-foreground", isCollapsed && "justify-center px-0")}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronsRightIcon /> : <ChevronsLeftIcon />}
            {!isCollapsed ? "Collapse" : null}
          </Button>
        </div>
      </aside>

      {/* Layout spacer matching the fixed sidebar width */}
      <div
        className={cn("hidden shrink-0 transition-[width] duration-200 lg:block", isCollapsed ? "w-[4.5rem]" : "w-64")}
        aria-hidden="true"
      />
    </>
  );
}
