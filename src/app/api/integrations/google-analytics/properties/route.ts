import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listAnalyticsProperties } from "@/lib/integrations/analytics";
import { errorMessage } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the GA4 properties the connected Google account can actually read. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, organization_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const properties = await listAnalyticsProperties({
      organizationId: project.organization_id,
      projectId: project.id,
    });
    return NextResponse.json({ properties }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 502 });
  }
}
