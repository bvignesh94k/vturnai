"use client";

import * as React from "react";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { signUpAction, type AuthActionState } from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: AuthActionState = {};

export function SignupForm() {
  const [state, formAction, pending] = React.useActionState(signUpAction, INITIAL_STATE);

  if (state.notice) {
    return (
      <Alert variant="success" className="mt-8">
        <CheckCircle2Icon />
        <AlertDescription>{state.notice}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="fullName">Your name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          aria-invalid={Boolean(state.fieldErrors?.["fullName"])}
        />
        {state.fieldErrors?.["fullName"] ? (
          <p className="text-xs text-destructive">{state.fieldErrors["fullName"]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors?.["email"])}
        />
        {state.fieldErrors?.["email"] ? (
          <p className="text-xs text-destructive">{state.fieldErrors["email"]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          aria-invalid={Boolean(state.fieldErrors?.["password"])}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 10 characters.
        </p>
        {state.fieldErrors?.["password"] ? (
          <p className="text-xs text-destructive">{state.fieldErrors["password"]}</p>
        ) : null}
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox id="marketingOptIn" name="marketingOptIn" className="mt-0.5" />
        <Label htmlFor="marketingOptIn" className="text-sm font-normal leading-relaxed text-muted-foreground">
          Send me occasional product updates. No newsletters, and you can opt out any time.
        </Label>
      </div>

      <Button type="submit" variant="gradient" className="w-full" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2Icon className="animate-spin" /> Creating your account…
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </form>
  );
}
