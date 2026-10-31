import Anthropic from "@anthropic-ai/sdk";
import { addProduct, catalog, findProduct, type Product } from "./catalog";
import { loadOne, save } from "./db";
import { env } from "./env";
import { allEntries } from "./ledger";
import { houseRules } from "./rules";

// One suggestion per morning report: a set of products the night's buyers asked about. The evidence is counted
// here; the model only proposes the set and its prices, and the code checks them before the owner sees them.

export type Suggestion = {
  window: string;
  evidence: string; // counted from the ledger, not written by the model
  pitch: string;
  product: Product;
  status: "open" | "adopted" | "dismissed";
};

function demand(window: { start: string; end: string }) {
  const counts = new Map<string, { product: string; country: string; asks: number; bought: number }>();
  for (const e of allEntries()) {
    if (e.at < window.start || e.at >= window.end || (e.kind !== "quote" && e.kind !== "sale")) continue;
    const country = e.buyer?.match(/\b([A-Z]{2})$/)?.[1] ?? "?";
    for (const product of e.items ?? []) {
      const key = `${product}|${country}`;
      const c = counts.get(key) ?? { product, country, asks: 0, bought: 0 };
      if (e.kind === "quote") c.asks++;
      else c.bought++;
      counts.set(key, c);
    }
  }
  return [...counts.values()].sort((a, b) => b.asks - a.asks || b.bought - a.bought);
}

const countryName: Record<string, string> = { JP: "Japanese", US: "US", KR: "Korean", CA: "Canadian", GB: "UK" };

const client = new Anthropic();

const proposeSet = {
  name: "propose_set",
  description: "Propose one new set made of products already in the catalog.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Short product name, e.g. 'Washi Starter Set'" },
      description: { type: "string", description: "One sentence for the catalog" },
      skus: { type: "array", items: { type: "string" }, description: "Two or three SKUs from the catalog" },
      priceUSD: { type: "number", description: "Whole dollars" },
      priceJPY: { type: "number", description: "Whole yen, a multiple of 100" },
      pitch: { type: "string", description: "One sentence to the owner, first person, why this set" },
    },
    required: ["name", "description", "skus", "priceUSD", "priceJPY", "pitch"],
  },
};

type Proposal = { name: string; description: string; skus: string[]; priceUSD: number; priceJPY: number; pitch: string };

function check(p: Proposal): Product | string {
  const parts = p.skus.map(findProduct);
  if (parts.length < 2 || parts.length > 3 || parts.some((x) => !x || x.bundleOf)) return "a set needs two or three catalog products";
  const items = parts as Product[];
  const sum = (c: "USD" | "JPY") => items.reduce((s, x) => s + x.price[c], 0);
  const floor = 1 - houseRules.maxDiscountPct / 100;
  if (!Number.isInteger(p.priceUSD) || p.priceUSD > sum("USD") || p.priceUSD < Math.ceil(sum("USD") * floor)) return "USD price outside the discount rule";
  if (p.priceJPY % 100 !== 0 || p.priceJPY > sum("JPY") || p.priceJPY < sum("JPY") * floor) return "JPY price outside the discount rule";
  const sku = `SET-${items.map((x) => x.sku.split("-")[0]).join("-")}`;
  if (findProduct(sku)) return "that set is already in the catalog";
  return {
    sku,
    name: p.name.slice(0, 40),
    description: p.description.slice(0, 160),
    price: { USD: p.priceUSD, JPY: p.priceJPY },
    weightGrams: items.reduce((s, x) => s + x.weightGrams, 0),
    stock: Math.min(...items.map((x) => x.stock)),
    bundleOf: items.map((x) => x.sku),
  };
}

// Several dashboard loads at once share one proposal.
const g = globalThis as unknown as { __nightDeskProposals?: Map<string, Promise<Suggestion | null>> };
const inFlight = (g.__nightDeskProposals ??= new Map());

export function suggestionFor(window: { start: string; end: string }): Promise<Suggestion | null> {
  const saved = loadOne<Suggestion>("report", window.start);
  if (saved) return Promise.resolve(saved);
  if (!inFlight.has(window.start)) inFlight.set(window.start, propose(window).finally(() => inFlight.delete(window.start)));
  return inFlight.get(window.start)!;
}

async function propose(window: { start: string; end: string }): Promise<Suggestion | null> {
  const top = demand(window).filter((d) => d.asks >= 2);
  if (top.length === 0) return null;
  const lead = top[0];
  const evidence = `${countryName[lead.country] ?? lead.country} buyers asked about the ${lead.product.toLowerCase()} ${lead.asks} times${lead.bought ? ` and bought ${lead.bought}` : ""}.`;
  const products = catalog.filter((p) => !p.bundleOf).map(({ sku, name, price, stock }) => ({ sku, name, price, stock }));

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: env.model(),
      max_tokens: 1000,
      tools: [proposeSet],
      tool_choice: { type: "tool", name: "propose_set" },
      messages: [
        {
          role: "user",
          content: `You help the owner of a small Korean stationery shop that sells abroad. Last night's demand (asks = quotes, bought = paid orders):\n${JSON.stringify(top)}\n\nCatalog:\n${JSON.stringify(products)}\n\nPropose one set built around what buyers asked about most, for those buyers. Price it below the sum of its parts but no more than ${houseRules.maxDiscountPct}% off.`,
        },
      ],
    });
    const use = res.content.find((b) => b.type === "tool_use");
    if (!use || use.type !== "tool_use") continue;
    const product = check(use.input as Proposal);
    if (typeof product === "string") {
      console.log(`[suggest] proposal rejected: ${product}`);
      continue;
    }
    const s: Suggestion = { window: window.start, evidence, pitch: (use.input as Proposal).pitch.slice(0, 200), product, status: "open" };
    save("report", window.start, s);
    return s;
  }
  return null;
}

export function decideSuggestion(windowStart: string, action: "adopt" | "dismiss"): Suggestion {
  const s = loadOne<Suggestion>("report", windowStart);
  if (!s) throw new Error("No suggestion for this report.");
  if (s.status !== "open") return s;
  if (action === "adopt") addProduct(s.product);
  s.status = action === "adopt" ? "adopted" : "dismissed";
  save("report", windowStart, s);
  return s;
}
