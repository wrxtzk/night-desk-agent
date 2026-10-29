# Night Desk

**The AI shopkeeper that minds your cross-border shop while you sleep.**

Night Desk is for solo sellers who sell abroad: handmade goods, ceramics, used cameras, indie design. It runs the shop through the seller's own PayPal account (sandbox): it answers buyers in their language, quotes in their currency, creates PayPal orders, refunds when a parcel is late, attaches tracking, and writes the reason for every money movement. The owner's house rules are enforced in code before any money moves, so a buyer who talks the model into something still can't get past them.

The demo shop is **Munbang Stationery**, a Korean stationery shop in Seoul selling to the US and Japan. To run a different shop, edit `src/lib/shop.ts` and `src/lib/catalog.ts`.

Status: M0 skeleton (Oct 29, 2026). Owner dashboard and buyer page come next.

## How it works
- **Claude** (Anthropic API, `@anthropic-ai/sdk` tool runner) is the shopkeeper. Model: `claude-opus-5-5` by default, override with `NIGHT_DESK_MODEL`.
- **PayPal REST API** (sandbox) for orders in USD or JPY, capture and partial refunds: `src/lib/paypal.ts`.
- **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) for order lookup and shipment tracking: `src/lib/agent.ts`.
- **Rule gate** (`src/lib/rules.ts`): discount ≤ 15%, refunds ≤ $15 go out automatically, more is held for the owner, at most $30 of refunds per day.
- **Shop profile** (`src/lib/shop.ts`) and **catalog** (`src/lib/catalog.ts`): the only shop-specific code.
- **Ledger** (`src/lib/ledger.ts`): every order, sale, refund and gate decision with the agent's reason. In memory for now.

## Run it locally
1. Node 22. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your PayPal **sandbox** Client ID and Secret and an Anthropic API key.
3. `npm run dev`, open http://localhost:3000 and ask the shop for something.
4. Pay the PayPal link with a sandbox Personal account. PayPal sends you back to `/api/paypal/return`, which captures the payment.
5. `GET /api/ledger` shows what the shopkeeper did and why.

Rule gate checks without the model: `npx tsx scripts/gate-check.ts`

## Endpoints
| Route | What it does |
|---|---|
| `POST /api/chat` | `{ sessionId, message }` → the shopkeeper's reply |
| `GET /api/paypal/return` | PayPal return URL; captures the approved order |
| `POST /api/webhook` | PayPal webhook; verifies the signature with PayPal, then records the capture |
| `GET /api/ledger` | House rules and ledger entries |

## Deploy
`render.yaml` is a Render Blueprint for one Node web service. Set the secrets in the Render dashboard, set `APP_URL` to the service URL, and point a PayPal sandbox webhook (event `PAYMENT.CAPTURE.COMPLETED`) at `https://<your-service>/api/webhook`; put its ID in `PAYPAL_WEBHOOK_ID`.

Sandbox only. Carrier events in the demo are simulated.
