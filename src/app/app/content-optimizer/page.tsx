import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ContentOptimizer } from "@/app/app/content-optimizer/content-optimizer";
import { loadPageContext } from "@/lib/data/project-context";

export const metadata: Metadata = { title: "Content Optimizer" };

export default async function ContentOptimizerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project } = await loadPageContext(searchParams);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Optimizer"
        description="Score an existing page or a draft before you publish it. Nothing here overwrites your content — every suggestion is yours to copy or ignore."
      />
      <ContentOptimizer projectId={project.id} siteUrl={project.site_url} />
    </div>
  );
}
