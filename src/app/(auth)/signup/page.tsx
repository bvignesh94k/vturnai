import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { SignupForm } from "@/app/(auth)/signup/signup-form";
import { PRO_PLAN } from "@/lib/config/plans";
import { formatCurrencyINR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Start your free trial",
  description: `Create a V Turn AI account and start a ${PRO_PLAN.trialDays}-day free trial. ${formatCurrencyINR(PRO_PLAN.priceMinor)} per month after that, cancel any time.`,
  alternates: { canonical: "/signup" },
  robots: { index: true, follow: true },
};

export default function SignupPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Start your 7-day free trial</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        No card needed to create your account. {formatCurrencyINR(PRO_PLAN.priceMinor)}/month when
        you choose to continue.
      </p>

      <SignupForm />

      <ul className="mt-7 space-y-2">
        {[
          "Full site crawl and technical audit",
          "AI visibility across five engines",
          "Ranked action list, not a wall of errors",
        ].map((item) => (
          <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <CheckIcon className="size-4 shrink-0 text-[var(--success)]" />
            {item}
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        By creating an account you agree to our{" "}
        <Link href="/terms" className="underline-offset-4 hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
