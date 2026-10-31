import { NextResponse } from "next/server";
import { shopMessages } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Messages the shop posted into this buyer's chat on its own, such as the outcome of a request the owner reviewed.
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  return NextResponse.json({ messages: shopMessages(sessionId) });
}
