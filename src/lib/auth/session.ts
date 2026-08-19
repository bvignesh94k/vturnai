import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { OrganizationRow, ProfileRow, ProjectRow, OrgRole } from "@/lib/db/types";

export interface SessionUser {
  id: string;
  email: string;
  profile: ProfileRow;
}

export interface OrganizationMembership {
  organization: OrganizationRow;
  role: OrgRole;
}

export interface UserContext {
  user: SessionUser;
  memberships: OrganizationMembership[];
  /** The organization the user is currently acting in. */
  activeOrganization: OrganizationRow;
  activeRole: OrgRole;
  projects: ProjectRow[];
  isPlatformAdmin: boolean;
}

export class AccessDeniedError extends Error {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

/**
 * Current authenticated user, or null.
 *
 * `getUser()` revalidates the JWT with the auth server on every call, so this
 * is safe to use as an authorisation gate. Wrapped in `cache` so a single
 * render does not repeat the round trip.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // On a deployment where Supabase has not been configured yet, treat the
  // caller as signed out. Protected routes then redirect to /login, which
  // explains the situation, instead of throwing a 500.
  if (!isSupabaseConfigured()) return null;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;
  return { id: user.id, email: user.email ?? profile.email, profile };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Full context for the signed-in user: memberships, the active organization and
 * its projects. All queries run under RLS as the user, so a caller cannot be
 * handed an organization they do not belong to.
 */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createServerSupabaseClient();

  const { data: memberRows } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const memberships: OrganizationMembership[] = (memberRows ?? [])
    .map((row) => {
      const organization = row.organization as unknown as OrganizationRow | null;
      if (!organization) return null;
      return { organization, role: row.role as OrgRole };
    })
    .filter((entry): entry is OrganizationMembership => entry !== null);

  if (memberships.length === 0) return null;

  const active = memberships[0]!;

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("organization_id", active.organization.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return {
    user,
    memberships,
    activeOrganization: active.organization,
    activeRole: active.role,
    projects: projects ?? [],
    isPlatformAdmin: user.profile.platform_role === "admin",
  };
});

export async function requireUserContext(): Promise<UserContext> {
  const context = await getUserContext();
  if (!context) redirect("/login");
  return context;
}

export async function requirePlatformAdmin(): Promise<UserContext> {
  const context = await requireUserContext();
  if (!context.isPlatformAdmin) redirect("/app");
  return context;
}

/**
 * Load a project the user is entitled to see. Returns null rather than throwing
 * so callers can render a not-found state.
 */
export async function getProjectForUser(projectId: string): Promise<ProjectRow | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  return data ?? null;
}

/** The project the app should show: an explicit id, else the first project. */
export async function resolveActiveProject(
  context: UserContext,
  requestedProjectId?: string | null,
): Promise<ProjectRow | null> {
  if (requestedProjectId) {
    const match = context.projects.find((project) => project.id === requestedProjectId);
    if (match) return match;
    // Not in the active org's list — verify via RLS in case it belongs to
    // another organization the user is also a member of.
    return getProjectForUser(requestedProjectId);
  }
  return context.projects[0] ?? null;
}

const WRITE_ROLES: readonly OrgRole[] = ["owner", "admin", "member"];

export function canWrite(role: OrgRole): boolean {
  return WRITE_ROLES.includes(role);
}

export function assertCanWrite(role: OrgRole): void {
  if (!canWrite(role)) {
    throw new AccessDeniedError("Your role on this workspace is read-only.");
  }
}
