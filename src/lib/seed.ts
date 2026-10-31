import night from "../data/demo-night.json";
import { isEmpty, save } from "./db";

// A fresh database (first run, or any restart on Render's free plan) gets the demo night, so the owner's
// dashboard has something to show. Set NIGHT_DESK_SEED=0 to start empty (the test scripts do).
const g = globalThis as unknown as { __nightDeskSeeded?: boolean };

export function ensureSeeded() {
  if (g.__nightDeskSeeded) return;
  g.__nightDeskSeeded = true;
  if (process.env.NIGHT_DESK_SEED === "0" || !isEmpty()) return;
  for (const o of night.orders) save("order", o.orderId, o, o.createdAt);
  for (const e of night.ledger) save("ledger", e.id, e, e.at);
  console.log(`[seed] demo night: ${night.orders.length} orders, ${night.ledger.length} ledger rows`);
}

export const seedNote = night.note;
