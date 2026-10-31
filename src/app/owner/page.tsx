import type { Metadata, Viewport } from "next";
import { dashboardData } from "@/lib/dashboard";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Night Desk, owner dashboard",
  description: "What the AI shopkeeper did overnight: every PayPal money movement with its reason, the morning report and the requests waiting for the owner.",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

// The owner's morning screen: ledger, morning report reconciled with PayPal, approvals and house rules.
export default async function OwnerPage() {
  return <Dashboard initial={await dashboardData()} />;
}
