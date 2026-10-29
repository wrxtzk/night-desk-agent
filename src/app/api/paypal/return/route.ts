import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { hasEntry, record } from "@/lib/ledger";
import { captureOrder, PayPalError } from "@/lib/paypal";

export const runtime = "nodejs";

// PayPal sends the buyer back here after they approve; we capture right away.
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("token");
  if (!orderId) return NextResponse.redirect(`${env.appUrl()}/?paid=0`);
  try {
    const cap = await captureOrder(orderId);
    if (!hasEntry("sale", cap.captureId)) {
      record({
        kind: "sale",
        buyer: cap.payerCountry,
        currency: cap.currency,
        amount: cap.gross,
        fee: cap.fee,
        netUsd: cap.netUsd,
        reason: "Buyer paid through PayPal; captured the payment.",
        gate: "pass",
        paypalId: cap.captureId,
      });
    }
    return NextResponse.redirect(`${env.appUrl()}/?paid=1&capture=${cap.captureId}`);
  } catch (err) {
    const detail = err instanceof PayPalError ? err.status : "error";
    return NextResponse.redirect(`${env.appUrl()}/?paid=0&reason=${detail}`);
  }
}
