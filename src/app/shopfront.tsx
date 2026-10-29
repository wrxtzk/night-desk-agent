"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import type { OrderView } from "@/lib/agent";
import type { Product } from "@/lib/catalog";
import type { Currency } from "@/lib/paypal";
import s from "./shopfront.module.css";

type Shop = { name: string; sells: string; shipsFrom: string; ownerTimeZone: string; carrier: string };
type Rules = { maxDiscountPct: number; autoRefundUsd: number; dailyRefundUsd: number };
type Entry =
  | { kind: "buyer"; text: string }
  | { kind: "shop"; text: string }
  | { kind: "event"; tone: "paid" | "note" | "error"; text: string; retry?: string };
type Order = OrderView;
type CarrierStep = "ship" | "stall" | "deliver";

const SESSION_KEY = "night-desk-session";
const THREAD_KEY = "night-desk-thread";

const SUGGESTIONS = [
  { text: "How much is the fountain pen and ink set, delivered to California?", lang: "en" },
  { text: "和紙テープのセット、東京まで送料込みでいくらですか？", lang: "ja" },
  { text: "20%引きできますか？", lang: "ja" },
];

const isJapanese = (t: string) => /[぀-ヿ]/.test(t);

function money(value: number, currency: Currency, wholeIfRound = false) {
  const digits = currency === "JPY" || (wholeIfRound && Number.isInteger(value)) ? 0 : 2;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

const Crescent = ({ size = 18 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M16 3a9 9 0 1 0 5 13.5A7.2 7.2 0 0 1 16 3Z" fill="currentColor" />
  </svg>
);

// Shopkeeper replies arrive as light markdown: paragraphs, "- " lists, **bold**, links.
function Rich({ text }: { text: string }) {
  const inline = (line: string, key: string): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push(line.slice(last, m.index));
      const k = `${key}-${m.index}`;
      if (m[1]) out.push(<strong key={k}>{inline(m[1], k)}</strong>);
      else {
        const href = m[3] ?? m[4];
        const checkout = href.includes("paypal.com/checkoutnow");
        out.push(
          <a key={k} href={href} className={checkout ? s.inlinePay : undefined}>
            {checkout ? "Open PayPal checkout" : m[2] ?? href}
          </a>,
        );
      }
      last = re.lastIndex;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
  };

  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => {
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l, `l${blocks.length}-${i}`)}</li>)}</ul>);
    list = [];
  };
  const flushPara = () => {
    if (para.length)
      blocks.push(
        <p key={`p${blocks.length}`}>
          {para.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {inline(l, `p${blocks.length}-${i}`)}
            </Fragment>
          ))}
        </p>,
      );
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^#{1,6}\s+(.*)$/, "**$1**");
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (!line.trim()) {
      flushList();
      flushPara();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList();
  flushPara();
  return <>{blocks}</>;
}

