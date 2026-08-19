import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUserContext } from "@/lib/auth/session";
import { OnboardingWizard } from "@/app/onboarding/wizard";

export const metadata: Metadata = {
  title: "Set up your project",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const [context, params] = await Promise.all([requireUserContext(), searchParams]);

  // A workspace with a project has already been through this.
  if (context.projects.length > 0) {
    redirect("/app");
  }

  return (
    <OnboardingWizard
      defaultCountry={context.activeOrganization.country_code}
      userName={context.user.profile.full_name}
      initialSiteUrl={typeof params.site === "string" ? params.site.slice(0, 2048) : ""}
    />
  );
}
