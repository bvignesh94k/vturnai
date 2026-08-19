import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/app/(auth)/login/login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your V Turn AI workspace.",
  alternates: { canonical: "/login" },
  robots: { index: true, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Log in to see how visible your brand is today.
      </p>

      <LoginForm next={next} initialError={params.error ?? null} />

      <p className="mt-8 text-sm text-muted-foreground">
        New to V Turn AI?{" "}
        <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          Start your 7-day free trial
        </Link>
      </p>
    </div>
  );
}
