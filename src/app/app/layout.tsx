import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AccountMenu } from "@/components/app/account-menu";
import { NotificationsMenu } from "@/components/app/notifications-menu";
import { ProjectSelector } from "@/components/app/project-selector";
import { TrialBanner } from "@/components/app/trial-banner";
import { requireUserContext } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/billing/entitlements";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireUserContext();

  // A signed-in account with no project has not finished onboarding.
  if (context.projects.length === 0) redirect("/onboarding");

  const supabase = await createServerSupabaseClient();
  const [entitlements, { data: notifications }] = await Promise.all([
    getEntitlements(context.activeOrganization.id),
    supabase
      .from("notifications")
      .select("id, title, body, action_url, created_at, read_at")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const planLabel = entitlements.isTrialing
    ? `Trial · ${entitlements.daysRemainingInTrial ?? 0}d left`
    : entitlements.isActive
      ? entitlements.planName
      : "No active plan";

  return (
    <AppShell
      isPlatformAdmin={context.isPlatformAdmin}
      projectSelector={
        <ProjectSelector
          projects={context.projects.map((project) => ({
            id: project.id,
            name: project.name,
            domain: project.domain,
          }))}
          activeProjectId={context.projects[0]?.id ?? null}
          canAddProject={context.projects.length < entitlements.limits.projects}
          projectLimit={entitlements.limits.projects}
        />
      }
      accountControls={
        <AccountMenu
          fullName={context.user.profile.full_name}
          email={context.user.email}
          planLabel={planLabel}
          isPlatformAdmin={context.isPlatformAdmin}
        />
      }
      notifications={
        <NotificationsMenu
          notifications={(notifications ?? []).map((notification) => ({
            id: notification.id,
            title: notification.title,
            body: notification.body,
            actionUrl: notification.action_url,
            createdAt: notification.created_at,
            readAt: notification.read_at,
          }))}
        />
      }
    >
      {entitlements.isTrialing && entitlements.trialEndsAt ? (
        <TrialBanner
          daysRemaining={entitlements.daysRemainingInTrial ?? 0}
          trialEndsAt={entitlements.trialEndsAt}
          hasPaymentMethod={Boolean(entitlements.subscription?.razorpay_subscription_id)}
          canManageBilling={["owner", "admin"].includes(context.activeRole)}
        />
      ) : null}
      {children}
    </AppShell>
  );
}
