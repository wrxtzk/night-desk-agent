import { openHolds } from "./approvals";
import { allEntries, type LedgerEntry } from "./ledger";
import { ownerKeyRequired } from "./owner";
import { buildReport, reconcile } from "./report";
import { houseRules, ruleBounds } from "./rules";
import { seedNote } from "./seed";
import { suggestionFor } from "./suggest";

// Everything the owner's dashboard shows, in one read.

const claimLabel: Record<string, string> = { late: "late parcel", not_received: "says not received", damaged: "arrived damaged", other: "other" };

export type LedgerRow = ReturnType<typeof ledgerRow>;

function ledgerRow(e: LedgerEntry) {
  const claim = e.reason.match(/^\[(\w+)\]\s*/);
  const reason = claim ? e.reason.slice(claim[0].length) : e.reason;
  const items = e.items?.join(" + ");
  const title =
    e.kind === "sale" ? items ?? "Sale"
    : e.kind === "refund" ? `Refund${e.by === "owner" ? " (you approved)" : ""}: ${claimLabel[claim?.[1] ?? ""] ?? "partial"}`
    : e.kind === "refund_request" ? `Refund request: ${claimLabel[claim?.[1] ?? ""] ?? "other"}`
    : e.kind === "order" ? `Order refused: ${items ?? ""}`
    : "Tracking attached to PayPal";
  const { id, at, kind, buyer, currency, amount, fee, netUsd, gate, gateNote, resolution, by, paypalId } = e;
  return { id, at, kind, title, buyer, currency, amount, fee, netUsd, reason, gate, gateNote, resolution, by, paypalId };
}

// Rows the owner reads: money that moved, money the gate stopped, and PayPal actions. Quotes and unpaid orders are left out.
const shown = (e: LedgerEntry) => e.kind === "sale" || e.kind === "refund" || e.kind === "refund_request" || e.kind === "tracking" || (e.kind === "order" && e.gate !== "pass");

export async function dashboardData() {
  const entries = allEntries();
  const report = buildReport(entries);
  const [reconciliation, suggestion] = await Promise.all([
    reconcile(report.window, entries),
    suggestionFor(report.window).catch((err) => {
      console.error("[suggest]", err);
      return null;
    }),
  ]);
  return {
    report,
    reconciliation,
    suggestion,
    ledger: entries.filter(shown).map(ledgerRow).reverse(),
    holds: openHolds().map(ledgerRow),
    rules: { ...houseRules },
    bounds: ruleBounds,
    ownerKeyRequired: ownerKeyRequired(),
    seeded: entries.some((e) => e.seed) ? seedNote : null,
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
