"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  CreditCardIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
} from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}

/** Account controls, pinned to the bottom of the sidebar. */
export function AccountMenu({
  fullName,
  email,
  planLabel,
  isPlatformAdmin,
}: {
  fullName: string | null;
  email: string;
  planLabel: string;
  isPlatformAdmin: boolean;
}) {
  const { setTheme } = useTheme();
  const [pending, startTransition] = React.useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-2.5 px-2 py-2 text-left">
          <Avatar className="size-7 shrink-0">
            <AvatarFallback>{initials(fullName, email)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{fullName ?? email}</span>
            <span className="block truncate text-xs text-muted-foreground">{planLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate font-normal text-foreground">{fullName ?? "Account"}</span>
          <span className="block truncate text-xs font-normal normal-case tracking-normal text-muted-foreground">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <SettingsIcon /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/billing">
            <CreditCardIcon /> Billing
            <Badge variant="muted" className="ml-auto">
              {planLabel}
            </Badge>
          </Link>
        </DropdownMenuItem>

        {isPlatformAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldIcon /> Admin
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunIcon className="mr-2 size-4" /> Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => setTheme("light")}>
              <SunIcon /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("dark")}>
              <MoonIcon /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme("system")}>
              <MonitorIcon /> System
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(() => void signOutAction());
          }}
        >
          <LogOutIcon /> {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
