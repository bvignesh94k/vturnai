import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { NotificationTypeDb } from "@/lib/db/types";

const log = logger.child("notifications");

export interface CreateNotificationInput {
  userId: string;
  organizationId?: string | null;
  projectId?: string | null;
  type: NotificationTypeDb;
  title: string;
  body: string;
  actionUrl?: string | null;
}

/**
 * Create an in-app notification, and send an email when a provider is
 * configured. Email is entirely optional: with no provider the product still
 * works, it just does not send mail.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      project_id: input.projectId ?? null,
      notification_type: input.type,
      title: input.title,
      body: input.body,
      action_url: input.actionUrl ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    log.error("Failed to create notification", { input, error });
    return;
  }

  if (!data?.id) return;
  await maybeSendEmail(input, data.id);
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Email delivery via Resend when configured.
 *
 * Deliberately a thin fetch call rather than an SDK dependency: the payload is
 * small and this keeps the provider swappable.
 */
async function maybeSendEmail(input: CreateNotificationInput, notificationId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return;

  const supabase = createServiceRoleClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", input.userId)
    .maybeSingle();

  if (!profile?.email) return;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || "V Turn AI <notifications@vturnai.com>",
        to: [profile.email],
        subject: input.title,
        text: `${input.body}\n\n${input.actionUrl ?? ""}`.trim(),
      }),
    });

    if (!response.ok) {
      log.warn("Email provider rejected notification", {
        notificationId,
        status: response.status,
      });
      return;
    }

    await supabase
      .from("notifications")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", notificationId);
  } catch (error) {
    log.warn("Email delivery failed", { notificationId, error });
  }
}

/** Notify every member of an organization who can act on the message. */
export async function notifyOrganization(
  organizationId: string,
  input: Omit<CreateNotificationInput, "userId" | "organizationId">,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);

  await Promise.all(
    (members ?? []).map((member) =>
      createNotification({ ...input, userId: member.user_id, organizationId }),
    ),
  );
}
