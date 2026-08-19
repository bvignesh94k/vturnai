"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

export function NotificationsMenu({ notifications }: { notifications: readonly NotificationItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const unread = notifications.filter((notification) => !notification.readAt);

  async function markAllRead() {
    await fetch("/api/notifications/read", { method: "POST" });
    startTransition(() => router.refresh());
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <BellIcon />
          {unread.length > 0 ? (
            <span
              className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground"
              aria-hidden="true"
            >
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
          {unread.length > 0 ? (
            <span className="sr-only">{unread.length} unread notifications</span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void markAllRead()}
              disabled={pending}
              className="h-7 text-xs"
            >
              <CheckCheckIcon className="size-3.5" /> Mark all read
            </Button>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <BellIcon className="mx-auto size-6 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">You are all caught up</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              We will tell you when an audit finishes, a scan completes, or your visibility drops.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y">
              {notifications.map((notification) => {
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{notification.title}</p>
                      {!notification.readAt ? (
                        <Badge variant="soft" className="shrink-0 px-1.5 py-0 text-[10px]">
                          New
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {notification.body}
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                      {relativeTime(notification.createdAt)}
                    </p>
                  </>
                );

                return (
                  <li key={notification.id}>
                    {notification.actionUrl ? (
                      <Link
                        href={notification.actionUrl}
                        className="block px-4 py-3 transition-colors hover:bg-secondary/60"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
