import { load, save } from "./db";
import type { Currency } from "./paypal";
import { ensureSeeded } from "./seed";

// The shop's own record of each PayPal order: who it belongs to (the chat session), whether it is paid,
// where the parcel is, and what has been refunded. Stored in SQLite; call saveOrder after changing one.

export type CarrierStatus = "accepted" | "in_transit" | "arrived" | "out_for_delivery" | "delivered";

export type CarrierEvent = { at: string; status: CarrierStatus; place: string; note: string };

export type ShopOrder = {
  orderId: string;
  sessionId: string;
  buyer: string; // city and country as the buyer gave them
  country: string;
  currency: Currency;
  lines: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  payUrl: string;
  createdAt: string;
  captureId?: string;
  paidAt?: string;
  tracking?: { number: string; carrier: string; attachedToPayPal: boolean };
  events: CarrierEvent[];
  refunds: { id: string; amount: number; at: string }[];
  seed?: boolean;
};

const store = globalThis as unknown as { __nightDeskOrders?: Map<string, ShopOrder> };
function orders(): Map<string, ShopOrder> {
  if (!store.__nightDeskOrders) {
    ensureSeeded();
    store.__nightDeskOrders = new Map(load<ShopOrder>("order").map((o) => [o.orderId, o]));
  }
  return store.__nightDeskOrders;
}

export const saveOrder = (o: ShopOrder) => save("order", o.orderId, o, o.createdAt);

export function addOrder(order: Omit<ShopOrder, "createdAt" | "events" | "refunds">): ShopOrder {
  const full: ShopOrder = { ...order, createdAt: new Date().toISOString(), events: [], refunds: [] };
  orders().set(order.orderId, full);
  saveOrder(full);
  return full;
}

export const getOrder = (orderId: string) => orders().get(orderId);

export const ordersForSession = (sessionId: string) => [...orders().values()].filter((o) => o.sessionId === sessionId);

export function markPaid(orderId: string, captureId: string) {
  const o = orders().get(orderId);
  if (o && !o.captureId) {
    Object.assign(o, { captureId, paidAt: new Date().toISOString() });
    saveOrder(o);
  }
  return o;
}

export function addRefund(orderId: string, refund: { id: string; amount: number }) {
  const o = orders().get(orderId);
  if (!o) return;
  o.refunds.push({ ...refund, at: new Date().toISOString() });
  saveOrder(o);
}

export const refundedAmount = (o: ShopOrder) => o.refunds.reduce((sum, r) => sum + r.amount, 0);

// What the carrier record says right now, as the rule gate reads it.
export function parcelState(o: ShopOrder, now = Date.now()) {
  const last = o.events.at(-1);
  if (!last) return { shipped: false, delivered: false, daysSinceLastScan: 0, last: undefined };
  return {
    shipped: true,
    delivered: last.status === "delivered",
    daysSinceLastScan: Math.floor((now - Date.parse(last.at)) / 86_400_000),
    last,
  };
}

export function orderSummary(o: ShopOrder) {
  const state = parcelState(o);
  return {
    orderId: o.orderId,
    buyer: o.buyer,
    currency: o.currency,
    lines: o.lines,
    total: o.total,
    paid: Boolean(o.captureId),
    captureId: o.captureId,
    tracking: o.tracking,
    carrier: o.tracking ? `${o.tracking.carrier} (simulated tracking)` : undefined,
    events: o.events,
    delivered: state.delivered,
    daysSinceLastScan: state.shipped ? state.daysSinceLastScan : undefined,
    refunded: refundedAmount(o),
    refundable: o.total - refundedAmount(o),
  };
}
