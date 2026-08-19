"use client";

import * as React from "react";
import { LogOutIcon } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { Button, type ButtonProps } from "@/components/ui/button";

export function SignOutButton({
  variant = "ghost",
  size = "sm",
  showLabel = true,
  className,
}: {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  showLabel?: boolean;
  className?: string;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      onClick={() => startTransition(() => void signOutAction())}
    >
      <LogOutIcon />
      {showLabel ? (pending ? "Signing out…" : "Sign out") : <span className="sr-only">Sign out</span>}
    </Button>
  );
}
