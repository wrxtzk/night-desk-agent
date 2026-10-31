import { env, PAYPAL_API } from "./env";
import { shop } from "./shop";

// Thin REST client for the PayPal sandbox. Orders, capture and refunds go through here because
// the Agent Toolkit's create_order only accepts USD and Night Desk quotes in the buyer's currency.

export type Currency = "USD" | "JPY";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const basic = Buffer.from(`${env.paypalClientId()}:${env.paypalClientSecret()}`).toString("base64");
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal token request failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export class PayPalError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`PayPal API error ${status}: ${JSON.stringify(body).slice(0, 400)}`);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${PAYPAL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalError(res.status, data);
  return data as T;
}

// JPY has no minor unit; PayPal rejects "1800.00".
export function formatAmount(value: number, currency: Currency): string {
  return currency === "JPY" ? String(Math.round(value)) : value.toFixed(2);
}

type Link = { rel: string; href: string };
export type PayPalOrder = { id: string; status: string; links?: Link[]; purchase_units?: unknown[] };

export async function createOrder(input: {
  currency: Currency;
  items: { name: string; quantity: number; unitPrice: number }[];
  discount: number;
  shipping: number;
  description: string;
  referenceId: string;
}): Promise<{ orderId: string; approveUrl: string; total: string }> {
  const { currency } = input;
  const itemTotal = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const total = itemTotal - input.discount + input.shipping;
  const amount = (v: number) => ({ currency_code: currency, value: formatAmount(v, currency) });
  const order = await call<PayPalOrder>("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.referenceId,
        description: input.description.slice(0, 127),
        amount: {
          ...amount(total),
          breakdown: { item_total: amount(itemTotal), discount: amount(input.discount), shipping: amount(input.shipping) },
        },
        items: input.items.map((i) => ({ name: i.name.slice(0, 127), quantity: String(i.quantity), unit_amount: amount(i.unitPrice) })),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: `${shop.name} (sandbox)`,
          user_action: "PAY_NOW",
          shipping_preference: "GET_FROM_FILE",
          return_url: `${env.appUrl()}/api/paypal/return`,
          cancel_url: `${env.appUrl()}/?cancelled=1`,
        },
      },
    },
  });
  const approve = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!approve) throw new Error(`PayPal order ${order.id} has no approval link`);
  return { orderId: order.id, approveUrl: approve.href, total: formatAmount(total, currency) };
}

export type Capture = {
  orderId: string;
  captureId: string;
  status: string;
  currency: Currency;
  gross: number;
  fee: number;
  net: number;
  // Net amount converted to the merchant's account currency (USD), when PayPal converted it.
  netUsd: number;
  exchangeRate?: number;
  payerCountry?: string;
};

type CaptureResponse = {
  id: string;
  status: string;
  payer?: { address?: { country_code?: string } };
  purchase_units: {
    payments: {
      captures: {
        id: string;
        status: string;
        amount: { currency_code: Currency; value: string };
        seller_receivable_breakdown?: {
          gross_amount: { value: string };
          paypal_fee?: { value: string };
          net_amount: { value: string };
          receivable_amount?: { value: string };
          exchange_rate?: { value: string };
        };
      }[];
    };
  }[];
};

export async function captureOrder(orderId: string): Promise<Capture> {
  const res = await call<CaptureResponse>("POST", `/v2/checkout/orders/${orderId}/capture`, {});
  const cap = res.purchase_units[0].payments.captures[0];
  const bd = cap.seller_receivable_breakdown;
  const net = Number(bd?.net_amount.value ?? cap.amount.value);
  const netUsd = bd?.receivable_amount ? Number(bd.receivable_amount.value) : net;
  return {
    orderId,
    captureId: cap.id,
    status: cap.status,
    currency: cap.amount.currency_code,
    gross: Number(cap.amount.value),
    fee: Number(bd?.paypal_fee?.value ?? 0),
    net,
    netUsd,
    exchangeRate: bd?.exchange_rate ? Number(bd.exchange_rate.value) : undefined,
    payerCountry: res.payer?.address?.country_code,
  };
}

export async function refundCapture(input: { captureId: string; amount: number; currency: Currency; note: string }) {
  return call<{ id: string; status: string; amount: { value: string; currency_code: Currency } }>(
    "POST",
    `/v2/payments/captures/${input.captureId}/refund`,
    { amount: { value: formatAmount(input.amount, input.currency), currency_code: input.currency }, note_to_payer: input.note.slice(0, 255) },
  );
}

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = env.paypalWebhookId();
  if (!webhookId) return false;
  const res = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: event,
  });
  return res.verification_status === "SUCCESS";
}

// Transaction Search (Reporting API). PayPal refreshes this data every few hours; last_refreshed_datetime
// says how far it reaches, so the morning report only reconciles up to that moment.
export type PayPalTransaction = { id: string; eventCode: string; at: string; currency: Currency; amount: number; fee: number; referenceId?: string };

type SearchResponse = {
  last_refreshed_datetime: string;
  total_pages: number;
  transaction_details: {
    transaction_info: {
      transaction_id: string;
      transaction_event_code: string;
      transaction_initiation_date: string;
      transaction_amount: { currency_code: Currency; value: string };
      fee_amount?: { value: string };
      paypal_reference_id?: string;
    };
  }[];
};

export async function searchTransactions(start: Date, end: Date): Promise<{ through: string; transactions: PayPalTransaction[] }> {
  const iso = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;
  const transactions: PayPalTransaction[] = [];
  let through = "";
  for (let page = 1, pages = 1; page <= pages; page++) {
    const q = new URLSearchParams({ start_date: iso(start), end_date: iso(end), fields: "transaction_info", page_size: "500", page: String(page) });
    const res = await call<SearchResponse>("GET", `/v1/reporting/transactions?${q}`);
    through = res.last_refreshed_datetime;
    pages = res.total_pages || 1;
    for (const { transaction_info: t } of res.transaction_details ?? []) {
      transactions.push({
        id: t.transaction_id,
        eventCode: t.transaction_event_code,
        at: t.transaction_initiation_date,
        currency: t.transaction_amount.currency_code,
        amount: Number(t.transaction_amount.value),
        fee: Math.abs(Number(t.fee_amount?.value ?? 0)),
        referenceId: t.paypal_reference_id,
      });
    }
  }
  return { through, transactions };
}
