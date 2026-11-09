import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { allEntries, hasEntry, record } from "@/lib/ledger";
import { markPaid } from "@/lib/orders";
import { captureOrder, PayPalError } from "@/lib/paypal";

export const runtime = "nodejs";

// PayPal sends the buyer back here after they approve; we capture right away.
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("token");
  if (!orderId) return NextResponse.redirect(`${env.appUrl()}/?paid=0`);
  try {
    const cap = await captureOrder(orderId);
    const order = markPaid(orderId, cap.captureId);
    if (!hasEntry("sale", cap.captureId)) {
      // The owner reads why this sale happened: the shopkeeper's reason from when it made the order.
      const made = allEntries().find((e) => e.kind === "order" && e.orderId === orderId);
      record({
        kind: "sale",
        // Where the buyer asked us to ship; PayPal's payer country is the sandbox account's.
        buyer: order?.buyer ?? cap.payerCountry,
        orderId,
        items: order?.lines.map((l) => l.name),
        currency: cap.currency,
        amount: cap.gross,
        fee: cap.fee,
        netUsd: cap.netUsd,
        reason: made?.reason ?? "Buyer paid through PayPal; captured the payment.",
        gate: "pass",
        gateNote: made?.gateNote,
        paypalId: cap.captureId,
      });
    }
    return NextResponse.redirect(`${env.appUrl()}/?paid=1&order=${orderId}&capture=${cap.captureId}`);
  } catch (err) {
    const detail = err instanceof PayPalError ? err.status : "error";
    return NextResponse.redirect(`${env.appUrl()}/?paid=0&reason=${detail}`);
  }
}
