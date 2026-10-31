# Night Desk

**The AI shopkeeper that minds your cross-border shop while you sleep.**

Night Desk is for solo sellers who sell abroad: handmade goods, ceramics, used cameras, indie design. It runs the shop through the seller's own PayPal account (sandbox): it answers buyers in their language, quotes in their currency, creates PayPal orders, refunds when a parcel is late, attaches tracking, and writes the reason for every money movement. The owner's house rules are enforced in code before any money moves, so a buyer who talks the model into something still can't get past them.

The demo shop, **Munbang Stationery**, is fictional: a made-up Korean stationery shop in Seoul selling to the US and Japan, with a made-up catalog. It exists only to show Night Desk working end to end. To run a different shop, edit `src/lib/shop.ts` and `src/lib/catalog.ts`.

Status (Oct 31, 2026): buyer page, PayPal checkout, the after-sale flow and the owner dashboard (`/owner`) work on the sandbox.

## How it works
- **Claude** (Anthropic API, `@anthropic-ai/sdk` tool runner) is the shopkeeper. Model: `claude-haiku-5-5` by default (short tool-calling turns; the money rules are enforced in code), with the system prompt and tools prompt-cached. Override with `NIGHT_DESK_MODEL`, e.g. `claude-sonnet-5-5`.
- **PayPal REST API** (sandbox) for orders in USD or JPY, capture and partial refunds: `src/lib/paypal.ts`.
- **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) for order lookup and shipment tracking (Shipping Trackers API): `src/lib/agent.ts`. Every order tool is limited to the buyer's own orders.
- **Rule gate** (`src/lib/rules.ts`): discount ≤ 15%; a refund must name its claim, which is checked against the carrier record (a parcel marked delivered can't be refunded as "not received"; "late" means no scan for 5 days); refunds the shopkeeper makes on its own stay within $15 per order and $30 per day, damage claims and anything larger are held for the owner.
- **Shop profile** (`src/lib/shop.ts`) and **catalog** (`src/lib/catalog.ts`): the only shop-specific code.
- **Orders** (`src/lib/orders.ts`) tie each PayPal order to its chat, its payment, its parcel and its refunds. **Simulated carrier** (`src/lib/carrier.ts`): Korea Post scans made up for the demo, dated back so a 5-day stall can be shown in a minute.
- **Ledger** (`src/lib/ledger.ts`): every quote, order, sale, refund, tracking number and gate decision with the agent's reason.
- **Owner dashboard** (`/owner`): the ledger with filters, the morning report, the requests the gate held (approving one sends the refund through PayPal, then the shopkeeper writes to the buyer in their language), and the house rules, which the owner can edit within bounds. The report's figures are computed in code from the ledger and **reconciled against PayPal's Transaction Search** (every capture and refund PayPal recorded must be in the ledger with the same amount, and the other way round), up to the time PayPal's records reach. The report's one suggestion is a set of products the night's buyers asked about: the demand is counted in code, the model proposes the set and its prices, and the code checks them against the catalog and the discount rule before the owner can adopt it into the catalog.
- **Storage** (`src/lib/db.ts`): one SQLite file (Node's built-in `node:sqlite`) in `DATA_DIR` (default `.data/`). An empty database is seeded with a demo night (`src/data/demo-night.json`): four orders, captures and refunds that really went through the PayPal sandbox on Oct 29, 2026 (UTC), plus the quotes and gate decisions of that test night. Render's free plan has no persistent disk, so the live demo starts from that night again after each restart.

## Run it locally
1. Node 22. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your PayPal **sandbox** Client ID and Secret and an Anthropic API key. The sandbox app needs Transaction search turned on in its features, for the morning report's reconciliation.
3. `npm run dev`, open http://localhost:3000 and ask the shop for something.
4. Pay the PayPal link with a sandbox Personal account. PayPal sends you back to `/api/paypal/return`, which captures the payment.
5. After paying, the order slip has demo buttons for the owner and the carrier (ship it, no scan for 5 days, delivered). Watch what the shopkeeper does, then try asking for a refund you shouldn't get.
6. Open http://localhost:3000/owner for the owner's side: what the shopkeeper did and why, the morning report, approvals and house rules.

Rule gate checks without the model: `npx tsx scripts/gate-check.ts`

After-sale flow and ten attacks against the real model and sandbox (refunds really go out on sandbox captures, so edit the order IDs to ones you paid): `npx tsx --env-file=.env.local scripts/after-sale-check.mts`

## Endpoints
| Route | What it does |
|---|---|
| `POST /api/chat` | `{ sessionId, message }` → the shopkeeper's reply |
| `GET /api/paypal/return` | PayPal return URL; captures the approved order |
| `POST /api/webhook` | PayPal webhook; verifies the signature with PayPal, then records the capture |
| `GET /api/order?sessionId=` | The buyer's latest order: payment, tracking, scans, refunds |
| `POST /api/demo/carrier` | `{ sessionId, orderId, step }` with `ship`, `stall` or `deliver`: plays the owner or the simulated carrier for the buyer's own paid order, and returns the shopkeeper's reaction |
| `GET /api/inbox?sessionId=` | Messages the shop posted into the buyer's chat on its own (after the owner decided a held request) |
| `GET /api/ledger` | House rules and ledger entries |
| `GET /api/owner` | Everything the owner dashboard shows: report, reconciliation, suggestion, ledger, held requests, rules |
| `POST /api/owner/decide` | `{ id, decision }` with `approved` or `declined`, for a held refund request |
| `PUT /api/owner/rules` | New house rule values, checked against their bounds |
| `POST /api/owner/suggestion` | `{ window, action }` with `adopt` or `dismiss` |

The `/api/owner/*` writes need the header `x-owner-key` when `OWNER_KEY` is set (the dashboard asks for it). Reading the dashboard needs no key.

## Deploy
`render.yaml` is a Render Blueprint for one Node web service. Set the secrets in the Render dashboard, set `APP_URL` to the service URL, set `OWNER_KEY` if owner actions should need a key, and point a PayPal sandbox webhook (event `PAYMENT.CAPTURE.COMPLETED`) at `https://<your-service>/api/webhook`; put its ID in `PAYPAL_WEBHOOK_ID`.

Sandbox only. Carrier events in the demo are simulated.
