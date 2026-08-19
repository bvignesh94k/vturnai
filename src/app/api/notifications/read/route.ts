import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mark the signed-in user's notifications as read. RLS scopes this to them. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: "Could not update notifications" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
