"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, GlobeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The hero's primary action.
 *
 * A visitor arrives asking one question — "does any of this apply to me?" — and
 * the fastest honest answer is their own homepage scored in front of them. So
 * the hero asks for a URL rather than offering a tour: the address is carried
 * to the free check, which runs it on arrival.
 */
export function HeroCheckForm() {
  const router = useRouter();
  const [url, setUrl] = React.useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (trimmed.length < 4) return;
    router.push(`/seo-audit?url=${encodeURIComponent(trimmed)}#free-check`);
  }

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="group flex w-full flex-col gap-2.5 rounded-2xl border bg-card/90 p-2.5 shadow-sm backdrop-blur-xl transition-shadow focus-within:shadow-lg sm:flex-row sm:items-center sm:rounded-full sm:pl-5"
      >
        <label htmlFor="hero-url" className="sr-only">
          Your website address
        </label>
        <span className="hidden shrink-0 text-muted-foreground sm:block" aria-hidden="true">
          <GlobeIcon className="size-[18px]" />
        </span>
        <input
          id="hero-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="yourwebsite.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          // `flex-1` is scoped to the row layout on purpose: in the stacked
          // mobile column it would resolve flex-basis against the height and
          // collapse the field to its line box.
          className="h-11 w-full min-w-0 rounded-xl bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground sm:flex-1 sm:px-1"
        />
        <Button
          type="submit"
          size="lg"
          variant="gradient"
          className="shrink-0 sm:rounded-full"
          disabled={url.trim().length < 4}
        >
          Check my visibility <ArrowRightIcon />
        </Button>
      </form>

      <p className="mt-3.5 text-sm text-muted-foreground">
        Free, no card, no signup — or{" "}
        <a href="/signup" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
          start the 7-day trial
        </a>{" "}
        for the full crawl and AI scan.
      </p>
    </div>
  );
}
