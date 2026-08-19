"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/app/app/actions";

/**
 * A button that runs a Server Action and reports the outcome.
 *
 * Actions return `{ ok, message, error }` rather than throwing, so a quota
 * refusal or billing block reaches the user as a precise sentence instead of an
 * error boundary.
 */
export function ActionButton({
  action,
  fields,
  children,
  pendingLabel,
  confirm,
  variant = "default",
  size = "default",
  className,
  disabled,
  onSuccess,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  fields?: Record<string, string | string[]>;
  children: React.ReactNode;
  pendingLabel?: string;
  confirm?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run() {
    if (confirm && !window.confirm(confirm)) return;

    const formData = new FormData();
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (Array.isArray(value)) {
        for (const entry of value) formData.append(key, entry);
      } else {
        formData.set(key, value);
      }
    }

    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        if (result.message) toast.success(result.message);
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || pending}
      onClick={run}
    >
      {pending ? (
        <>
          <Loader2Icon className="animate-spin" />
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
