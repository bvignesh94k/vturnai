"use client";

import * as React from "react";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingIcon,
  CheckIcon,
  GlobeIcon,
  Loader2Icon,
  PlusIcon,
  TagIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { completeOnboardingAction, validateSiteUrlAction, type OnboardingState } from "@/app/onboarding/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PRO_PLAN } from "@/lib/config/plans";
import { cn } from "@/lib/utils";

const COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ZA", name: "South Africa" },
];

const STEPS = [
  { id: 1, title: "Your website", icon: GlobeIcon },
  { id: 2, title: "Your brand", icon: TagIcon },
  { id: 3, title: "Your business", icon: BuildingIcon },
  { id: 4, title: "Your market", icon: UsersIcon },
  { id: 5, title: "Competitors", icon: UsersIcon },
];

interface Competitor {
  brandName: string;
  siteUrl: string;
}

const INITIAL_STATE: OnboardingState = {};

export function OnboardingWizard({
  defaultCountry,
  userName,
  initialSiteUrl,
}: {
  defaultCountry: string;
  userName: string | null;
  /** Pre-filled when someone arrives from the free visibility check. */
  initialSiteUrl: string;
}) {
  const [step, setStep] = React.useState(1);
  const [siteUrl, setSiteUrl] = React.useState(initialSiteUrl);
  const [brandName, setBrandName] = React.useState("");
  const [businessCategory, setBusinessCategory] = React.useState("");
  const [businessDescription, setBusinessDescription] = React.useState("");
  const [targetCountry, setTargetCountry] = React.useState(
    COUNTRIES.some((country) => country.code === defaultCountry) ? defaultCountry : "IN",
  );
  const [targetAudience, setTargetAudience] = React.useState("");
  const [competitors, setCompetitors] = React.useState<Competitor[]>([]);
  const [competitorDraft, setCompetitorDraft] = React.useState<Competitor>({ brandName: "", siteUrl: "" });

  const [urlChecking, setUrlChecking] = React.useState(false);
  const [urlError, setUrlError] = React.useState<string | null>(null);

  const [state, formAction, pending] = React.useActionState(completeOnboardingAction, INITIAL_STATE);

  async function handleUrlContinue() {
    setUrlError(null);
    setUrlChecking(true);
    try {
      const result = await validateSiteUrlAction(siteUrl);
      if (!result.ok) {
        setUrlError(result.message ?? "That website could not be reached.");
        return;
      }
      // Offer a sensible brand name derived from the domain.
      if (!brandName) {
        const host = siteUrl.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] ?? "";
        const root = host.split(".")[0] ?? "";
        if (root) setBrandName(root.charAt(0).toUpperCase() + root.slice(1));
      }
      setStep(2);
    } finally {
      setUrlChecking(false);
    }
  }

  function addCompetitor() {
    const name = competitorDraft.brandName.trim();
    if (name.length < 2) return;
    if (competitors.length >= PRO_PLAN.limits.competitors) return;
    if (competitors.some((entry) => entry.brandName.toLowerCase() === name.toLowerCase())) return;
    setCompetitors([...competitors, { brandName: name, siteUrl: competitorDraft.siteUrl.trim() }]);
    setCompetitorDraft({ brandName: "", siteUrl: "" });
  }

  const canContinue: Record<number, boolean> = {
    1: siteUrl.trim().length > 3,
    2: brandName.trim().length > 1,
    3: businessCategory.trim().length > 1 && businessDescription.trim().length >= 20,
    4: targetAudience.trim().length > 2,
    5: true,
  };

  return (
    <div>
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm">
          <p className="font-medium">
            Step {step} of {STEPS.length}
          </p>
          <p className="text-muted-foreground">{STEPS[step - 1]?.title}</p>
        </div>
        <Progress value={(step / STEPS.length) * 100} className="mt-3" />
        <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {STEPS.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                entry.id === step ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {entry.id < step ? (
                <CheckIcon className="size-3.5 text-[var(--success)]" />
              ) : (
                <entry.icon className="size-3.5" />
              )}
              {entry.title}
            </li>
          ))}
        </ol>
      </div>

      <div className="card-elevated rounded-2xl border bg-card p-6 sm:p-8">
        {state.error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircleIcon />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        {/* Step 1: website */}
        {step === 1 ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {userName ? `Welcome, ${userName.split(" ")[0]}.` : "Welcome."} What website should we
              analyse?
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We will crawl up to {PRO_PLAN.limits.crawledUrls} pages, read your robots.txt and
              sitemap, and score every page. Only publicly accessible content is read.
            </p>

            <div className="mt-7 space-y-2">
              <Label htmlFor="siteUrl">Website address</Label>
              <Input
                id="siteUrl"
                value={siteUrl}
                onChange={(event) => {
                  setSiteUrl(event.target.value);
                  setUrlError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canContinue[1]) {
                    event.preventDefault();
                    void handleUrlContinue();
                  }
                }}
                placeholder="yourwebsite.com"
                inputMode="url"
                autoComplete="url"
                autoFocus
                className="h-11 text-base"
                aria-invalid={Boolean(urlError ?? state.fieldErrors?.["siteUrl"])}
              />
              {(urlError ?? state.fieldErrors?.["siteUrl"]) ? (
                <p className="text-xs text-destructive">{urlError ?? state.fieldErrors?.["siteUrl"]}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  You must own this site or be authorised to analyse it.
                </p>
              )}
            </div>

            <div className="mt-8 flex justify-end">
              <Button
                size="lg"
                variant="gradient"
                onClick={() => void handleUrlContinue()}
                disabled={!canContinue[1] || urlChecking}
              >
                {urlChecking ? (
                  <>
                    <Loader2Icon className="animate-spin" /> Checking…
                  </>
                ) : (
                  <>
                    Continue <ArrowRightIcon />
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Step 2: brand */}
        {step === 2 ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">What is your brand called?</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We look for this exact name in AI answers to decide whether you were mentioned. Use the
              name customers would actually say.
            </p>

            <div className="mt-7 space-y-2">
              <Label htmlFor="brandName">Brand name</Label>
              <Input
                id="brandName"
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                placeholder="Acme Technologies"
                autoFocus
                className="h-11 text-base"
                aria-invalid={Boolean(state.fieldErrors?.["brandName"])}
              />
              {state.fieldErrors?.["brandName"] ? (
                <p className="text-xs text-destructive">{state.fieldErrors["brandName"]}</p>
              ) : null}
            </div>

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              nextDisabled={!canContinue[2]}
            />
          </div>
        ) : null}

        {/* Step 3: business */}
        {step === 3 ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">What does your business do?</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This is how we work out which questions to track. Write it the way you would explain it
              to a customer, not to a search engine.
            </p>

            <div className="mt-7 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="businessCategory">Business category</Label>
                <Input
                  id="businessCategory"
                  value={businessCategory}
                  onChange={(event) => setBusinessCategory(event.target.value)}
                  placeholder="CRM software"
                  autoFocus
                  aria-invalid={Boolean(state.fieldErrors?.["businessCategory"])}
                />
                <p className="text-xs text-muted-foreground">
                  The category a buyer would search for, e.g. &ldquo;CRM software&rdquo; or
                  &ldquo;GST accounting service&rdquo;.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessDescription">Short description</Label>
                <Textarea
                  id="businessDescription"
                  value={businessDescription}
                  onChange={(event) => setBusinessDescription(event.target.value)}
                  placeholder="We provide affordable CRM software for small sales teams in India, with GST invoicing and WhatsApp follow-ups built in."
                  rows={4}
                  aria-invalid={Boolean(state.fieldErrors?.["businessDescription"])}
                />
                <p className="text-xs text-muted-foreground">
                  {businessDescription.trim().length} / 20 characters minimum
                </p>
              </div>
            </div>

            <StepNav
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
              nextDisabled={!canContinue[3]}
            />
          </div>
        ) : null}

        {/* Step 4: market */}
        {step === 4 ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Who and where do you sell to?</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              AI answers differ by country. We pass this to each engine so the results match your
              actual market.
            </p>

            <div className="mt-7 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="targetCountry">Primary target country</Label>
                <Select value={targetCountry} onValueChange={setTargetCountry}>
                  <SelectTrigger id="targetCountry" className="w-full">
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetAudience">Target audience</Label>
                <Input
                  id="targetAudience"
                  value={targetAudience}
                  onChange={(event) => setTargetAudience(event.target.value)}
                  placeholder="Small sales teams of 3 to 20 people"
                  aria-invalid={Boolean(state.fieldErrors?.["targetAudience"])}
                />
                <p className="text-xs text-muted-foreground">
                  Who specifically buys from you. Used to phrase the tracked questions.
                </p>
              </div>
            </div>

            <StepNav
              onBack={() => setStep(3)}
              onNext={() => setStep(5)}
              nextDisabled={!canContinue[4]}
            />
          </div>
        ) : null}

        {/* Step 5: competitors + submit */}
        {step === 5 ? (
          <form action={formAction}>
            <input type="hidden" name="siteUrl" value={siteUrl} />
            <input type="hidden" name="brandName" value={brandName} />
            <input type="hidden" name="businessCategory" value={businessCategory} />
            <input type="hidden" name="businessDescription" value={businessDescription} />
            <input type="hidden" name="targetCountry" value={targetCountry} />
            <input type="hidden" name="targetAudience" value={targetAudience} />
            <input type="hidden" name="primaryLanguage" value="en" />
            <input type="hidden" name="competitors" value={JSON.stringify(competitors)} />

            <h1 className="text-2xl font-semibold tracking-tight">
              Who do you lose deals to?
              <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
                Optional
              </span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              We measure how often AI answers name them instead of you. You can add up to{" "}
              {PRO_PLAN.limits.competitors}, and change them later.
            </p>

            <div className="mt-7 space-y-4">
              {competitors.length > 0 ? (
                <ul className="space-y-2">
                  {competitors.map((competitor, index) => (
                    <li
                      key={competitor.brandName}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-secondary/40 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{competitor.brandName}</p>
                        {competitor.siteUrl ? (
                          <p className="truncate text-xs text-muted-foreground">{competitor.siteUrl}</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${competitor.brandName}`}
                        onClick={() =>
                          setCompetitors(competitors.filter((_, entry) => entry !== index))
                        }
                      >
                        <XIcon />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {competitors.length < PRO_PLAN.limits.competitors ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={competitorDraft.brandName}
                    onChange={(event) =>
                      setCompetitorDraft({ ...competitorDraft, brandName: event.target.value })
                    }
                    placeholder="Competitor name"
                    aria-label="Competitor name"
                  />
                  <Input
                    value={competitorDraft.siteUrl}
                    onChange={(event) =>
                      setCompetitorDraft({ ...competitorDraft, siteUrl: event.target.value })
                    }
                    placeholder="competitor.com (optional)"
                    aria-label="Competitor website"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCompetitor();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCompetitor}
                    disabled={competitorDraft.brandName.trim().length < 2}
                  >
                    <PlusIcon /> Add
                  </Button>
                </div>
              ) : (
                <Badge variant="muted">
                  You have added the maximum of {PRO_PLAN.limits.competitors} competitors.
                </Badge>
              )}
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(4)} disabled={pending}>
                <ArrowLeftIcon /> Back
              </Button>
              <Button type="submit" size="lg" variant="gradient" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2Icon className="animate-spin" /> Setting up…
                  </>
                ) : competitors.length === 0 ? (
                  <>
                    Skip and finish <ArrowRightIcon />
                  </>
                ) : (
                  <>
                    Finish setup <ArrowRightIcon />
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between">
      <Button type="button" variant="ghost" onClick={onBack}>
        <ArrowLeftIcon /> Back
      </Button>
      <Button type="button" size="lg" variant="gradient" onClick={onNext} disabled={nextDisabled}>
        Continue <ArrowRightIcon />
      </Button>
    </div>
  );
}
