import type { Metadata } from "next";
import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <Link href="/" aria-label="V Turn AI home">
        <Logo />
      </Link>

      <div className="mt-10 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <CompassIcon className="size-6" />
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        That address does not exist. It may have moved, or the link that brought you here may be out
        of date.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="gradient" asChild>
          <Link href="/">Go to the homepage</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/app">Open the dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
