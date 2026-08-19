import * as React from "react";
import { cn } from "@/lib/utils";

export function Section({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section className={cn("px-4 py-20 sm:px-6 sm:py-24", className)} {...props}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      ) : null}
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function FeatureCard({
  icon,
  title,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card-elevated rounded-xl border bg-card p-6 transition-shadow hover:shadow-lg",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

/** Renders a JSON-LD block. The product practises the GEO advice it sells. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // The payload is constructed in our own code, never from user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
