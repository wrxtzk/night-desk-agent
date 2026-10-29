// Checks the rule gate without the model: these must hold even if the agent is talked into asking.
import assert from "node:assert/strict";
import { simulate } from "../src/lib/carrier";
import { record } from "../src/lib/ledger";
import { addOrder, addRefund, markPaid } from "../src/lib/orders";
import { gateDiscount, gateRefund } from "../src/lib/rules";

assert.equal(gateDiscount(495, 3300).verdict, "pass"); // 15%
assert.equal(gateDiscount(660, 3300).verdict, "block"); // 20%
assert.equal(gateDiscount(-50, 3300).verdict, "block");

const order = (id: string, total = 38) =>
  addOrder({ orderId: id, sessionId: "s1", buyer: "San Francisco, US", country: "US", currency: "USD", lines: [], subtotal: total - 10, discount: 0, shipping: 10, total, payUrl: "" });

// Unknown and unpaid orders.
assert.equal(gateRefund(undefined, 2, "late").verdict, "block");
const unpaid = order("UNPAID");
assert.equal(gateRefund(unpaid, 2, "late").verdict, "block");

// A parcel that is still moving is not late; a stalled one is.
const moving = order("MOVING");
markPaid("MOVING", "CAP-MOVING");
moving.events = simulate(moving, "ship");
assert.equal(gateRefund(moving, 3.8, "late").verdict, "block");
assert.equal(gateRefund(moving, 3.8, "not_received").verdict, "block");
moving.events = simulate(moving, "stall");
assert.equal(gateRefund(moving, 3.8, "late").verdict, "pass");
assert.equal(gateRefund(moving, 19.1, "late").verdict, "hold"); // over the per-order limit
assert.equal(gateRefund(moving, -5, "late").verdict, "block");
assert.equal(gateRefund(moving, 40, "late").verdict, "block"); // more than was paid

// Delivered means "not received" is refused, whatever the amount.
const delivered = order("DELIVERED");
markPaid("DELIVERED", "CAP-DELIVERED");
delivered.events = simulate(delivered, "deliver");
assert.equal(gateRefund(delivered, 38, "not_received").verdict, "block");
assert.equal(gateRefund(delivered, 1, "not_received").verdict, "block");
assert.equal(gateRefund(delivered, 5, "damaged").verdict, "hold"); // the owner looks at damage claims

// Small refunds on one order cannot add up past the per-order limit.
addRefund("MOVING", { id: "R1", amount: 10 });
assert.equal(gateRefund(moving, 5, "late").verdict, "pass"); // 15 in total
addRefund("MOVING", { id: "R2", amount: 5 });
assert.equal(gateRefund(moving, 1, "late").verdict, "hold"); // 16 in total

// Refunds across orders cannot beat the daily cap.
const other = order("OTHER");
markPaid("OTHER", "CAP-OTHER");
other.events = simulate(other, "stall");
for (let i = 0; i < 2; i++) record({ kind: "refund", netUsd: -14, reason: "test", gate: "pass" });
assert.equal(gateRefund(other, 3, "late").verdict, "hold"); // 28 used + 3 > 30
console.log("gate checks passed");
