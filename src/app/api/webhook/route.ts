import { NextResponse } from "next/server";
import { hasEntry, record } from "@/lib/ledger";
import { getOrder, markPaid } from "@/lib/orders";
import { verifyWebhook } from "@/lib/paypal";

export const runtime = "nodejs";

type WebhookEvent = {
  id: string;
  event_type: string;
  resource: {
    id: string;
    amount?: { value: string; currency_code: "USD" | "JPY" };
    supplementary_data?: { related_ids?: { order_id?: string } };
    seller_receivable_breakdown?: { paypal_fee?: { value: string }; net_amount?: { value: string }; receivable_amount?: { value: string } };
  };
};

// PayPal webhooks: verified with PayPal before anything is recorded.
export async function POST(req: Request) {
  const event = (await req.json()) as WebhookEvent;
  if (!(await verifyWebhook(req.headers, event))) {
    return NextResponse.json({ error: "signature not verified" }, { status: 400 });
  }
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED" && !hasEntry("sale", event.resource.id)) {
    // Usually the return URL got there first; this catches a buyer who closed the tab before coming back.
    const r = event.resource;
    const orderId = r.supplementary_data?.related_ids?.order_id;
    const order = orderId ? (markPaid(orderId, r.id) ?? getOrder(orderId)) : undefined;
    const bd = r.seller_receivable_breakdown;
    record({
      kind: "sale",
      buyer: order?.buyer,
      orderId,
      items: order?.lines.map((l) => l.name),
      currency: r.amount?.currency_code,
      amount: Number(r.amount?.value ?? 0),
      fee: bd?.paypal_fee ? Number(bd.paypal_fee.value) : undefined,
      netUsd: bd?.receivable_amount ? Number(bd.receivable_amount.value) : bd?.net_amount && r.amount?.currency_code === "USD" ? Number(bd.net_amount.value) : undefined,
      reason: "PayPal confirmed the payment (webhook).",
      gate: "pass",
      paypalId: event.resource.id,
    });
  }
  console.log(`[webhook] ${event.event_type} ${event.resource.id}`);
  return NextResponse.json({ received: true });
}
