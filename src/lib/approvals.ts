import { postToBuyer, shopEvent } from "./agent";
import { allEntries, getEntry, record, updateEntry, type LedgerEntry } from "./ledger";
import { addRefund, getOrder, refundedAmount } from "./orders";
import { PayPalError, refundCapture } from "./paypal";
import { toUsd } from "./rules";

// Requests the rule gate held for the owner. The owner's approval moves the money; the shopkeeper then tells the buyer.

export const openHolds = () => allEntries().filter((e) => e.kind === "refund_request" && e.gate === "hold" && !e.resolution);

const fmt = (amount: number, currency: string) => (currency === "JPY" ? `¥${Math.round(amount).toLocaleString("en-US")}` : `$${amount.toFixed(2)}`);

export class DecisionError extends Error {}

export async function decide(id: string, decision: "approved" | "declined"): Promise<{ entry: LedgerEntry; notify: () => Promise<unknown> }> {
  const entry = getEntry(id);
  if (!entry || entry.kind !== "refund_request" || entry.gate !== "hold") throw new DecisionError("No such request waiting for you.");
  if (entry.resolution) throw new DecisionError(`Already ${entry.resolution.decision}.`);
  const order = entry.orderId ? getOrder(entry.orderId) : undefined;
  if (!order?.captureId || !entry.currency || !entry.amount) throw new DecisionError("The order behind this request is not paid.");
  const amount = entry.amount;
  const money = fmt(amount, entry.currency);
  const at = new Date().toISOString();

  if (decision === "declined") {
    entry.resolution = { decision, at };
    updateEntry(entry);
    const notify = () =>
      postToBuyer(order, "The owner reviewed your request.", shopEvent("owner", `I looked at the refund request of ${money} on order ${order.orderId} (buyer in ${order.buyer}) and I'm not refunding it. Tell the buyer kindly, and offer to send a replacement at no cost instead.`));
    return { entry, notify };
  }

  if (amount > order.total - refundedAmount(order) + 1e-9) throw new DecisionError(`Only ${fmt(order.total - refundedAmount(order), order.currency)} of this order is left to refund.`);
  try {
    const refund = await refundCapture({ captureId: order.captureId, amount, currency: order.currency, note: "Refund approved by the shop owner." });
    addRefund(order.orderId, { id: refund.id, amount });
    record({
      kind: "refund",
      by: "owner",
      buyer: entry.buyer,
      currency: entry.currency,
      amount: -amount,
      netUsd: -toUsd(amount, order.currency),
      // Keep the claim tag in front, as the shopkeeper's rows have it.
      reason: entry.reason.replace(/^(\[\w+\]\s*)?/, (tag) => `${tag}Owner approved. `).replace(/ ?My recommendation: approve\.?/, ""),
      gate: "pass",
      gateNote: "Approved by the owner.",
      paypalId: refund.id,
      orderId: order.orderId,
    });
    entry.resolution = { decision, at, refundId: refund.id };
    updateEntry(entry);
  } catch (err) {
    if (err instanceof PayPalError) {
      const issue = (err.body as { details?: { issue?: string }[] })?.details?.[0]?.issue;
      throw new DecisionError(`PayPal refused the refund${issue ? ` (${issue})` : ""}.`);
    }
    throw err;
  }
  const notify = () =>
    postToBuyer(order, `The owner approved a refund of ${money}.`, shopEvent("owner", `I approved the refund of ${money} on order ${order.orderId} (buyer in ${order.buyer}); PayPal has sent it (refund ${entry.resolution?.refundId}). Let the buyer know and thank them for their patience.`));
  return { entry, notify };
}
