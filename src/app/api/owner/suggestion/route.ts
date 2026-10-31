import { NextResponse } from "next/server";
import { ownerAllowed } from "@/lib/owner";
import { decideSuggestion } from "@/lib/suggest";

export const runtime = "nodejs";

// Adopting puts the proposed set in the catalog; the shopkeeper can sell it from the next message on.
export async function POST(req: Request) {
  if (!ownerAllowed(req)) return NextResponse.json({ error: "Owner key required." }, { status: 401 });
  const { window, action } = (await req.json()) as { window?: string; action?: string };
  if (!window || (action !== "adopt" && action !== "dismiss")) return NextResponse.json({ error: "window and action are required." }, { status: 400 });
  try {
    return NextResponse.json({ suggestion: decideSuggestion(window, action) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not update the suggestion." }, { status: 409 });
  }
}
