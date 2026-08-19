import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mapRazorpayStatus,
  verifySubscriptionPaymentSignature,
  verifyWebhookSignature,
} from "@/lib/billing/razorpay";

/**
 * Billing verification.
 *
 * Two rules the product depends on: a webhook is only trusted when its HMAC
 * matches the raw body byte for byte, and a checkout response is only trusted
 * when its signature matches. Both are compared in constant time.
 */

const WEBHOOK_SECRET = "test-webhook-secret";
const KEY_SECRET = "test-key-secret";

function signWebhook(body: string, secret = WEBHOOK_SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({
    event: "subscription.charged",
    payload: { subscription: { entity: { id: "sub_123", status: "active" } } },
  });

  it("accepts a correctly signed body", () => {
    expect(
      verifyWebhookSignature({ rawBody: body, signature: signWebhook(body), secret: WEBHOOK_SECRET }),
    ).toBe(true);
  });

  it("rejects a body that was modified after signing", () => {
    const signature = signWebhook(body);
    const tampered = body.replace("sub_123", "sub_999");
    expect(
      verifyWebhookSignature({ rawBody: tampered, signature, secret: WEBHOOK_SECRET }),
    ).toBe(false);
  });

  it("rejects a signature produced with a different secret", () => {
    expect(
      verifyWebhookSignature({
        rawBody: body,
        signature: signWebhook(body, "attacker-secret"),
        secret: WEBHOOK_SECRET,
      }),
    ).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature({ rawBody: body, signature: "", secret: WEBHOOK_SECRET })).toBe(
      false,
    );
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(
      verifyWebhookSignature({ rawBody: body, signature: "abc123", secret: WEBHOOK_SECRET }),
    ).toBe(false);
  });

  it("is sensitive to whitespace, since re-serialised JSON changes the bytes", () => {
    const signature = signWebhook(body);
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(
      verifyWebhookSignature({ rawBody: reserialised, signature, secret: WEBHOOK_SECRET }),
    ).toBe(false);
  });

  it("refuses to verify when no secret is configured", () => {
    const previous = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(verifyWebhookSignature({ rawBody: body, signature: signWebhook(body) })).toBe(false);
    if (previous !== undefined) process.env.RAZORPAY_WEBHOOK_SECRET = previous;
  });
});

describe("verifySubscriptionPaymentSignature", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  });

  afterEach(() => {
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  const paymentId = "pay_abc123";
  const subscriptionId = "sub_xyz789";

  function signCheckout(payment: string, subscription: string, secret = KEY_SECRET): string {
    return createHmac("sha256", secret).update(`${payment}|${subscription}`, "utf8").digest("hex");
  }

  it("accepts a genuine checkout response", () => {
    expect(
      verifySubscriptionPaymentSignature({
        razorpayPaymentId: paymentId,
        razorpaySubscriptionId: subscriptionId,
        razorpaySignature: signCheckout(paymentId, subscriptionId),
      }),
    ).toBe(true);
  });

  it("rejects a response where the subscription id was swapped", () => {
    expect(
      verifySubscriptionPaymentSignature({
        razorpayPaymentId: paymentId,
        razorpaySubscriptionId: "sub_someone_else",
        razorpaySignature: signCheckout(paymentId, subscriptionId),
      }),
    ).toBe(false);
  });

  it("rejects a forged signature", () => {
    expect(
      verifySubscriptionPaymentSignature({
        razorpayPaymentId: paymentId,
        razorpaySubscriptionId: subscriptionId,
        razorpaySignature: signCheckout(paymentId, subscriptionId, "wrong-secret"),
      }),
    ).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(
      verifySubscriptionPaymentSignature({
        razorpayPaymentId: paymentId,
        razorpaySubscriptionId: subscriptionId,
        razorpaySignature: "",
      }),
    ).toBe(false);
  });

  it("rejects everything when the key secret is missing", () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(
      verifySubscriptionPaymentSignature({
        razorpayPaymentId: paymentId,
        razorpaySubscriptionId: subscriptionId,
        razorpaySignature: signCheckout(paymentId, subscriptionId),
      }),
    ).toBe(false);
  });
});

describe("mapRazorpayStatus", () => {
  const future = new Date(Date.now() + 3 * 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it("treats an authenticated mandate with a live trial as trialing", () => {
    expect(mapRazorpayStatus("authenticated", future)).toBe("trialing");
  });

  it("treats an authenticated mandate with an elapsed trial as authenticated, not trialing", () => {
    expect(mapRazorpayStatus("authenticated", past)).toBe("authenticated");
  });

  it("maps the payment-failure states onto ours", () => {
    expect(mapRazorpayStatus("pending", null)).toBe("past_due");
    expect(mapRazorpayStatus("halted", null)).toBe("halted");
  });

  it("maps lifecycle states", () => {
    expect(mapRazorpayStatus("created", null)).toBe("created");
    expect(mapRazorpayStatus("active", null)).toBe("active");
    expect(mapRazorpayStatus("paused", null)).toBe("paused");
    expect(mapRazorpayStatus("cancelled", null)).toBe("cancelled");
    expect(mapRazorpayStatus("completed", null)).toBe("expired");
    expect(mapRazorpayStatus("expired", null)).toBe("expired");
  });

  it("falls back to created for an unrecognised status rather than assuming access", () => {
    expect(mapRazorpayStatus("something_new", null)).toBe("created");
  });
});
