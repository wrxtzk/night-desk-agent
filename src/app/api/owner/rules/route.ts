import { NextResponse } from "next/server";
import { ownerAllowed } from "@/lib/owner";
import { setRules, type HouseRules } from "@/lib/rules";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  if (!ownerAllowed(req)) return NextResponse.json({ error: "Owner key required." }, { status: 401 });
  try {
    return NextResponse.json({ rules: setRules((await req.json()) as Partial<HouseRules>) });
  } catch (err) {
    if (err instanceof RangeError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
