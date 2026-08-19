import { NextResponse, type NextRequest } from "next/server";
import { applyRazorpayWebhook } from "@/lib/billing/subscription-service";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { isRecord } from "@/lib/utils";
import { logger } from "@/lib/logger";

const log = logger.child("razorpay-webhook");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook receiver.
 *
 * Three properties make this safe:
 *   1. The raw request body is read as text and used verbatim for signature
 *      verification — re-serialising parsed JSON would change the bytes.
 *   2. An invalid or missing signature is rejected before anything is parsed
 *      into application state.
 *   3. Event ids are stored under a unique constraint, so a replayed delivery
 *      is detected and discarded rather than applied twice.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await request.text();

  if (!verifyWebhookSignature({ rawBody, signature })) {
    log.warn("Rejected webhook with invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isRecord(payload) || typeof payload["event"] !== "string") {
    return NextResponse.json({ error: "Unrecognised payload" }, { status: 400 });
  }

  const eventType = payload["event"];
  // Razorpay sends the event id in a header; fall back to a deterministic key
  // built from the payload so replay protection still works if it is absent.
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    `${eventType}:${typeof payload["created_at"] === "number" ? payload["created_at"] : Date.now()}`;

  try {
    const result = await applyRazorpayWebhook({ eventId, eventType, payload });

    if (result.duplicate) {
      log.info("Ignored duplicate webhook delivery", { eventId, eventType });
    }

    // Always 200 on a verified event: a non-2xx makes Razorpay retry, and a
    // retry cannot fix an event we have already recorded.
    return NextResponse.json({ received: true, handled: result.handled });
  } catch (error) {
    log.error("Webhook handling failed", { eventId, eventType, error });
    // A 500 asks Razorpay to retry, which is correct for a transient failure.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
