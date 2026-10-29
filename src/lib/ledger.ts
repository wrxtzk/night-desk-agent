import type { Currency } from "./paypal";

// Every money movement and every gate decision lands here, with the agent's reason.
// In-memory for M0; persistence is decided in the framework (SQLite seeded on boot).
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
};

const store = globalThis as unknown as { __nightDeskLedger?: LedgerEntry[] };
const entries = (store.__nightDeskLedger ??= []);

export function record(entry: Omit<LedgerEntry, "id" | "at">): LedgerEntry {
  const full = { ...entry, id: crypto.randomUUID(), at: new Date().toISOString() };
  entries.push(full);
  return full;
}

export function allEntries(): LedgerEntry[] {
  return [...entries].sort((a, b) => a.at.localeCompare(b.at));
}

export function hasEntry(kind: LedgerEntry["kind"], paypalId: string): boolean {
  return entries.some((e) => e.kind === kind && e.paypalId === paypalId);
}

// USD refunded today (Seoul calendar day), counting refunds that actually went out.
export function refundedTodayUsd(): number {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const today = day(new Date().toISOString());
  return entries
    .filter((e) => e.kind === "refund" && e.gate === "pass" && day(e.at) === today)
    .reduce((sum, e) => sum + Math.abs(e.netUsd ?? 0), 0);
}
