import type { CarrierEvent, ShopOrder } from "./orders";

// Simulated Korea Post tracking for the demo. There is no real carrier: the scans below are made up
// and the page says so. Scans are dated back from now so "no movement for 5 days" can be shown in a minute.

export const CARRIER = "Korea Post";
// PayPal's carrier code for Korea Post (used when the tracking number is attached to the transaction).
export const PAYPAL_CARRIER = "KOREA_POST";

// UPU S10 number (two letters, eight digits, check digit, country), e.g. RR123456785KR.
export function trackingNumber(): string {
  const digits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
  const sum = digits.reduce((s, d, i) => s + d * [8, 6, 4, 2, 3, 5, 9, 7][i], 0);
  const c = 11 - (sum % 11);
  return `RR${digits.join("")}${c === 10 ? 0 : c === 11 ? 5 : c}KR`;
}

// A scan at about `hour` UTC, at least `days` full days ago (so "5 days without a scan" holds at any time of day).
const daysAgo = (days: number, hour: number) => {
  const latest = Date.now() - days * 86_400_000;
  const minute = 10 + Math.floor(Math.random() * 40);
  const d = new Date(latest);
  d.setUTCHours(hour, minute, 0, 0);
  if (d.getTime() > latest) d.setTime(latest - minute * 60_000);
  return d.toISOString();
};

function destination(o: ShopOrder) {
  if (o.country === "JP") return "Tokyo International Post Office, JP";
  if (o.country === "US") return "International Service Center, US";
  return `International mail centre, ${o.country}`;
}

const accepted = (o: ShopOrder, at: string): CarrierEvent => ({ at, status: "accepted", place: "Gwanghwamun Post Office, Seoul", note: `Accepted for ${o.buyer}` });
const departed = (at: string): CarrierEvent => ({ at, status: "in_transit", place: "Incheon International Mail Centre, KR", note: "Departed for destination country" });

export type CarrierStep = "ship" | "stall" | "deliver";

export function simulate(o: ShopOrder, step: CarrierStep): CarrierEvent[] {
  switch (step) {
    case "ship":
      return [accepted(o, new Date().toISOString())];
    case "stall":
      // Accepted six days ago, last scan five days ago, nothing since.
      return [accepted(o, daysAgo(6, 1)), departed(daysAgo(5, 9))];
    case "deliver":
      return [
        accepted(o, daysAgo(6, 1)),
        departed(daysAgo(5, 9)),
        { at: daysAgo(3, 2), status: "arrived", place: destination(o), note: "Arrived in destination country, cleared customs" },
        { at: daysAgo(1, 0), status: "out_for_delivery", place: o.buyer, note: "Out for delivery" },
        { at: daysAgo(1, 5), status: "delivered", place: o.buyer, note: "Delivered, signed for at the address" },
      ];
  }
}
