import Link from "next/link";
import { redirect } from "next/navigation";
import { BotIcon, FileTextIcon, ShieldIcon, UsersIcon } from "lucide-react";
import { getAdminAccess } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * Shell for every /admin/* route.
 *
 * A resource-scoped grantee (blog-only, leads-only) and a full platform admin
 * both land here, so the nav only ever shows the sections a given account can
 * actually open. This is the one place that decides visibility; each page
 * still re-checks access itself on the server; a hidden link is a courtesy,
 * not the security boundary.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess();
  if (!access) redirect("/login");
  if (!access.isPlatformAdmin && access.resources.length === 0) redirect("/app");

  const tabs = [
    access.isPlatformAdmin ? { href: "/admin", label: "Overview", icon: ShieldIcon } : null,
    access.resources.includes("leads") ? { href: "/admin/leads", label: "Leads", icon: UsersIcon } : null,
    access.resources.includes("blog") ? { href: "/admin/blog", label: "Blog", icon: FileTextIcon } : null,
    access.isPlatformAdmin ? { href: "/admin/team", label: "Team access", icon: BotIcon } : null,
  ].filter((tab): tab is { href: string; label: string; icon: typeof ShieldIcon } => tab !== null);

  return (
    <div className="min-h-screen bg-secondary/20">
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-3 sm:px-6">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              )}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
