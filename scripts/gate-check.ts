// Checks the rule gate without the model: these must hold even if the agent is talked into asking.
import assert from "node:assert/strict";
import { gateDiscount, gateRefund } from "../src/lib/rules";
import { record } from "../src/lib/ledger";

assert.equal(gateDiscount(495, 3300).verdict, "pass"); // 15%
assert.equal(gateDiscount(660, 3300).verdict, "block"); // 20%
assert.equal(gateRefund(2.2).verdict, "pass");
assert.equal(gateRefund(19.1).verdict, "hold"); // over auto limit
assert.equal(gateRefund(-5).verdict, "block");
// Splitting a large refund cannot beat the daily cap.
for (let i = 0; i < 2; i++) record({ kind: "refund", netUsd: -14, reason: "test", gate: "pass" });
assert.equal(gateRefund(14).verdict, "hold"); // 28 used + 14 > 30
console.log("gate checks passed");
