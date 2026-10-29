// Server-only configuration. Every value comes from the environment (.env.local locally, Render env vars in production).
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  paypalClientId: () => required("PAYPAL_CLIENT_ID"),
  paypalClientSecret: () => required("PAYPAL_CLIENT_SECRET"),
  // Webhook ID from the PayPal developer dashboard; needed to verify webhook signatures.
  paypalWebhookId: () => process.env.PAYPAL_WEBHOOK_ID ?? "",
  // Public base URL of this app, used for PayPal return/cancel URLs.
  appUrl: () => process.env.APP_URL ?? "http://localhost:3000",
  model: () => process.env.NIGHT_DESK_MODEL ?? "claude-opus-5-5",
};

// Night Desk only ever talks to the PayPal sandbox.
export const PAYPAL_API = "https://api-m.sandbox.paypal.com";
