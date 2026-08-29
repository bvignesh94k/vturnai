"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { navItemFor } from "@/lib/config/navigation";

/**
 * Application chrome.
 *
 * Only the shell is a Client Component, the sidebar needs local collapse state
 * and the mobile drawer needs interaction. Page content stays on the server.
 */
export function AppShell({
  projectSelector,
  accountControls,
  notifications,
  isPlatformAdmin = false,
  children,
}: {
  projectSelector: React.ReactNode;
  accountControls: React.ReactNode;
  notifications: React.ReactNode;
  isPlatformAdmin?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const active = navItemFor(pathname);

  // The drawer closes from the link's own onClick rather than from an effect on
  // `pathname`, which avoids a second render pass on every navigation.
  return (
    <div className="flex min-h-dvh bg-background">
      <AppSidebar
        projectSelector={projectSelector}
        accountControls={accountControls}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        isPlatformAdmin={isPlatformAdmin}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-xl lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon />
          </Button>
          <Logo showWordmark={false} />
          <p className="truncate text-sm font-semibold">{active.label}</p>
          <div className="ml-auto">{notifications}</div>
        </header>

        {/* Desktop page header */}
        <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b bg-background/85 px-6 backdrop-blur-xl lg:flex">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">{active.label}</h1>
            <p className="truncate text-xs text-muted-foreground">{active.description}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">{notifications}</div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
