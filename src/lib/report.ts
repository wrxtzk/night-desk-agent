import { allEntries, type LedgerEntry } from "./ledger";
import { PayPalError, searchTransactions } from "./paypal";
import { houseRules } from "./rules";

// The morning report. Every figure is computed here from the ledger; PayPal's own records are the check.

const KST = 9 * 3_600_000;
const DAY = 86_400_000;

// A shop day runs from 18:00 to 18:00 Seoul time: the owner closes the desk in the evening and reads the report next morning.
export function shopDay(at: string) {
  const kst = Date.parse(at) + KST;
  const startKst = Math.floor((kst - 18 * 3_600_000) / DAY) * DAY + 18 * 3_600_000;
  const start = new Date(startKst - KST);
  return { start: start.toISOString(), end: new Date(start.getTime() + DAY).toISOString() };
}

const moneyKinds = new Set<LedgerEntry["kind"]>(["sale", "refund", "refund_request", "order"]);

// The day of the shopkeeper's latest sale, refund or gate decision. The owner's own approvals don't open a new day.
export function reportWindow(entries = allEntries()) {
  const latest = entries.filter((e) => moneyKinds.has(e.kind) && e.by !== "owner").at(-1);
  return shopDay(latest?.at ?? new Date().toISOString());
}

export type Report = ReturnType<typeof buildReport>;

export function buildReport(entries = allEntries()) {
  const window = reportWindow(entries);
  const inWindow = entries.filter((e) => e.at >= window.start && e.at < window.end);
  const sales = inWindow.filter((e) => e.kind === "sale");
  const refunds = inWindow.filter((e) => e.kind === "refund");
  const byCurrency = (rows: LedgerEntry[], pick: (e: LedgerEntry) => number) =>
    rows.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.currency ?? "USD"]: (acc[e.currency ?? "USD"] ?? 0) + pick(e) }), {});
  const sum = (rows: LedgerEntry[]) => rows.reduce((s, e) => s + (e.netUsd ?? 0), 0);
  const netUsd = sum(sales);
  const refundedUsd = sum(refunds); // negative
  const autoRefundedUsd = -sum(refunds.filter((e) => e.by !== "owner"));
  const gated = inWindow.filter((e) => e.gate && e.kind !== "quote" && e.kind !== "tracking");
  const countries = [...new Set(inWindow.map((e) => e.buyer?.match(/\b([A-Z]{2})$/)?.[1]).filter(Boolean))] as string[];
  return {
    window,
    sales: { count: sales.length, byCurrency: byCurrency(sales, () => 1), gross: byCurrency(sales, (e) => e.amount ?? 0), fees: byCurrency(sales, (e) => e.fee ?? 0) },
    netUsd: round(netUsd),
    refunds: { count: refunds.length, usd: round(refundedUsd) },
    keptUsd: round(netUsd + refundedUsd),
    autoRefundedUsd: round(autoRefundedUsd),
    dailyRefundUsd: houseRules().dailyRefundUsd,
    blocked: inWindow.filter((e) => e.gate === "block").length,
    needsYou: entries.filter((e) => e.gate === "hold" && !e.resolution).length,
    activity: {
      quotes: inWindow.filter((e) => e.kind === "quote").length,
      countries,
      paid: sales.length,
      tracking: inWindow.filter((e) => e.kind === "tracking").length,
      refunds: refunds.length,
      ruleChecks: gated.length,
      blocked: gated.filter((e) => e.gate === "block").length,
      held: gated.filter((e) => e.gate === "hold").length,
    },
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

// Reconciliation: every capture and refund PayPal recorded in the window must be in the ledger with the same
// amount, and every sale or refund in the ledger must be in PayPal, up to the time PayPal's data reaches.
export type Reconciliation = { through: string; checked: number; missingInLedger: string[]; missingInPayPal: string[]; mismatched: string[]; pending?: boolean; error?: string };

const g = globalThis as unknown as { __nightDeskRecon?: Map<string, { at: number; value: Reconciliation }> };
const cache = (g.__nightDeskRecon ??= new Map());

export async function reconcile(window: { start: string; end: string }, entries = allEntries()): Promise<Reconciliation> {
  const key = `${window.start}|${entries.filter((e) => e.kind === "sale" || e.kind === "refund").length}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  const end = new Date(Math.min(Date.parse(window.end), Date.now()));
  let value: Reconciliation;
  try {
    const { through, transactions } = await searchTransactions(new Date(window.start), end);
    const cutoff = through < end.toISOString() ? through : end.toISOString();
    // T0006: checkout payment received; T1107: payment refund. Currency conversions (T0200) are not shop events.
    const paypal = transactions.filter((t) => t.eventCode === "T0006" || t.eventCode === "T1107");
    const ledger = entries.filter((e) => (e.kind === "sale" || e.kind === "refund") && e.at >= window.start && e.at < cutoff);
    const byId = new Map(ledger.map((e) => [e.paypalId, e]));
    const missingInLedger: string[] = [];
    const mismatched: string[] = [];
    for (const t of paypal) {
      const e = byId.get(t.id);
      if (!e) missingInLedger.push(t.id);
      else if (Math.abs(Math.abs(e.amount ?? 0) - Math.abs(t.amount)) > 0.005 || e.currency !== t.currency) mismatched.push(t.id);
    }
    const seen = new Set(paypal.map((t) => t.id));
    const missingInPayPal = ledger.filter((e) => !seen.has(e.paypalId ?? "")).map((e) => e.paypalId ?? e.id);
    value = { through: cutoff, checked: paypal.length, missingInLedger, missingInPayPal, mismatched };
  } catch (err) {
    // PayPal answers 404 when its records don't reach the window's start yet (they refresh every few hours).
    const pending = err instanceof PayPalError && err.status === 404;
    value = pending
      ? { through: "", checked: 0, missingInLedger: [], missingInPayPal: [], mismatched: [], pending }
      : { through: "", checked: 0, missingInLedger: [], missingInPayPal: [], mismatched: [], error: err instanceof Error ? err.message.slice(0, 200) : "PayPal did not answer" };
    if (!pending) console.error("[reconcile]", value.error);
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}
