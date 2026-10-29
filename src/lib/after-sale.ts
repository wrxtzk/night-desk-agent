import { shopEvent, shopkeeperReply } from "./agent";
import { CARRIER, PAYPAL_CARRIER, simulate, trackingNumber, type CarrierStep } from "./carrier";
import type { ShopOrder } from "./orders";

// Play one after-sale event on a paid order (the owner ships it, the simulated carrier stalls or delivers it)
// and let the shopkeeper react to it in the buyer's conversation.
export async function playStep(order: ShopOrder, step: CarrierStep) {
  let notice: string;
  let event: string;
  if (step === "ship") {
    order.tracking ??= { number: trackingNumber(), carrier: CARRIER, attachedToPayPal: false };
    order.events = simulate(order, "ship");
    notice = `The owner shipped your order with ${CARRIER}, tracking ${order.tracking.number}.`;
    event = shopEvent(
      "owner",
      `I shipped order ${order.orderId} by ${CARRIER} this morning, tracking number ${order.tracking.number}. Attach it to the PayPal transaction (order_id ${order.orderId}, transaction_id ${order.captureId}, carrier ${PAYPAL_CARRIER}, status SHIPPED), then let the buyer know.`,
    );
  } else if (step === "stall") {
    order.events = simulate(order, "stall");
    notice = "Carrier: no scan for 5 days since the parcel left Incheon.";
    event = shopEvent("carrier", `Order ${order.orderId}, ${CARRIER} ${order.tracking?.number}: no new scan for 5 days since "Departed Incheon International Mail Centre". Check the order and decide what to do for the buyer.`);
  } else {
    order.events = simulate(order, "deliver");
    const last = order.events.at(-1)!;
    notice = `Carrier: delivered (${last.note.toLowerCase()}).`;
    event = shopEvent("carrier", `Order ${order.orderId}, ${CARRIER} ${order.tracking?.number}: ${last.note} at ${last.place}. Let the buyer know.`);
  }
  const reply = await shopkeeperReply(order.sessionId, event);
  return { notice, ...reply };
}
