import type { Metadata } from "next";
import { MessageSquareQuoteIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PromptManager } from "@/app/app/prompts/prompt-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { loadPageContext } from "@/lib/data/project-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Prompt Tracker" };

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project, entitlements, canWrite } = await loadPageContext(searchParams);
  const supabase = await createServerSupabaseClient();

  const { data: prompts } = await supabase
    .from("prompts")
    .select("*")
    .eq("project_id", project.id)
    .order("is_active", { ascending: false })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = prompts ?? [];
  const activeCount = rows.filter((prompt) => prompt.is_active).length;
  const suggestedCount = rows.filter((prompt) => prompt.is_suggested && !prompt.is_active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prompt Tracker"
        description="People do not type keywords into an AI assistant — they ask questions. These are the questions we send to each engine on your behalf."
      />

      {suggestedCount > 0 ? (
        <Alert variant="info">
          <MessageSquareQuoteIcon />
          <AlertTitle>
            {suggestedCount} suggested prompt{suggestedCount === 1 ? "" : "s"} waiting for review
          </AlertTitle>
          <AlertDescription>
            We generated these from your website content, your services and your Search Console
            queries. Edit anything that does not sound like a real customer question, then activate
            the ones worth tracking. Nothing runs until you activate it.
          </AlertDescription>
        </Alert>
      ) : null}

      <PromptManager
        projectId={project.id}
        prompts={rows.map((prompt) => ({
          id: prompt.id,
          promptText: prompt.prompt_text,
          intent: prompt.intent,
          topic: prompt.topic,
          group: prompt.prompt_group,
          country: prompt.country,
          language: prompt.language,
          priority: prompt.priority,
          isActive: prompt.is_active,
          isSuggested: prompt.is_suggested,
          suggestionSource: prompt.suggestion_source,
          lastRunAt: prompt.last_run_at,
        }))}
        activeCount={activeCount}
        activeLimit={entitlements.limits.activePrompts}
        defaultCountry={project.target_country}
        canWrite={canWrite}
      />
    </div>
  );
}
