"use client";

import * as React from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import {
  cancelSubscriptionAction,
  refreshSubscriptionAction,
  startSubscriptionAction,
  verifyCheckoutAction,
} from "@/app/app/billing/actions";
import { Button } from "@/components/ui/button";
import { formatCurrencyINR } from "@/lib/utils";

/**
 * Razorpay Checkout handshake.
 *
 * The browser only ever receives the publishable key id and the subscription
 * id. The handler posts Razorpay's signed response straight back to a Server
 * Action, which verifies the signature and then re-reads the true state from
 * Razorpay's API before anything is written.
 */
interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: { email: string };
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

export function BillingPanel({
  status,
  isActive,
  isTrialing,
  cancelAtPeriodEnd,
  canManage,
  razorpayConfigured,
  publicKeyId,
  organizationName,
  email,
  planName,
  priceMinor,
  trialDays,
}: {
  status: string;
  isActive: boolean;
  isTrialing: boolean;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  razorpayConfigured: boolean;
  publicKeyId: string;
  organizationName: string;
  email: string;
  planName: string;
  priceMinor: number;
  trialDays: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [scriptReady, setScriptReady] = React.useState(false);

  function openCheckout(subscriptionId: string, keyId: string, shortUrl: string | null) {
    if (!window.Razorpay) {
      // The widget script did not load, Razorpay's hosted page still works.
      if (shortUrl) {
        window.location.href = shortUrl;
        return;
      }
      toast.error("The payment window could not be opened. Please try again.");
      return;
    }

    const checkout = new window.Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name: "V Turn AI",
      // Naming the workspace here means someone with several workspaces can see
      // which one they are paying for before they authorise the mandate.
      description: `${planName} for ${organizationName}: ${formatCurrencyINR(priceMinor)}/month after a ${trialDays}-day free trial`,
      prefill: { email },
      theme: { color: "#5b3df5" },
      handler: (response) => {
        const formData = new FormData();
        formData.set("razorpay_payment_id", response.razorpay_payment_id);
        formData.set("razorpay_subscription_id", response.razorpay_subscription_id);
        formData.set("razorpay_signature", response.razorpay_signature);

        startTransition(async () => {
          const result = await verifyCheckoutAction(formData);
          if (result.ok) {
            toast.success(result.message ?? "Subscription confirmed.");
            router.refresh();
          } else {
            toast.error(result.error ?? "We could not verify that payment.");
          }
        });
      },
      modal: {
        ondismiss: () => {
          toast.info("Checkout closed. Your trial has not started yet.");
        },
      },
    });

    checkout.open();
  }

  function start() {
    startTransition(async () => {
      const result = await startSubscriptionAction();
      if (!result.ok || !result.subscriptionId) {
        toast.error(result.error ?? "Could not start the subscription.");
        return;
      }
      openCheckout(result.subscriptionId, result.keyId || publicKeyId, result.shortUrl ?? null);
    });
  }

  function cancel(atPeriodEnd: boolean) {
    const message = atPeriodEnd
      ? "Your plan will stay active until the end of the period you have paid for. Continue?"
      : "This cancels immediately and pauses your scans. Continue?";
    if (!window.confirm(message)) return;

    const formData = new FormData();
    formData.set("atPeriodEnd", String(atPeriodEnd));

    startTransition(async () => {
      const result = await cancelSubscriptionAction(formData);
      if (result.ok) {
        toast.success(result.message ?? "Subscription cancelled.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not cancel the subscription.");
      }
    });
  }

  if (!canManage) {
    return (
      <p className="max-w-xs text-sm text-muted-foreground">
        Only workspace owners and admins can manage billing.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setScriptReady(true)}
      />

      {!isActive || status === "created" ? (
        <Button
          variant="gradient"
          size="lg"
          disabled={pending || !razorpayConfigured}
          onClick={start}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          {status === "none" ? `Start ${trialDays}-day free trial` : "Reactivate subscription"}
        </Button>
      ) : null}

      {isActive && !cancelAtPeriodEnd ? (
        <Button variant="outline" disabled={pending} onClick={() => cancel(true)}>
          {isTrialing ? "Cancel trial" : "Cancel at period end"}
        </Button>
      ) : null}

      {cancelAtPeriodEnd ? (
        <p className="max-w-xs text-xs text-muted-foreground">
          Cancellation is scheduled. Your plan stays active until the end of the current period.
        </p>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await refreshSubscriptionAction();
            if (result.ok) {
              toast.success(result.message ?? "Refreshed.");
              router.refresh();
            } else {
              toast.error(result.error ?? "Could not refresh.");
            }
          })
        }
      >
        <RefreshCwIcon /> Re-check status with Razorpay
      </Button>

      {!scriptReady && razorpayConfigured ? (
        <p className="max-w-xs text-[11px] text-muted-foreground">
          Loading the secure payment window…
        </p>
      ) : null}
    </div>
  );
}
