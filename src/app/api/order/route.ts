import { NextResponse } from "next/server";
import { latestOrder } from "@/lib/agent";

export const runtime = "nodejs";

// The buyer's latest order as the shop sees it now (paid, shipped, refunded), for the buyer page.
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  return NextResponse.json({ order: latestOrder(sessionId) ?? null });
}