function PayButton({ order }: { order: Order }) {
  return (
    <a className={s.pay} href={order.payUrl}>
      <span className={s.payMark}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/paypal-mark.svg" alt="" width={14} height={17} />
      </span>
      Pay {money(order.total, order.currency)} with PayPal
    </a>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

// The parcel's (simulated) carrier record, newest scan first, and the demo buttons that play the next event.
function Parcel({ order, busy, onStep }: { order: Order; busy: boolean; onStep: (step: CarrierStep) => void }) {
  const last = order.events.at(-1)?.status;
  const ship = { step: "ship" as const, label: "Owner ships it" };
  const stall = { step: "stall" as const, label: "No scan for 5 days" };
  const deliver = { step: "deliver" as const, label: "Parcel delivered" };
  // Shipped: it can stall or arrive. Stalled (left Incheon, nothing since): it can only arrive.
  const steps = !order.tracking ? [ship] : last === "accepted" ? [stall, deliver] : last === "in_transit" ? [deliver] : [];
  return (
    <section className={s.parcel} aria-labelledby="parcel-title">
      <div className={s.parcelHead}>
        <h3 id="parcel-title">Parcel</h3>
        <span className={s.muted}>Simulated carrier</span>
      </div>
      {order.tracking ? (
        <>
          <p className={s.trackingLine}>
            {order.tracking.carrier} <span className={s.trackingNo}>{order.tracking.number}</span>
            {order.tracking.attachedToPayPal && <span className={s.muted}>, on the PayPal transaction</span>}
          </p>
          <ol className={s.scans} reversed>
            {[...order.events].reverse().map((e) => (
              <li key={e.at} data-status={e.status}>
                <span className={s.scanWhen}>{shortDate(e.at)}</span>
                <span>{e.note}</span>
                <span className={s.muted}>{e.place}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className={s.muted}>Not shipped yet. The owner packs orders in the morning, Seoul time.</p>
      )}
      {steps.length > 0 && (
        <div className={s.demoSteps}>
          <p className={s.muted}>Demo: these buttons stand in for the owner and the carrier, so you can see what the shopkeeper does next.</p>
          <div>
            {steps.map((x) => (
              <button key={x.step} type="button" className={s.ghost} disabled={busy} onClick={() => onStep(x.step)}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Slip({ order, busy, onStep }: { order: Order | null; busy: boolean; onStep: (step: CarrierStep) => void }) {
  if (!order) {
    return (
      <section className={s.slip} aria-labelledby="slip-title">
        <h2 id="slip-title" className={s.panelTitle}>Your order</h2>
        <div className={s.slipEmpty}>
          <p>Nothing yet. Ask for a price and the shopkeeper puts your order here, ready to pay with PayPal.</p>
          <p className={s.muted}>Ships from Seoul by Korea Post. Import duties, if any, are paid to the carrier on delivery.</p>
        </div>
      </section>
    );
  }
  const paid = Boolean(order.captureId);
  return (
    <section className={s.slip} aria-labelledby="slip-title">
      <div className={s.slipHead}>
        <h2 id="slip-title" className={s.panelTitle}>Your order</h2>
        <span className={paid ? s.pillPaid : s.pillOpen}>{paid ? "Paid" : "Ready to pay"}</span>
      </div>
      <table className={s.lines}>
        <tbody>
          {order.lines.map((l) => (
            <tr key={l.name}>
              <th scope="row">
                {l.name}
                {l.quantity > 1 && <span className={s.muted}> ×{l.quantity}</span>}
              </th>
              <td>{money(l.unitPrice * l.quantity, order.currency)}</td>
            </tr>
          ))}
          {order.discount > 0 && (
            <tr>
              <th scope="row">Discount</th>
              <td>−{money(order.discount, order.currency)}</td>
            </tr>
          )}
          <tr>
            <th scope="row">Shipping from Seoul</th>
            <td>{money(order.shipping, order.currency)}</td>
          </tr>
        </tbody>
      </table>
      <div className={s.total}>
        <span>Total</span>
        <strong>
          <mark>{money(order.total, order.currency)}</mark>
        </strong>
      </div>
      {paid ? (
        <p className={s.paidNote}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M4 12l5 5L20 6" />
          </svg>
          Paid through PayPal. The sale is in the shop&apos;s ledger for the owner.
        </p>
      ) : (
        <PayButton order={order} />
      )}
      {order.refunds.length > 0 && (
        <table className={s.lines}>
          <tbody>
            {order.refunds.map((r) => (
              <tr key={r.id}>
                <th scope="row">Refunded through PayPal</th>
                <td className={s.refund}>−{money(r.amount, order.currency)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">You paid in the end</th>
              <td>{money(order.total - order.refunds.reduce((sum, r) => sum + r.amount, 0), order.currency)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {paid && <Parcel order={order} busy={busy} onStep={onStep} />}
      <dl className={s.slipMeta}>
        <div>
          <dt>PayPal order</dt>
          <dd>{order.orderId}</dd>
        </div>
        {order.captureId && (
          <div>
            <dt>Capture</dt>
            <dd>{order.captureId}</dd>
          </div>
        )}
      </dl>
      <p className={s.muted}>Import duties, if any, are paid to the carrier on delivery.</p>
    </section>
  );
}

function ShopNotes({ rules, idPrefix }: { rules: Rules; idPrefix: string }) {
  return (
    <>
      <section aria-labelledby={`${idPrefix}-rules`} className={s.rules}>
        <h2 id={`${idPrefix}-rules`} className={s.panelTitle}>House rules</h2>
        <p>Checked in code before any money moves. The shopkeeper can&apos;t talk its way past them.</p>
        <dl>
          <div>
            <dt>Discount</dt>
            <dd>up to {rules.maxDiscountPct}%</dd>
          </div>
          <div>
            <dt>Refund without the owner</dt>
            <dd>up to ${rules.autoRefundUsd}</dd>
          </div>
          <div>
            <dt>Refunds per day</dt>
            <dd>up to ${rules.dailyRefundUsd}</dd>
          </div>
        </dl>
      </section>
      <p className={s.demo}>Fictional demo shop on the PayPal sandbox. No real money moves and nothing ships.</p>
    </>
  );
}

export function Shopfront({ shop, catalog, rules }: { shop: Shop; catalog: Product[]; rules: Rules }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [clock, setClock] = useState<{ time: string; night: boolean } | null>(null);
  const session = useRef("");
  const loaded = useRef(false);
  const thread = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  // Restore the conversation (it has to survive the round trip to PayPal) and read the return from checkout.
  useEffect(() => {
    session.current = sessionStorage.getItem(SESSION_KEY) ?? crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, session.current);
    let saved: { entries: Entry[]; order: Order | null } = { entries: [], order: null };
    try {
      saved = JSON.parse(sessionStorage.getItem(THREAD_KEY) ?? "") ?? saved;
    } catch {
      // Nothing saved yet.
    }
    let { entries: restored, order: restoredOrder } = saved;
    const q = new URLSearchParams(location.search);
    if (q.get("paid") === "1") {
      const captureId = q.get("capture") ?? "";
      if (restoredOrder && restoredOrder.orderId === q.get("order")) restoredOrder = { ...restoredOrder, captureId };
      const amount = restoredOrder?.captureId ? `${money(restoredOrder.total, restoredOrder.currency)} ` : "";
      restored = [...restored, { kind: "event", tone: "paid", text: `Paid ${amount}through PayPal. Capture ${captureId}.` }];
    } else if (q.get("paid") === "0") {
      restored = [...restored, { kind: "event", tone: "error", text: "PayPal didn't complete the payment. Your order is still open; you can try again." }];
    } else if (q.get("cancelled") === "1") {
      restored = [...restored, { kind: "event", tone: "note", text: "Checkout cancelled. Your order is still open." }];
    }
    if (q.size) history.replaceState(null, "", location.pathname);
    setEntries(restored);
    // Orders saved by an older version of the page lack these lists.
    setOrder(restoredOrder && { ...restoredOrder, events: restoredOrder.events ?? [], refunds: restoredOrder.refunds ?? [] });
    // The shop's record is the source of truth (paid, shipped, refunded); the saved copy only bridges a restart.
    if (restoredOrder) {
      fetch(`/api/order?sessionId=${encodeURIComponent(session.current)}`)
        .then((r) => r.json())
        .then((d: { order: OrderView | null }) => d.order && setOrder(d.order))
        .catch(() => {});
    }
    if (navigator.language.toLowerCase().startsWith("ja")) setCurrency("JPY");
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (loaded.current) sessionStorage.setItem(THREAD_KEY, JSON.stringify({ entries, order }));
  }, [entries, order]);

  useEffect(() => {
    const tick = () => {
      const time = new Intl.DateTimeFormat("en-GB", { timeZone: shop.ownerTimeZone, hour: "2-digit", minute: "2-digit" }).format(new Date());
      const hour = Number(time.slice(0, 2));
      setClock({ time, night: hour < 7 || hour >= 23 });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [shop.ownerTimeZone]);

  // Jump to the latest line when the thread is restored; glide for new lines after that.
  const scrolled = useRef(false);
  useEffect(() => {
    const el = thread.current;
    if (!el || !loaded.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: scrolled.current ? "smooth" : "auto" });
    scrolled.current = true;
  }, [entries, busy]);

  async function ask(text: string) {
    if (!text || busy) return;
    setEntries((e) => [...e, { kind: "buyer", text }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.current, message: text }),
      });
      const data = (await res.json()) as { text?: string; error?: string; order?: OrderView };
      if (!res.ok || !data.text) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEntries((e) => [...e, { kind: "shop", text: data.text! }]);
      if (data.order) setOrder(data.order);
    } catch {
      setEntries((e) => [...e, { kind: "event", tone: "error", text: "The shopkeeper didn't answer. Your message was not lost.", retry: text }]);
    } finally {
      setBusy(false);
    }
  }

  async function carrierStep(step: CarrierStep) {
    if (!order || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/demo/carrier", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.current, orderId: order.orderId, step }),
      });
      const data = (await res.json()) as { notice?: string; text?: string; error?: string; order?: OrderView };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEntries((e) => [...e, { kind: "event", tone: "note", text: data.notice ?? "" }, ...(data.text ? [{ kind: "shop" as const, text: data.text }] : [])]);
      if (data.order) setOrder(data.order);
    } catch (err) {
      setEntries((e) => [...e, { kind: "event", tone: "error", text: err instanceof Error && err.message ? err.message : "That step didn't go through." }]);
    } finally {
      setBusy(false);
    }
  }

  function retry(text: string, index: number) {
    // Drop the failed buyer line and its error, then ask again.
    setEntries((e) => e.filter((_, i) => i !== index && i !== index - 1));
    void ask(text);
  }

  function pick(p: Product) {
    setDraft(`How much is the ${p.name}, delivered to `);
    setCatalogOpen(false);
    requestAnimationFrame(() => {
      const el = composer.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  const status = clock
    ? clock.night
      ? `It's ${clock.time} in Seoul and the owner is asleep, so Night Desk, an AI shopkeeper, is answering.`
      : `It's ${clock.time} in Seoul. Night Desk, an AI shopkeeper, answers for the owner.`
    : "Night Desk, an AI shopkeeper, answers for the owner.";

  return (
    <div className={s.app}>
      <header className={s.phoneBar}>
        <span className={s.phoneName}>
          <Crescent size={16} />
          Night Desk
        </span>
        <button type="button" className={s.ghost} aria-expanded={catalogOpen} aria-controls="catalog" onClick={() => setCatalogOpen((o) => !o)}>
          {catalogOpen ? "Close" : "Catalog"}
        </button>
      </header>

      <aside id="catalog" className={s.side} data-open={catalogOpen}>
        <div className={s.brand}>
          <Crescent size={20} />
          Night Desk
        </div>
        <section aria-labelledby="catalog-title">
          <div className={s.sideHead}>
            <h2 id="catalog-title" className={s.panelTitle}>Catalog</h2>
            <div className={s.segmented} role="group" aria-label="Show prices in">
              {(["USD", "JPY"] as const).map((c) => (
                <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <ul className={s.products}>
            {catalog.map((p) => (
              <li key={p.sku}>
                <button type="button" onClick={() => pick(p)}>
                  <span className={s.productName}>{p.name}</span>
                  <span className={s.price}>{money(p.price[currency], currency, true)}</span>
                  <span className={s.productDesc}>{p.description}</span>
                  <span className={s.stock}>{p.stock} left</span>
                </button>
              </li>
            ))}
          </ul>
          <p className={s.sideNote}>Prices exclude shipping from Seoul. Pick a product to ask about it.</p>
        </section>
        <div className={s.phoneOnly}>
          <ShopNotes rules={rules} idPrefix="sheet" />
        </div>
      </aside>

      <main className={s.chat}>
        <header className={s.chatHead}>
          <h1>{shop.name}</h1>
          <p>
            A fictional Korean stationery shop on the PayPal sandbox, shipping from Seoul by {shop.carrier}. {status}
          </p>
        </header>

        <div className={s.thread} ref={thread} aria-live="polite">
          <div className={s.shopLine}>
            <span className={s.who}>
              <Crescent size={14} />
              Night Desk
            </span>
            <div className={s.rich}>
              <p>Hello from Seoul. I look after {shop.name} while the owner sleeps.</p>
              <p>Ask in your own language: a price delivered to your door, what&apos;s in stock, or how long shipping takes. I&apos;ll quote in your currency and make a PayPal order when you&apos;re ready.</p>
            </div>
            {entries.length === 0 && (
              <div className={s.suggestions}>
                {SUGGESTIONS.map((t) => (
                  <button key={t.text} type="button" lang={t.lang} onClick={() => void ask(t.text)}>
                    {t.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {entries.map((e, i) =>
            e.kind === "buyer" ? (
              <div key={i} className={s.buyerLine} lang={isJapanese(e.text) ? "ja" : undefined}>
                {e.text}
              </div>
            ) : e.kind === "shop" ? (
              <div key={i} className={s.shopLine}>
                <span className={s.who}>
                  <Crescent size={14} />
                  Night Desk
                </span>
                <div className={s.rich} lang={isJapanese(e.text) ? "ja" : undefined}>
                  <Rich text={e.text} />
                </div>
              </div>
            ) : (
              <div key={i} className={s.event} data-tone={e.tone} role={e.tone === "error" ? "alert" : undefined}>
                {e.text}
                {e.retry && (
                  <button type="button" className={s.textButton} onClick={() => retry(e.retry!, i)}>
                    Retry
                  </button>
                )}
              </div>
            ),
          )}

          {busy && (
            <div className={s.shopLine} aria-label="Night Desk is replying">
              <span className={s.who}>
                <Crescent size={14} />
                Night Desk
              </span>
              <div className={s.typing}>
                Checking the shop<span className={s.dots} aria-hidden="true" />
              </div>
            </div>
          )}
        </div>

        {order && (
          <div className={s.orderBar}>
            <div>
              <span className={s.muted}>{order.captureId ? "Paid" : "Your order"}</span>
              <strong>{money(order.total, order.currency)}</strong>
            </div>
            <div className={s.orderBarActions}>
              <button type="button" className={s.ghost} aria-expanded={slipOpen} aria-controls="order-rail" onClick={() => setSlipOpen((o) => !o)}>
                {slipOpen ? "Close" : "Details"}
              </button>
              {!order.captureId && <PayButton order={order} />}
            </div>
          </div>
        )}

        <form
          className={s.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft.trim());
          }}
        >
          <label htmlFor="message" className={s.srOnly}>
            Message the shop
          </label>
          <textarea
            id="message"
            ref={composer}
            rows={1}
            value={draft}
            maxLength={2000}
            placeholder="Ask about a price or shipping"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a new line; Enter during Japanese IME conversion confirms the word.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(draft.trim());
              }
            }}
          />
          <button type="submit" className={s.send} disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
      </main>

      <aside id="order-rail" className={s.rail} data-open={slipOpen}>
        <button type="button" className={`${s.ghost} ${s.sheetClose}`} onClick={() => setSlipOpen(false)}>
          Back to the chat
        </button>
        <Slip order={order} busy={busy} onStep={(step) => void carrierStep(step)} />
        <section className={s.howto} aria-labelledby="howto-title">
          <h2 id="howto-title" className={s.panelTitle}>Paying in the sandbox</h2>
          <ol>
            <li>Ask for a price. The shopkeeper puts the order above.</li>
            <li>Pay on PayPal&apos;s sandbox page with a sandbox personal account. No real money moves.</li>
            <li>PayPal sends you back here. The shop captures the payment and writes it in the owner&apos;s ledger, with the fee and what the shop keeps.</li>
          </ol>
        </section>
        <ShopNotes rules={rules} idPrefix="rail" />
      </aside>
    </div>
  );
}
