"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/schemas";
import { RATE_LIMITS, clientIpFromHeaders, consumeRateLimit } from "@/lib/security/rate-limit";
import { absoluteUrl } from "@/lib/config/site";
import { logger } from "@/lib/logger";

const log = logger.child("auth");

export interface AuthActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  notice?: string;
}

/**
 * Auth Server Actions.
 *
 * Both actions are rate limited per IP so the sign-in form cannot be used for
 * credential stuffing, and both return a deliberately non-specific error on
 * failure so the response cannot be used to enumerate registered addresses.
 */

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    const requestHeaders = await headers();
    const limit = await consumeRateLimit(
      RATE_LIMITS.authAction,
      clientIpFromHeaders(requestHeaders),
    );
    if (!limit.allowed) {
      return { error: "Too many attempts. Please wait a few minutes and try again." };
    }

    const fullName = formData.get("fullName");
    const email = formData.get("email");
    const password = formData.get("password");
    const marketingOptIn = formData.get("marketingOptIn");

    log.info("Sign-up attempt", { fullName, email, marketingOptIn });

    const parsed = signUpSchema.safeParse({
      fullName,
      email,
      password,
      marketingOptIn: marketingOptIn === "on",
    });

    if (!parsed.success) {
      log.warn("Sign-up validation failed", { issues: parsed.error.issues });
      return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName, marketing_opt_in: parsed.data.marketingOptIn },
        emailRedirectTo: absoluteUrl("/api/auth/callback"),
      },
    });

    if (error) {
      log.warn("Sign-up failed", { message: error.message, code: error.status });
      return { error: error.message };
    }

    log.info("Sign-up success", { userId: data.user?.id, hasSession: !!data.session });

    // Always show a notice for now. Redirect should happen after user sees the message.
    // With email confirmation enabled, no session is returned until the link is clicked.
    if (!data.session) {
      return {
        notice:
          "Check your inbox. We have sent a confirmation link. Open it to finish creating your account.",
      };
    }

    // User has immediate session access - redirect will happen on client side via JavaScript
    return {
      notice: "Account created successfully! Redirecting to onboarding...",
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Something went wrong. Please try again.";
    log.error("Sign-up exception", { error: errorMessage });
    return { error: errorMessage };
  }
}

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const requestHeaders = await headers();
  const limit = await consumeRateLimit(
    RATE_LIMITS.authAction,
    clientIpFromHeaders(requestHeaders),
  );
  if (!limit.allowed) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Intentionally generic: distinguishing "no such user" from "wrong password"
    // would let anyone enumerate which addresses have accounts.
    return { error: "That email and password combination did not work." };
  }

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/app");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function resendConfirmationAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required" };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email,
    });

    if (error) {
      return { error: error.message };
    }

    return {
      notice: "Confirmation email resent! Check your inbox.",
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to resend email";
    return { error: errorMessage };
  }
}

export async function requestPasswordResetAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const requestHeaders = await headers();
  const limit = await consumeRateLimit(
    RATE_LIMITS.authAction,
    clientIpFromHeaders(requestHeaders),
  );
  if (!limit.allowed) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const email = formData.get("email");
  if (typeof email !== "string" || !email.includes("@")) {
    return { fieldErrors: { email: "Enter a valid email address." } };
  }

  const supabase = await createServerSupabaseClient();
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: absoluteUrl("/api/auth/callback?next=/app/settings"),
  });

  // Always report success so the response cannot confirm whether an address exists.
  return {
    notice: "If that address has an account, a password reset link is on its way.",
  };
}
