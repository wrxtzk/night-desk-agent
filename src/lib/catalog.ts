import { load, save } from "./db";
import type { Currency } from "./paypal";

// Demo catalog. Prices are set per currency by the owner (not converted on the fly), so a JPY quote
// is a round yen figure the buyer recognises. Weights drive the shipping estimate.
export type Product = {
  sku: string;
  name: string;
  description: string;
  price: Record<Currency, number>;
  weightGrams: number;
  stock: number;
  bundleOf?: string[]; // SKUs, for a set the owner adopted from the morning report
};

const baseCatalog: Product[] = [
  { sku: "PEN-INK-SET", name: "Fountain pen + ink set", description: "Steel-nib fountain pen with a 30 ml bottle of midnight-blue ink.", price: { USD: 28, JPY: 4200 }, weightGrams: 320, stock: 6 },
  { sku: "WASHI-BUNDLE", name: "Washi tape bundle", description: "Eight rolls of hand-printed washi tape in hanji-paper colours.", price: { USD: 22, JPY: 3300 }, weightGrams: 180, stock: 14 },
  { sku: "HANGUL-STAMP", name: "Hangul stamp set", description: "24 rubber stamps of Hangul consonants and vowels with an ink pad.", price: { USD: 18, JPY: 2700 }, weightGrams: 260, stock: 9 },
  { sku: "GRID-NOTEBOOK", name: "Grid notebook A5", description: "A5 notebook, 5 mm grid, 160 pages of 100 gsm paper, lay-flat binding.", price: { USD: 14, JPY: 2100 }, weightGrams: 300, stock: 20 },
  { sku: "STICKER-PACK", name: "Moon sticker pack", description: "Forty matte stickers: moons, stars and tiny desk lamps.", price: { USD: 6, JPY: 900 }, weightGrams: 40, stock: 40 },
  { sku: "BRASS-CLIPS", name: "Brass paper clips", description: "A tin of 50 crescent-shaped brass paper clips.", price: { USD: 9, JPY: 1350 }, weightGrams: 120, stock: 18 },
];

// The base catalog plus the sets the owner adopted, shared by every route bundle.
const g = globalThis as unknown as { __nightDeskCatalog?: Product[] };
export const catalog: Product[] = (g.__nightDeskCatalog ??= [...baseCatalog, ...load<Product>("product")]);

export function addProduct(p: Product) {
  if (findProduct(p.sku)) throw new Error(`${p.sku} is already in the catalog.`);
  catalog.push(p);
  save("product", p.sku, p);
}

export function findProduct(sku: string): Product | undefined {
  return catalog.find((p) => p.sku === sku);
}

// Korea Post small-packet estimate by weight band and destination region (simplified for the demo).
export function shippingEstimate(weightGrams: number, country: string, currency: Currency): number {
  const asia = ["JP", "CN", "TW", "HK", "SG"].includes(country);
  const usd = weightGrams <= 250 ? (asia ? 5 : 7) : weightGrams <= 500 ? (asia ? 7 : 10) : asia ? 10 : 15;
  return currency === "JPY" ? usd * 150 : usd;
}
