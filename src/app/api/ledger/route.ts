import { NextResponse } from "next/server";
import { allEntries } from "@/lib/ledger";
import { houseRules } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rules: houseRules(), entries: allEntries() });
}
