import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.ComponentProps<"div"> {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}

/**
 * Shared empty state. Every list surface in the product uses this so a new
 * account never sees a blank panel with no explanation of what to do next.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
