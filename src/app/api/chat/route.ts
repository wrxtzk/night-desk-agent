import { NextResponse } from "next/server";
import { fromBuyer, latestOrder, shopkeeperReply } from "@/lib/agent";

export const runtime = "nodejs";

// The public demo pays for every model call, so chats are capped: per conversation, and per day for the whole shop
// (session IDs come from the browser, so only the daily cap holds against someone who keeps starting new ones).
const PER_CHAT = 40;
const PER_DAY = 800;
const g = globalThis as unknown as { __nightDeskChatCounts?: { day: string; total: number; chats: Map<string, number> } };

function overLimit(sessionId: string) {
  const day = new Date().toISOString().slice(0, 10);
  if (g.__nightDeskChatCounts?.day !== day) g.__nightDeskChatCounts = { day, total: 0, chats: new Map() };
  const c = g.__nightDeskChatCounts;
  const used = c.chats.get(sessionId) ?? 0;
  if (used >= PER_CHAT || c.total >= PER_DAY) return true;
  c.chats.set(sessionId, used + 1);
  c.total++;
  return false;
}

export async function POST(req: Request) {
  const { sessionId, message } = (await req.json()) as { sessionId?: string; message?: string };
  if (!sessionId || !message?.trim()) {
    return NextResponse.json({ error: "sessionId and message are required" }, { status: 400 });
  }
  if (message.length > 2000) return NextResponse.json({ error: "message too long" }, { status: 400 });
  if (overLimit(sessionId)) {
    return NextResponse.json({ text: "This demo chat has reached its message limit for today. Please start a new chat or come back tomorrow.", stopReason: "limit", order: latestOrder(sessionId) });
  }
  const reply = await shopkeeperReply(sessionId, fromBuyer(message));
  return NextResponse.json(reply);
}
