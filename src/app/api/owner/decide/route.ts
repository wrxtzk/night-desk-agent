import { after, NextResponse } from "next/server";
import { decide, DecisionError } from "@/lib/approvals";
import { ownerAllowed } from "@/lib/owner";

export const runtime = "nodejs";

// The owner approves or declines a request the gate held. Approving sends the refund through PayPal;
// the shopkeeper's note to the buyer is written after the response, so the button answers at once.
export async function POST(req: Request) {
  if (!ownerAllowed(req)) return NextResponse.json({ error: "Owner key required." }, { status: 401 });
  const { id, decision } = (await req.json()) as { id?: string; decision?: string };
  if (!id || (decision !== "approved" && decision !== "declined")) return NextResponse.json({ error: "id and decision are required." }, { status: 400 });
  try {
    const { entry, notify } = await decide(id, decision);
    after(() => notify().catch((err) => console.error("[decide] buyer note failed", err)));
    return NextResponse.json({ resolution: entry.resolution });
  } catch (err) {
    if (err instanceof DecisionError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
