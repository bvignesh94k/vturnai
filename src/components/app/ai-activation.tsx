import Link from "next/link";
import { AlertTriangleIcon, ArrowRightIcon, CheckIcon, PlayIcon } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startAiScanAction } from "@/app/app/actions";
import { ENGINES, type EngineId } from "@/lib/config/engines";
import type { ProviderStatus } from "@/lib/ai-engines/types";
import { cn } from "@/lib/utils";

type StepState = "done" | "blocked" | "ready";

interface Step {
  state: StepState;
  title: string;
  detail: React.ReactNode;
  action: React.ReactNode;
}

function StepRow({ step, index }: { step: Step; index: number }) {
  return (
    <li className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          step.state === "done" &&
            "bg-[color-mix(in_oklch,var(--success)_16%,transparent)] text-success",
          step.state === "blocked" &&
            "bg-[color-mix(in_oklch,var(--destructive)_15%,transparent)] text-destructive",
          step.state === "ready" && "bg-primary-soft text-primary",
        )}
      >
        {step.state === "done" ? <CheckIcon className="size-4" /> : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold tracking-tight">{step.title}</h3>
        <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</div>
        <div className="mt-3">{step.action}</div>
      </div>
    </li>
  );
}

/**
 * Shown on AI Visibility before the first scan produces data.
 *
 * The generic "run your first scan" empty state was misleading on a fresh
 * account: the scan button was the loudest thing on the page while the reason
 * a scan would return almost nothing (four of six engines unconfigured, two of
 * twenty-five prompts active) sat in an alert below the fold. This orders the
 * work instead, so the blocking step is the first thing read, and states the
 * exact size of the scan the current setup would produce rather than implying
 * full coverage.
 */
export function AiActivationChecklist({
  projectId,
  canWrite,
  providerStatuses,
  activePrompts,
  suggestedPrompts,
}: {
  projectId: string;
  canWrite: boolean;
  providerStatuses: ProviderStatus[];
  activePrompts: number;
  suggestedPrompts: number;
}) {
  const connected = providerStatuses.filter((status) => status.configured);
  const missing = providerStatuses.filter((status) => !status.configured);

  // What a scan launched right now would actually cover. Stating this up front
  // stops a two-engine scan from being read as a full picture of the market.
  const answers = connected.length * activePrompts;

  const steps: Step[] = [
    {
      /**
       * Engine coverage is something we operate, not something the customer
       * configures. Provider keys live on the deployment, so naming an
       * environment variable here asks a marketer to do something they have no
       * access to and no reason to understand. State the coverage, explain what
       * it means for their reading, and leave it there.
       */
      state: "done",
      title: `Engines covering your market: ${connected.length} of ${providerStatuses.length}`,
      detail:
        missing.length === 0 ? (
          <p>
            Every engine we support is live, so your reading covers the whole market we can
            observe.
          </p>
        ) : (
          <>
            <p>
              A missing engine is a blank, not a zero. We never estimate a number to fill the gap,
              so {missing.map((status) => status.name).join(" and ")}{" "}
              {missing.length === 1 ? "is" : "are"} left out of your scores entirely rather than
              counted against you.
            </p>
            <p className="mt-2 text-xs">
              We are working on adding{" "}
              {missing.length === 1 ? "this engine" : "these engines"}. Nothing is needed from you.
            </p>
          </>
        ),
      action: null,
    },
    {
      state: activePrompts === 0 ? "blocked" : suggestedPrompts > 0 ? "ready" : "done",
      title: `Activate the questions to track: ${activePrompts} active`,
      detail:
        activePrompts === 0 ? (
          <p>
            Nothing runs until you activate a prompt. These are the questions we put to each engine
            on your behalf, so they decide what the whole score measures.
          </p>
        ) : suggestedPrompts > 0 ? (
          <p>
            {suggestedPrompts} suggested {suggestedPrompts === 1 ? "prompt is" : "prompts are"}{" "}
            waiting for review, drawn from your site content and your Search Console queries. Every
            one you leave inactive is a question your buyers ask that you will not see answered.
          </p>
        ) : (
          <p>All suggestions reviewed. {activePrompts} questions are being tracked.</p>
        ),
      action:
        activePrompts === 0 || suggestedPrompts > 0 ? (
          <Button size="sm" variant="outline" asChild>
            <Link href="/app/prompts">
              {activePrompts === 0 ? "Set up prompts" : `Review ${suggestedPrompts} suggestions`}{" "}
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        ) : null,
    },
    {
      state: answers === 0 ? "blocked" : "ready",
      title: "Run the first scan",
      detail:
        answers === 0 ? (
          <p>
            A scan needs at least one connected engine and one active prompt. Finish the steps above
            and this unlocks.
          </p>
        ) : (
          <>
            <p>
              This run asks {connected.length} {connected.length === 1 ? "engine" : "engines"} (
              {connected.map((status) => ENGINES[status.id as EngineId].name).join(", ")}){" "}
              {activePrompts} {activePrompts === 1 ? "question" : "questions"}, so it records{" "}
              <span className="font-medium text-foreground">{answers} answers</span>.
            </p>
            {missing.length > 0 ? (
              <p className="mt-2 flex items-start gap-1.5 text-warning">
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Results will cover {connected.length} of {providerStatuses.length} engines. Read
                  them as a partial view until the rest are connected.
                </span>
              </p>
            ) : null}
          </>
        ),
      action:
        canWrite && answers > 0 ? (
          <ActionButton
            action={startAiScanAction}
            fields={{ projectId }}
            variant="gradient"
            size="sm"
            pendingLabel="Starting the scan"
          >
            <PlayIcon /> Run AI visibility scan
          </ActionButton>
        ) : null,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Three steps to your first AI visibility reading</CardTitle>
        <CardDescription>
          Once this runs you will see which engines name you, which cite your pages, which recommend
          a competitor instead, and the exact wording each one used.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="divide-y">
          {steps.map((step, index) => (
            <StepRow key={step.title} step={step} index={index} />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
