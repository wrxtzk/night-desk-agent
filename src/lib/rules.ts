import { refundedTodayUsd, type Verdict } from "./ledger";
import { parcelState, refundedAmount, type ShopOrder } from "./orders";
import type { Currency } from "./paypal";

// The owner's house rules. The gate runs in code before any PayPal call that moves money,
// so a buyer who talks the model into something still cannot get past it.
export const houseRules = {
  maxDiscountPct: 15,
  autoRefundUsd: 15, // per order, all refunds the shopkeeper makes on its own
  dailyRefundUsd: 30,
  lateAfterDays: 5, // no carrier scan for this long counts as a late parcel
};

// Fixed demo rate for gate checks on JPY amounts (matches what the sandbox returned on 2026-10-29).
const JPY_TO_USD = 0.00616;
export const toUsd = (amount: number, currency: Currency) => (currency === "JPY" ? amount * JPY_TO_USD : amount);

export type GateResult = { verdict: Verdict; note: string };

export function gateDiscount(discount: number, subtotal: number): GateResult {
  if (discount < 0) return { verdict: "block", note: "Negative discount." };
  const pct = subtotal > 0 ? (discount / subtotal) * 100 : 0;
  if (pct > houseRules.maxDiscountPct + 0.01) {
    return { verdict: "block", note: `Discount ${pct.toFixed(1)}% is over the ${houseRules.maxDiscountPct}% house limit.` };
  }
  return { verdict: "pass", note: `Discount ${pct.toFixed(1)}% is within the ${houseRules.maxDiscountPct}% limit.` };
}

// What the buyer says went wrong. The gate checks the claim against the carrier record.
export type RefundClaim = "late" | "not_received" | "damaged" | "other";

const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

export function gateRefund(order: ShopOrder | undefined, amount: number, claim: RefundClaim): GateResult {
  if (!order) return { verdict: "block", note: "No such order in this conversation. Refunds only go to the buyer's own orders." };
  if (!order.captureId) return { verdict: "block", note: "The order is not paid, so there is nothing to refund." };
  if (!(amount > 0)) return { verdict: "block", note: "Refund amount must be positive." };
  const left = order.total - refundedAmount(order);
  if (amount > left + 1e-9) return { verdict: "block", note: `Only ${left} ${order.currency} of this order is left to refund.` };

  const parcel = parcelState(order);
  const late = parcel.shipped && !parcel.delivered && parcel.daysSinceLastScan >= houseRules.lateAfterDays;
  if (claim === "not_received" || claim === "late") {
    if (parcel.delivered && parcel.last) {
      return { verdict: "block", note: `Carrier shows the parcel delivered on ${fmtDate(parcel.last.at)} at ${parcel.last.place} (${parcel.last.note}).` };
    }
    if (!parcel.shipped) return { verdict: "hold", note: "Not shipped yet. Cancelling an unshipped order is the owner's call. Held for the owner." };
    if (!late) {
      return { verdict: "block", note: `Not late: last carrier scan ${parcel.daysSinceLastScan} day(s) ago; a parcel counts as late after ${houseRules.lateAfterDays} days without a scan.` };
    }
  } else {
    return { verdict: "hold", note: `This "${claim}" claim needs the owner to look at it (photos, details). Held for the owner.` };
  }

  const usd = toUsd(amount, order.currency);
  const orderUsd = toUsd(refundedAmount(order), order.currency) + usd;
  if (orderUsd > houseRules.autoRefundUsd + 1e-9) {
    return { verdict: "hold", note: `Would bring this order's refunds to $${orderUsd.toFixed(2)}, over the $${houseRules.autoRefundUsd} the shopkeeper may refund on its own. Held for the owner.` };
  }
  const today = refundedTodayUsd() + usd;
  if (today > houseRules.dailyRefundUsd + 1e-9) {
    return { verdict: "hold", note: `Would bring today's refunds to $${today.toFixed(2)}, over the $${houseRules.dailyRefundUsd} daily limit. Held for the owner.` };
  }
  return { verdict: "pass", note: `Late parcel (no scan for ${parcel.daysSinceLastScan} days); $${usd.toFixed(2)} is within the $${houseRules.autoRefundUsd} per-order and $${houseRules.dailyRefundUsd} daily limits.` };
}
