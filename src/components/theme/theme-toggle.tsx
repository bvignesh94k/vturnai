"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle({ align = "end" }: { align?: "start" | "center" | "end" }) {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change colour theme">
          {/* Which icon shows is decided by CSS, not by JavaScript, so the
              server and client markup match and no mount flag is needed. */}
          <SunIcon className="size-4 dark:hidden" />
          <MoonIcon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuItem onSelect={() => setTheme("light")}>
          <SunIcon /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}>
          <MoonIcon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}>
          <MonitorIcon /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
