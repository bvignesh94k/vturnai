import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        soft: "border-transparent bg-primary-soft text-primary",
        success:
          "border-transparent bg-[color-mix(in_oklch,var(--success)_16%,transparent)] text-[var(--success)]",
        warning:
          "border-transparent bg-[color-mix(in_oklch,var(--warning)_20%,transparent)] text-[color-mix(in_oklch,var(--warning)_80%,var(--foreground))]",
        destructive:
          "border-transparent bg-[color-mix(in_oklch,var(--destructive)_15%,transparent)] text-destructive",
        info: "border-transparent bg-[color-mix(in_oklch,var(--info)_15%,transparent)] text-[var(--info)]",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
