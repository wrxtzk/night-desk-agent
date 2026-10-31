import { load, save } from "./db";
import type { Currency } from "./paypal";
import { ensureSeeded } from "./seed";

// Every money movement and every gate decision lands here, with the agent's reason. Stored in SQLite (db.ts).
export type Verdict = "pass" | "hold" | "block";

export type LedgerEntry = {
  id: string;
  at: string; // ISO time
  kind: "quote" | "order" | "sale" | "refund" | "refund_request" | "tracking";
  buyer?: string;
  currency?: Currency;
  amount?: number;
  fee?: number;
  netUsd?: number;
  reason: string; // written by the agent
  gate?: Verdict;
  gateNote?: string; // written by the rule gate, not the model
  paypalId?: string; // order, capture or refund id
  orderId?: string; // the shop order this row belongs to
  items?: string[]; // product names, for quotes and orders
  // The owner's decision on a request the gate held.
  resolution?: { decision: "approved" | "declined"; at: string; refundId?: string; note?: string };
  by?: "owner"; // the owner made this move, not the shopkeeper
  seed?: boolean; // part of the seeded demo night
};

const store = globalThis as unknown as { __nightDeskLedger?: LedgerEntry[] };
function entries(): LedgerEntry[] {
  if (!store.__nightDeskLedger) {
    ensureSeeded();
    store.__nightDeskLedger = load<LedgerEntry>("ledger");
  }
  return store.__nightDeskLedger;
}

export function record(entry: Omit<LedgerEntry, "id" | "at">): LedgerEntry {
  const full = { ...entry, id: crypto.randomUUID(), at: new Date().toISOString() };
  entries().push(full);
  save("ledger", full.id, full, full.at);
  return full;
}

export function updateEntry(entry: LedgerEntry) {
  save("ledger", entry.id, entry, entry.at);
}

export const getEntry = (id: string) => entries().find((e) => e.id === id);

export function allEntries(): LedgerEntry[] {
  return [...entries()].sort((a, b) => a.at.localeCompare(b.at));
}

export function hasEntry(kind: LedgerEntry["kind"], paypalId: string): boolean {
  return entries().some((e) => e.kind === kind && e.paypalId === paypalId);
}

// USD the shopkeeper refunded on its own today (Seoul calendar day). Refunds the owner approved don't count.
export function refundedTodayUsd(): number {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const today = day(new Date().toISOString());
  return entries()
    .filter((e) => e.kind === "refund" && e.by !== "owner" && day(e.at) === today)
    .reduce((sum, e) => sum + Math.abs(e.netUsd ?? 0), 0);
}
