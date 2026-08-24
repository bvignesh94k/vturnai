import Link from "next/link";
import { ArrowRightIcon, BotIcon, PlayIcon, SparklesIcon } from "lucide-react";
import { ActionButton } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { startAiScanAction } from "@/app/app/actions";

/**
 * What the dashboard shows in place of the AI metric strip before any AI
 * visibility data exists.
 *
 * A row of five em dashes reads as "this product is broken", not "this measurement
 * has not run yet", and it is the first thing a new account sees, immediately
 * after a set of website scores that did compute. One card that names the single
 * next action is more honest about the state and far more useful than five dead
 * tiles that each repeat the same absence.
 *
 * The three states below are genuinely different problems with different fixes,
 * so they get different copy rather than one generic "no data" message.
 */
export function AiActivationCard({
  brandName,
  vScore,
  suggestedPrompts,
  trackedPrompts,
  engineNames,
  projectId,
  canWrite,
  scanInProgress,
}: {
  brandName: string;
  vScore: number | null;
  /** A few inactive suggestions, quoted verbatim so the value is concrete. */
  suggestedPrompts: readonly string[];
  trackedPrompts: number;
  /** Display names of engines with credentials configured server-side. */
  engineNames: readonly string[];
  projectId: string;
  canWrite: boolean;
  scanInProgress: boolean;
}) {
  // No provider key is configured, so nothing the user does here can produce a
  // measurement. Saying so plainly beats an action button that would only fail.
  if (engineNames.length === 0) {
    return (
      <Shell
        icon={<BotIcon className="size-5" />}
        title="AI engine monitoring is not connected yet"
        body={
          <>
            Your website scores above are measured and current. AI visibility is a separate
            measurement that needs a connection to the answer engines themselves, and none is
            configured on this account yet.
          </>
        }
        action={
          canWrite ? (
            <Button variant="outline" asChild>
              <Link href="/app/integrations">
                Connect an AI engine <ArrowRightIcon />
              </Link>
            </Button>
          ) : null
        }
      />
    );
  }

  const engineList = formatList(engineNames);

  // Prompts exist but none are switched on: the user has a review step waiting.
  if (trackedPrompts === 0) {
    return (
      <Shell
        icon={<SparklesIcon className="size-5" />}
        title={
          vScore !== null
            ? `${brandName} scores ${Math.round(vScore)} on your own site. Now find out what ${engineList} say about it.`
            : `Find out what ${engineList} say about ${brandName}.`
        }
        body={
          <>
            Your site scores measure what you control. They cannot tell you whether an AI assistant
            actually names you when someone asks for a recommendation. Activate a few questions and
            we will ask {engineList} on your behalf.
          </>
        }
        examples={suggestedPrompts}
        action={
          canWrite ? (
            <Button variant="gradient" asChild>
              <Link href="/app/prompts">
                Activate prompts <ArrowRightIcon />
              </Link>
            </Button>
          ) : null
        }
      />
    );
  }

  // Prompts are active, so the only thing missing is a run.
  return (
    <Shell
      icon={<BotIcon className="size-5" />}
      title={`${trackedPrompts} prompt${trackedPrompts === 1 ? "" : "s"} ready to measure`}
      body={
        scanInProgress ? (
          <>
            Your first AI visibility scan is running now. Mention, citation and recommendation rates
            appear here as soon as {engineList} respond.
          </>
        ) : (
          <>
            Nothing has been sent to {engineList} yet. Run a scan to see whether {brandName} gets
            mentioned, cited and recommended when people ask.
          </>
        )
      }
      examples={suggestedPrompts}
      action={
        canWrite && !scanInProgress ? (
          <ActionButton
            action={startAiScanAction}
            fields={{ projectId }}
            variant="gradient"
            pendingLabel="Starting…"
          >
            <PlayIcon /> Run your first AI scan
          </ActionButton>
        ) : null
      }
    />
  );
}

function Shell({
  icon,
  title,
  body,
  examples = [],
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  examples?: readonly string[];
  action: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug tracking-tight text-balance">
            {title}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{body}</p>

          {examples.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {examples.map((prompt) => (
                <li
                  key={prompt}
                  className="truncate text-sm text-muted-foreground before:mr-2 before:text-primary before:content-['“'] after:text-primary after:content-['”']"
                >
                  {prompt}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {action ? <div className="shrink-0 sm:pt-0.5">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

/** "ChatGPT, Gemini and Claude", an Oxford-less list for inline prose. */
function formatList(items: readonly string[]): string {
  if (items.length === 0) return "AI engines";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
