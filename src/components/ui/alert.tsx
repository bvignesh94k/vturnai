import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        info: "border-[color-mix(in_oklch,var(--info)_35%,transparent)] bg-[color-mix(in_oklch,var(--info)_10%,transparent)] text-foreground [&>svg]:text-[var(--info)]",
        success:
          "border-[color-mix(in_oklch,var(--success)_35%,transparent)] bg-[color-mix(in_oklch,var(--success)_10%,transparent)] text-foreground [&>svg]:text-[var(--success)]",
        warning:
          "border-[color-mix(in_oklch,var(--warning)_40%,transparent)] bg-[color-mix(in_oklch,var(--warning)_12%,transparent)] text-foreground [&>svg]:text-[color-mix(in_oklch,var(--warning)_80%,var(--foreground))]",
        destructive:
          "border-[color-mix(in_oklch,var(--destructive)_35%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_9%,transparent)] text-foreground [&>svg]:text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 min-h-4 font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid gap-1 text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
