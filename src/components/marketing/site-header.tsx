"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, XIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/ai-visibility", label: "AI Visibility" },
  { href: "/seo-audit", label: "SEO Audit" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Each mobile link closes the menu itself, so no effect on `pathname` is
  // needed — and no extra render happens on navigation.
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="V Turn AI home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                pathname === link.href && "text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/login">Log in</Link>
          </Button>
          <Button variant="gradient" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/signup">Start 7-Day Free Trial</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <XIcon /> : <MenuIcon />}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="border-t bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="outline" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button variant="gradient" asChild>
                <Link href="/signup">Start 7-Day Free Trial</Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
