import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SignOutButton } from "@/components/app/sign-out-button";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 bg-aurora opacity-40" aria-hidden="true" />

      <header className="relative flex items-center justify-between border-b border-border/60 bg-background/70 px-6 py-4 backdrop-blur-xl">
        <Link href="/" aria-label="V Turn AI home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton variant="ghost" size="sm" />
        </div>
      </header>

      <main id="main" className="relative flex flex-1 items-start justify-center px-4 py-10 sm:px-6 sm:py-16">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
    </div>
  );
}
