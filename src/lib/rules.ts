import { refundedTodayUsd, type Verdict } from "./ledger";

// The owner's house rules. The gate runs in code before any PayPal call that moves money,
// so a buyer who talks the model into something still cannot get past it.
export const houseRules = {
  maxDiscountPct: 15,
  autoRefundUsd: 15,
  dailyRefundUsd: 30,
};

export type GateResult = { verdict: Verdict; note: string };

export function gateDiscount(discount: number, subtotal: number): GateResult {
  if (discount < 0) return { verdict: "block", note: "Negative discount." };
  const pct = subtotal > 0 ? (discount / subtotal) * 100 : 0;
  if (pct > houseRules.maxDiscountPct + 0.01) {
    return { verdict: "block", note: `Discount ${pct.toFixed(1)}% is over the ${houseRules.maxDiscountPct}% house limit.` };
  }
  return { verdict: "pass", note: `Discount ${pct.toFixed(1)}% is within the ${houseRules.maxDiscountPct}% limit.` };
}

export function gateRefund(amountUsd: number): GateResult {
  if (amountUsd <= 0) return { verdict: "block", note: "Refund amount must be positive." };
  const used = refundedTodayUsd();
  if (used + amountUsd > houseRules.dailyRefundUsd) {
    return { verdict: "hold", note: `Would bring today's refunds to $${(used + amountUsd).toFixed(2)}, over the $${houseRules.dailyRefundUsd} daily limit. Held for the owner.` };
  }
  if (amountUsd > houseRules.autoRefundUsd) {
    return { verdict: "hold", note: `$${amountUsd.toFixed(2)} is over the $${houseRules.autoRefundUsd} auto-refund limit. Held for the owner.` };
  }
  return { verdict: "pass", note: `Within the $${houseRules.autoRefundUsd} auto-refund limit ($${used.toFixed(2)} of $${houseRules.dailyRefundUsd} used today).` };
}
