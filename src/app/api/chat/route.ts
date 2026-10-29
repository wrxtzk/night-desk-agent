import { NextResponse } from "next/server";
import { fromBuyer, shopkeeperReply } from "@/lib/agent";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sessionId, message } = (await req.json()) as { sessionId?: string; message?: string };
  if (!sessionId || !message?.trim()) {
    return NextResponse.json({ error: "sessionId and message are required" }, { status: 400 });
  }
  if (message.length > 2000) return NextResponse.json({ error: "message too long" }, { status: 400 });
  const reply = await shopkeeperReply(sessionId, fromBuyer(message));
  return NextResponse.json(reply);
}
