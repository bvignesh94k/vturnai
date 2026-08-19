import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUserContext, resolveActiveProject } from "@/lib/auth/session";
import { getActiveJobForProject } from "@/lib/jobs/queue";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BuildingProfile } from "@/app/onboarding/building/building-profile";

export const metadata: Metadata = {
  title: "Building your visibility profile",
  robots: { index: false, follow: false },
};

export default async function BuildingPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const [context, params] = await Promise.all([requireUserContext(), searchParams]);
  const project = await resolveActiveProject(context, params.project ?? null);
  if (!project) notFound();

  const supabase = await createServerSupabaseClient();
  const [{ data: crawl }, activeJob] = await Promise.all([
    supabase
      .from("crawls")
      .select("status, urls_crawled, max_urls")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getActiveJobForProject(project.id),
  ]);

  // Nothing left running and a finished crawl means the profile is ready.
  if (!activeJob && crawl?.status === "completed") {
    redirect("/app");
  }

  return (
    <BuildingProfile
      projectId={project.id}
      projectName={project.name}
      siteUrl={project.site_url}
      initialLabel={activeJob?.progress_label ?? "Building your visibility profile…"}
      initialCurrent={activeJob?.progress_current ?? crawl?.urls_crawled ?? 0}
      initialTotal={activeJob?.progress_total ?? crawl?.max_urls ?? 0}
    />
  );
}
