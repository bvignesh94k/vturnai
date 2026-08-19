"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  bulkActivatePromptsAction,
  createPromptAction,
  deletePromptAction,
  updatePromptAction,
} from "@/app/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PROMPT_GROUP_DESCRIPTIONS, PROMPT_GROUP_LABELS } from "@/lib/ai-engines/prompt-suggestions";
import type { PromptGroupDb } from "@/lib/db/types";
import { relativeTime } from "@/lib/utils";

export interface PromptRowView {
  id: string;
  promptText: string;
  intent: string | null;
  topic: string | null;
  group: PromptGroupDb;
  country: string;
  language: string;
  priority: number;
  isActive: boolean;
  isSuggested: boolean;
  suggestionSource: string | null;
  lastRunAt: string | null;
}

type Filter = "all" | "active" | "suggested" | "inactive";

const SOURCE_LABELS: Record<string, string> = {
  website_content: "From your website",
  services: "From your services",
  search_console: "From Search Console",
  competitors: "From competitors",
  business_description: "From your description",
  headings: "From your headings",
};

export function PromptManager({
  projectId,
  prompts,
  activeCount,
  activeLimit,
  defaultCountry,
  canWrite,
}: {
  projectId: string;
  prompts: readonly PromptRowView[];
  activeCount: number;
  activeLimit: number;
  defaultCountry: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();
  const [showForm, setShowForm] = React.useState(false);

  const visible = prompts.filter((prompt) => {
    if (filter === "active" && !prompt.isActive) return false;
    if (filter === "suggested" && (!prompt.isSuggested || prompt.isActive)) return false;
    if (filter === "inactive" && (prompt.isActive || prompt.isSuggested)) return false;
    if (query && !prompt.promptText.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const remaining = activeLimit - activeCount;

  function run(action: (formData: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>, formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        if (result.message) toast.success(result.message);
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function toggleActive(prompt: PromptRowView, next: boolean) {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("promptId", prompt.id);
    formData.set("isActive", String(next));
    run(updatePromptAction, formData);
  }

  function bulkActivate(next: boolean) {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("isActive", String(next));
    for (const id of selected) formData.append("promptIds", id);
    run(bulkActivatePromptsAction, formData);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All ({prompts.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
            <TabsTrigger value="suggested">
              Suggested ({prompts.filter((p) => p.isSuggested && !p.isActive).length})
            </TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-48 flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search prompts"
            className="pl-8"
            aria-label="Search prompts"
          />
        </div>

        <Badge variant={remaining <= 0 ? "warning" : "muted"}>
          {activeCount} / {activeLimit} active
        </Badge>

        {canWrite ? (
          <Button variant="gradient" onClick={() => setShowForm((value) => !value)}>
            <PlusIcon /> Add prompt
          </Button>
        ) : null}
      </div>

      {/* Add form */}
      {showForm && canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a prompt</CardTitle>
            <CardDescription>
              Write it exactly as a customer would ask an AI assistant, in a full sentence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={(formData) => {
                formData.set("projectId", projectId);
                run(createPromptAction, formData);
                setShowForm(false);
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="promptText">Prompt</Label>
                <Input
                  id="promptText"
                  name="promptText"
                  required
                  minLength={8}
                  placeholder="What are the best CRM platforms for SMEs in India?"
                  className="h-11"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="promptGroup">Intent group</Label>
                  <Select name="promptGroup" defaultValue="recommendation">
                    <SelectTrigger id="promptGroup" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PROMPT_GROUP_LABELS) as PromptGroupDb[]).map((group) => (
                        <SelectItem key={group} value={group}>
                          {PROMPT_GROUP_LABELS[group]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select name="priority" defaultValue="3">
                    <SelectTrigger id="priority" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Highest</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3 — Normal</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="5">5 — Lowest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" name="country" defaultValue={defaultCountry} maxLength={2} />
                </div>
              </div>

              <input type="hidden" name="isActive" value={remaining > 0 ? "true" : "false"} />

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="gradient" disabled={pending}>
                  {pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                  Add prompt
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Bulk bar */}
      {selected.size > 0 && canWrite ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-secondary/50 px-4 py-3">
          <p className="text-sm font-medium">{selected.size} selected</p>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => bulkActivate(true)}>
            Activate
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => bulkActivate(false)}>
            Deactivate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {/* List */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchIcon className="size-5" />}
          title={query ? "No prompts match that search" : "No prompts here yet"}
          description={
            query
              ? "Try a different search term."
              : "Prompts are the questions we ask each AI engine. Add the ones that precede a purchase in your category."
          }
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((prompt) => (
            <li
              key={prompt.id}
              className="card-elevated flex flex-wrap items-start gap-3 rounded-xl border bg-card px-4 py-3.5"
            >
              {canWrite ? (
                <Checkbox
                  className="mt-1"
                  checked={selected.has(prompt.id)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked === true) next.add(prompt.id);
                    else next.delete(prompt.id);
                    setSelected(next);
                  }}
                  aria-label={`Select ${prompt.promptText}`}
                />
              ) : null}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{prompt.promptText}</p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="soft" title={PROMPT_GROUP_DESCRIPTIONS[prompt.group]}>
                    {PROMPT_GROUP_LABELS[prompt.group]}
                  </Badge>
                  <Badge variant="outline">{prompt.country}</Badge>
                  <Badge variant="muted">P{prompt.priority}</Badge>
                  {prompt.isSuggested && !prompt.isActive ? (
                    <Badge variant="info">
                      {prompt.suggestionSource
                        ? (SOURCE_LABELS[prompt.suggestionSource] ?? "Suggested")
                        : "Suggested"}
                    </Badge>
                  ) : null}
                  {prompt.lastRunAt ? (
                    <span className="text-xs text-muted-foreground">
                      Last run {relativeTime(prompt.lastRunAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Never run</span>
                  )}
                </div>

                {prompt.intent ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{prompt.intent}</p>
                ) : null}
              </div>

              {canWrite ? (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={prompt.isActive}
                    disabled={pending || (!prompt.isActive && remaining <= 0)}
                    onCheckedChange={(checked) => toggleActive(prompt, checked)}
                    aria-label={prompt.isActive ? "Deactivate prompt" : "Activate prompt"}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete prompt"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm("Remove this prompt and its history?")) return;
                      const formData = new FormData();
                      formData.set("projectId", projectId);
                      formData.set("promptId", prompt.id);
                      run(deletePromptAction, formData);
                    }}
                  >
                    <Trash2Icon className="text-muted-foreground" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
