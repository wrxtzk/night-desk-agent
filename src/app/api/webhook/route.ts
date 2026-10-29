import { NextResponse } from "next/server";
import { hasEntry, record } from "@/lib/ledger";
import { verifyWebhook } from "@/lib/paypal";

export const runtime = "nodejs";

type WebhookEvent = {
  id: string;
  event_type: string;
  resource: { id: string; amount?: { value: string; currency_code: "USD" | "JPY" } };
};

// PayPal webhooks: verified with PayPal before anything is recorded.
export async function POST(req: Request) {
  const event = (await req.json()) as WebhookEvent;
  if (!(await verifyWebhook(req.headers, event))) {
    return NextResponse.json({ error: "signature not verified" }, { status: 400 });
  }
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" && !hasEntry("sale", event.resource.id)) {
    record({
      kind: "sale",
      currency: event.resource.amount?.currency_code,
      amount: Number(event.resource.amount?.value ?? 0),
      reason: "PayPal confirmed the payment (webhook).",
      gate: "pass",
      paypalId: event.resource.id,
    });
  }
  console.log(`[webhook] ${event.event_type} ${event.resource.id}`);
  return NextResponse.json({ received: true });
}
