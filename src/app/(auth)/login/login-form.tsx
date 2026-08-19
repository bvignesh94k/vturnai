"use client";

import * as React from "react";
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { signInAction, type AuthActionState } from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: AuthActionState = {};

export function LoginForm({
  next,
  initialError,
}: {
  next: string | null;
  initialError: string | null;
}) {
  const [state, formAction, pending] = React.useActionState(signInAction, INITIAL_STATE);
  const error = state.error ?? initialError;

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {state.notice ? (
        <Alert variant="success">
          <CheckCircle2Icon />
          <AlertDescription>{state.notice}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors?.["email"])}
          aria-describedby={state.fieldErrors?.["email"] ? "email-error" : undefined}
        />
        {state.fieldErrors?.["email"] ? (
          <p id="email-error" className="text-xs text-destructive">
            {state.fieldErrors["email"]}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.["password"])}
          aria-describedby={state.fieldErrors?.["password"] ? "password-error" : undefined}
        />
        {state.fieldErrors?.["password"] ? (
          <p id="password-error" className="text-xs text-destructive">
            {state.fieldErrors["password"]}
          </p>
        ) : null}
      </div>

      <Button type="submit" variant="gradient" className="w-full" size="lg" disabled={pending}>
        {pending ? (
          <>
            <Loader2Icon className="animate-spin" /> Logging in…
          </>
        ) : (
          "Log in"
        )}
      </Button>
    </form>
  );
}
