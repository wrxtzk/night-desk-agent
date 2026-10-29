import { NextResponse } from "next/server";
import { playStep } from "@/lib/after-sale";
import type { CarrierStep } from "@/lib/carrier";
import { getOrder } from "@/lib/orders";

export const runtime = "nodejs";

// Demo controls on the buyer page: play the owner shipping the parcel and the (simulated) carrier's scans
// for this buyer's own paid order, then let the shopkeeper react as it would to the real thing.
export async function POST(req: Request) {
  const { sessionId, orderId, step } = (await req.json()) as { sessionId?: string; orderId?: string; step?: CarrierStep };
  const order = orderId ? getOrder(orderId) : undefined;
  if (!sessionId || !order || order.sessionId !== sessionId) return NextResponse.json({ error: "No such order in this conversation." }, { status: 404 });
  if (!order.captureId) return NextResponse.json({ error: "The order is not paid yet." }, { status: 409 });
  if (step !== "ship" && step !== "stall" && step !== "deliver") return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  if (step !== "ship" && !order.tracking) return NextResponse.json({ error: "Ship the order first." }, { status: 409 });
  return NextResponse.json(await playStep(order, step));
}
