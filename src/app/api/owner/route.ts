import { NextResponse } from "next/server";
import { dashboardData } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await dashboardData());
}
