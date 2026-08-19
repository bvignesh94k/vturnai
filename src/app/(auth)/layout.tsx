import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { EngineBadges } from "@/components/marketing/engine-badges";
import { SITE } from "@/lib/config/site";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-6 py-5">
          <Link href="/" aria-label="V Turn AI home">
            <Logo />
          </Link>
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="px-6 py-5 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </footer>
      </div>

      {/* Brand side */}
      <div className="relative hidden overflow-hidden border-l lg:block">
        <div className="pointer-events-none absolute inset-0 bg-aurora" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-grid" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-center px-14 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {SITE.tagline}
          </p>
          <h2 className="mt-5 max-w-md text-3xl font-semibold tracking-tight text-balance">
            See how visible your brand is everywhere people search
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            {SITE.shortDescription}
          </p>

          <div className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Monitoring across
            </p>
            <EngineBadges className="mt-4 justify-start" />
          </div>

          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
            {[
              { value: "4", label: "Disciplines scored" },
              { value: "6", label: "AI engines tracked" },
              { value: "1", label: "Ranked action list" },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="text-2xl font-semibold tabular-nums text-primary">{stat.value}</dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
