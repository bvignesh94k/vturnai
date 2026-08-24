"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { adminGrantSchema, adminGrantBulkSchema } from "@/lib/validation/schemas";
import { errorMessage, logger } from "@/lib/logger";

const log = logger.child("admin-team-actions");

export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

function fail(error: unknown): ActionResult {
  const message = errorMessage(error);
  log.warn("Team action failed", { message });
  return { ok: false, error: message || "Something went wrong. Please try again." };
}

/**
 * Every action here requires full platform_role admin, not just any admin
 * grant. Managing who else can reach the admin panel is the one action a
 * resource-scoped grantee must never be able to take on themselves.
 */
export async function setPlatformRoleAction(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const profileId = String(formData.get("profileId") ?? "");
    const role = String(formData.get("role") ?? "");
    if (!profileId || (role !== "admin" && role !== "user")) throw new Error("Invalid request.");

    const supabase = createServiceRoleClient();

    if (role === "user") {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("platform_role", "admin");
      if ((count ?? 0) <= 1) {
        throw new Error("At least one platform admin must remain. Promote another account first.");
      }
    }

    const { error } = await supabase.from("profiles").update({ platform_role: role }).eq("id", profileId);
    if (error) throw new Error(error.message);

    revalidatePath("/admin/team");
    return { ok: true, message: role === "admin" ? "Promoted to platform admin." : "Admin access removed." };
  } catch (error) {
    return fail(error);
  }
}

/** Promotes by email, since the caller is granting access to someone they cannot look up an id for. */
export async function promoteAdminByEmailAction(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) throw new Error("Enter an email address.");

    const supabase = createServiceRoleClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!profile) {
      throw new Error("No account with that email has signed up yet. They need an account first.");
    }

    const { error } = await supabase.from("profiles").update({ platform_role: "admin" }).eq("id", profile.id);
    if (error) throw new Error(error.message);

    revalidatePath("/admin/team");
    return { ok: true, message: `${email} is now a platform admin.` };
  } catch (error) {
    return fail(error);
  }
}

export async function addAdminGrantAction(formData: FormData): Promise<ActionResult> {
  try {
    const access = await requirePlatformAdmin();
    const parsed = adminGrantSchema.parse({
      email: formData.get("email"),
      resource: formData.get("resource"),
    });

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("admin_grants")
      .upsert(
        { email: parsed.email, resource: parsed.resource, granted_by: access.user.id },
        { onConflict: "email,resource", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);

    revalidatePath("/admin/team");
    return { ok: true, message: `${parsed.email} can now manage ${parsed.resource}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function addAdminGrantBulkAction(formData: FormData): Promise<ActionResult> {
  try {
    const access = await requirePlatformAdmin();
    const parsed = adminGrantBulkSchema.parse({
      emails: formData.get("emails"),
      resource: formData.get("resource"),
    });

    const supabase = createServiceRoleClient();
    const rows = parsed.emails.map((email) => ({
      email,
      resource: parsed.resource,
      granted_by: access.user.id,
    }));
    const { error } = await supabase
      .from("admin_grants")
      .upsert(rows, { onConflict: "email,resource", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    revalidatePath("/admin/team");
    return {
      ok: true,
      message: `Granted ${parsed.resource} access to ${parsed.emails.length} address${parsed.emails.length === 1 ? "" : "es"}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeAdminGrantAction(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformAdmin();
    const id = String(formData.get("id") ?? "");
    if (!id) throw new Error("Missing grant id.");

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("admin_grants").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/admin/team");
    return { ok: true, message: "Access revoked." };
  } catch (error) {
    return fail(error);
  }
}
