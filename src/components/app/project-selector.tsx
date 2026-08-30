"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon, GlobeIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ProjectOption {
  id: string;
  name: string;
  domain: string;
}

/**
 * Project selector, pinned to the top of the sidebar.
 *
 * The active project is carried in the `project` query parameter so a page can
 * be linked, bookmarked and shared without a hidden server-side session value
 * deciding what the recipient sees.
 */
export function ProjectSelector({
  projects,
  activeProjectId,
  canAddProject,
  projectLimit,
}: {
  projects: readonly ProjectOption[];
  activeProjectId: string | null;
  canAddProject: boolean;
  projectLimit: number;
}) {
  const router = useRouter();
  const active = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null;

  function selectProject(projectId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("project", projectId);
    router.push(`${url.pathname}${url.search}`);
  }

  if (!active) {
    return (
      <Button variant="outline" className="w-full justify-start" onClick={() => router.push("/onboarding")}>
        <PlusIcon /> Add your website
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-auto w-full justify-between px-2.5 py-2 text-left"
          aria-label="Change project"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <GlobeIcon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{active.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{active.domain}</span>
            </span>
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {projects.map((project) => (
          <DropdownMenuItem key={project.id} onSelect={() => selectProject(project.id)}>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{project.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{project.domain}</span>
            </span>
            <CheckIcon
              className={cn("size-4 shrink-0", project.id === active.id ? "opacity-100" : "opacity-0")}
            />
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {canAddProject ? (
          <DropdownMenuItem onSelect={() => router.push("/onboarding")}>
            <PlusIcon /> Add a website
          </DropdownMenuItem>
        ) : (
          <div className="space-y-2 px-2 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              Your plan includes {projectLimit} project{projectLimit === 1 ? "" : "s"}
            </p>
            <button
              onClick={() => router.push("/app/billing")}
              className="w-full rounded-md bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Upgrade to add more
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
