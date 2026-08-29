import Link from "next/link";
import { ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

/**
 * Trial state, always in view.
 *
 * Someone should never have to go looking for whether they are paying, when
 * that changes, or whether money has already been taken. The exact end date is
 * shown rather than a countdown alone, and the reassurance that nothing has
 * been charged is stated plainly while it is still true.
 */
export function TrialBanner({
  daysRemaining,
  trialEndsAt,
  hasPaymentMethod,
  canManageBilling,
}: {
  daysRemaining: number;
  trialEndsAt: Date;
  /** A free trial has no mandate; an upgraded account does. */
  hasPaymentMethod: boolean;
  canManageBilling: boolean;
}) {
  const urgent = daysRemaining <= 2;

  return (
    <div
      className={[
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 text-sm sm:px-6",
        urgent
          ? "border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-[color-mix(in_oklch,var(--warning)_10%,var(--background))]"
          : "bg-muted/40",
      ].join(" ")}
    >
      <ClockIcon className="size-4 shrink-0 text-muted-foreground" />

      <p className="flex-1 leading-relaxed">
        <span className="font-medium">
          {daysRemaining === 0
            ? "Your free trial ends today"
            : `${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left in your free trial`}
        </span>
        <span className="text-muted-foreground">
          {" · "}
          {hasPaymentMethod
            ? `First charge on ${formatDate(trialEndsAt)}`
            : `Ends ${formatDate(trialEndsAt)}. No payment has been taken.`}
        </span>
      </p>

      {canManageBilling && !hasPaymentMethod ? (
        <Button asChild size="sm" variant={urgent ? "gradient" : "outline"}>
          <Link href="/app/billing">Upgrade</Link>
        </Button>
      ) : null}
    </div>
  );
}
