import "server-only";

import { notFound } from "next/navigation";
import { requireUserContext, resolveActiveProject, type UserContext } from "@/lib/auth/session";
import { getEntitlements, type Entitlements } from "@/lib/billing/entitlements";
import type { ProjectRow } from "@/lib/db/types";

/**
 * Every application page begins here.
 *
 * Resolves the signed-in user, the project they are looking at and the
 * organization's entitlements in one place, so no page has to re-derive who is
 * allowed to see what.
 */
export interface PageContext {
  context: UserContext;
  project: ProjectRow;
  entitlements: Entitlements;
  /** Whether the current member may trigger scans and edit configuration. */
  canWrite: boolean;
}

export async function loadPageContext(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<PageContext> {
  const context = await requireUserContext();
  const params = searchParams ? await searchParams : {};
  const requested = typeof params["project"] === "string" ? params["project"] : null;

  const project = await resolveActiveProject(context, requested);
  if (!project) notFound();

  const entitlements = await getEntitlements(context.activeOrganization.id);

  return {
    context,
    project,
    entitlements,
    canWrite: ["owner", "admin", "member"].includes(context.activeRole),
  };
}

/** Read a single string search param. */
export function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}
