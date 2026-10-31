"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardData, LedgerRow } from "@/lib/dashboard";
import type { HouseRules } from "@/lib/rules";
import s from "./dashboard.module.css";

const KEY_STORE = "night-desk-owner-key";

const seoul = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", ...opts }).format(new Date(iso));
const hhmm = (iso: string) => seoul(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = (iso: string) => seoul(iso, { month: "short", day: "numeric" });

function money(amount: number | undefined, currency = "USD") {
  if (amount === undefined) return "—";
  const sign = amount < 0 ? "−" : "";
  const v = Math.abs(amount);
  return currency === "JPY" ? `${sign}¥${Math.round(v).toLocaleString("en-US")}` : `${sign}$${v.toFixed(2)}`;
}

const usd = (n: number) => money(n, "USD");
const both = (by: Record<string, number>) => Object.entries(by).map(([c, v]) => money(v, c)).join(" + ") || "$0.00";
const city = (buyer?: string) => buyer?.split(",")[0] ?? "a buyer";

function greeting(now: Date) {
  const h = Number(seoul(now.toISOString(), { hour: "2-digit", hourCycle: "h23" }));
  return h >= 5 && h < 12 ? "Good morning." : h >= 12 && h < 18 ? "Good afternoon." : "Good evening.";
}

const gateLabel = { pass: "Passed", hold: "Needs you", block: "Blocked" } as const;

// A held request the owner already decided no longer needs them; it shows the decision instead.
const state = (r: LedgerRow) => (r.resolution ? "decided" : r.gate);

function Status({ row }: { row: LedgerRow }) {
  if (!row.gate) return null;
  if (row.resolution) {
    return (
      <span className={`${s.status} ${s.decided}`}>
        <i aria-hidden="true" />
        {row.resolution.decision === "approved" ? "You approved" : "You declined"}
      </span>
    );
  }
  return (
    <span className={`${s.status} ${s[row.gate]}`}>
      <i aria-hidden="true" />
      {gateLabel[row.gate]}
    </span>
  );
}

type SortKey = "at" | "currency" | "amount" | "net";
type Filter = "all" | "pass" | "hold" | "block";

export function Dashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "at", dir: -1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [ownerKey, setOwnerKey] = useState("");
  const [needKey, setNeedKey] = useState(false);

  useEffect(() => {
    try {
      setOwnerKey(sessionStorage.getItem(KEY_STORE) ?? "");
    } catch {}
    const clock = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(clock);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/owner", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  // The shopkeeper keeps working while the owner looks: pick up new rows every 15 seconds while the tab is open.
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const ownerFetch = useCallback(
    async (url: string, method: string, body: unknown) => {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", "x-owner-key": ownerKey }, body: JSON.stringify(body) });
      if (res.status === 401) setNeedKey(true);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      return json;
    },
    [ownerKey],
  );

  const saveKey = (k: string) => {
    setOwnerKey(k);
    try {
      sessionStorage.setItem(KEY_STORE, k);
    } catch {}
  };

  const { report, reconciliation: recon, suggestion, rules } = data;
  const counts = useMemo(() => {
    const c = { all: data.ledger.length, pass: 0, hold: 0, block: 0 };
    for (const r of data.ledger) {
      const st = state(r);
      if (st && st !== "decided") c[st]++;
    }
    return c;
  }, [data.ledger]);

  const rows = useMemo(() => {
    const list = filter === "all" ? data.ledger : data.ledger.filter((r) => state(r) === filter);
    const value = (r: LedgerRow) => (sort.key === "at" ? r.at : sort.key === "currency" ? r.currency ?? "" : sort.key === "amount" ? r.amount ?? 0 : r.netUsd ?? -1e9);
    return [...list].sort((a, b) => (value(a) > value(b) ? 1 : value(a) < value(b) ? -1 : 0) * sort.dir);
  }, [data.ledger, filter, sort]);

  const sortBy = (key: SortKey) => setSort((cur) => ({ key, dir: cur.key === key ? (-cur.dir as 1 | -1) : key === "at" ? -1 : 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : "");
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === -1 ? "descending" : "ascending") : "none");

  const refundShare = Math.min(100, (report.autoRefundedUsd / Math.max(report.dailyRefundUsd, 1)) * 100);
  const activity = [
    ["quotes sent", report.activity.quotes],
    ["buyers from", report.activity.countries.join(", ")],
    ["orders paid", report.activity.paid],
    ["PayPal captures", report.activity.paid],
    ["tracking numbers attached", report.activity.tracking],
    ["partial refunds", report.activity.refunds],
    ["rule checks", report.activity.ruleChecks],
    ["blocked", report.activity.blocked],
    ["held for you", report.activity.held],
  ].filter(([, v]) => v !== 0 && v !== "");

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header className={s.header}>
          <div className={s.brand}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M16 3a9 9 0 1 0 5 13.5A7.2 7.2 0 0 1 16 3Z" fill="currentColor" />
            </svg>
            Night Desk
          </div>
          <nav className={s.nav} aria-label="Dashboard">
            <a href="#ledger" aria-current="page">Ledger</a>
            <a href="#approvals">
              Approvals{data.holds.length > 0 && <span className={s.count}>{data.holds.length}</span>}
            </a>
            <a href="#rules">Rules</a>
            <Link href="/">Shop chat</Link>
          </nav>
          <div className={s.right}>
            <span className={s.sandbox}>Sandbox</span>
            <span className={s.clock} suppressHydrationWarning>
              Seoul, {seoul(now.toISOString(), { weekday: "short" })} {hhmm(now.toISOString())}
            </span>
            <span className={s.paypal}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/paypal-mark.svg" alt="" height={14} width={12} />
              PayPal connected
            </span>
          </div>
        </header>

        <section className={s.hero} aria-labelledby="headline">
          <div>
            <h1 id="headline" suppressHydrationWarning>
              {greeting(now)} While you slept, your shop made <mark>{usd(report.keptUsd)}</mark>.
            </h1>
            <p>
              {day(report.window.start)}, 18:00 to {day(report.window.end)}, 18:00 KST, net after PayPal fees, currency conversion and refunds
            </p>
          </div>
          <div className={s.kpis}>
            <div>
              Sales<b>{report.sales.count}</b>
              <small>{Object.entries(report.sales.byCurrency).map(([c, n]) => `${c} ${n}`).join(", ") || "none yet"}</small>
            </div>
            <div>
              Refunded<b>{usd(-report.refunds.usd)}</b>
              <small>{usd(report.autoRefundedUsd)} of ${report.dailyRefundUsd} daily limit</small>
            </div>
            <div>
              Blocked<b>{report.blocked}</b>
              <small>broke a house rule</small>
            </div>
            <div>
              Needs you<b>{report.needsYou}</b>
              <small>held for your OK</small>
            </div>
          </div>
        </section>

        <div className={s.main}>
          <section className={s.panel} id="ledger" aria-labelledby="ledger-title">
            <div className={s.panelHead}>
              <h2 id="ledger-title">Ledger</h2>
              <small>Every money movement the agent made, with its reason</small>
              <div className={s.tools} role="group" aria-label="Filter by rule gate">
                {(["all", "pass", "hold", "block"] as const).map((f) => (
                  <button key={f} type="button" className={s.chip} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {f === "all" ? `All ${counts.all}` : `${gateLabel[f]} ${counts[f]}`}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.scroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th aria-sort={ariaSort("at")}>
                      <button type="button" className={s.sort} onClick={() => sortBy("at")}>Time (KST){arrow("at")}</button>
                    </th>
                    <th><span>Entry</span></th>
                    <th aria-sort={ariaSort("currency")}>
                      <button type="button" className={s.sort} onClick={() => sortBy("currency")}>Currency{arrow("currency")}</button>
                    </th>
                    <th className={s.num} aria-sort={ariaSort("amount")}>
                      <button type="button" className={s.sort} onClick={() => sortBy("amount")}>Amount{arrow("amount")}</button>
                    </th>
                    <th className={s.num}><span>PayPal fee</span></th>
                    <th className={s.num} aria-sort={ariaSort("net")}>
                      <button type="button" className={s.sort} onClick={() => sortBy("net")}>Net (USD){arrow("net")}</button>
                    </th>
                    <th><span>Agent&apos;s reason</span></th>
                    <th><span>Rule gate</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const moved = r.kind === "sale" || r.kind === "refund";
                    const net = moved ? r.netUsd : undefined;
                    return (
                      <tr key={r.id} aria-selected={selected === r.id} onClick={() => setSelected(selected === r.id ? null : r.id)}>
                        <td className={s.time}>
                          {hhmm(r.at)}
                          <small>{day(r.at)}</small>
                        </td>
                        <td>
                          <div className={s.what}>{r.title}</div>
                          <div className={s.who}>{r.buyer}</div>
                        </td>
                        <td>{r.currency && <span className={s.currency}>{r.currency}</span>}</td>
                        <td className={`${s.num} ${(r.amount ?? 0) < 0 ? s.negative : ""}`}>{r.amount === undefined ? "—" : money(r.amount, r.currency)}</td>
                        <td className={s.num}>{r.fee ? money(r.fee, r.currency) : "—"}</td>
                        <td className={`${s.num} ${(net ?? 0) < 0 ? s.negative : ""}`}>{net === undefined ? "—" : usd(net)}</td>
                        <td>
                          <div className={s.reason}>{r.reason}</div>
                          {(r.gate !== "pass" || selected === r.id) && r.gateNote && <div className={`${s.reason} ${s.gateNote}`}>Gate: {r.gateNote}</div>}
                          {selected === r.id && r.paypalId && <div className={s.who}>PayPal {r.paypalId}</div>}
                        </td>
                        <td>
                          <Status row={r} />
                          {r.resolution && <span className={s.resolved}>{hhmm(r.resolution.at)}, {day(r.resolution.at)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && <p className={s.empty}>Nothing here yet.</p>}
            </div>
          </section>

          <aside className={s.side}>
            <Approvals holds={data.holds} ownerFetch={ownerFetch} onDone={refresh} needKey={needKey || data.ownerKeyRequired} ownerKey={ownerKey} setOwnerKey={saveKey} />

            <section className={`${s.panel} ${s.box}`} aria-labelledby="report-title">
              <h2 id="report-title" className={s.boxTitle}>Morning report</h2>
              <ul className={s.list}>
                <li><span>Gross</span><span>{both(report.sales.gross)}</span></li>
                <li><span>PayPal fees</span><span>{both(report.sales.fees)}</span></li>
                <li><span>Net after FX</span><span>{usd(report.netUsd)}</span></li>
                <li><span>Refunds</span><span className={report.refunds.usd < 0 ? s.negative : ""}>{usd(report.refunds.usd)}</span></li>
                <li><span>Kept</span><span>{usd(report.keptUsd)}</span></li>
              </ul>
              <Reconciled recon={recon} />
              {suggestion && <SuggestionBox suggestion={suggestion} ownerFetch={ownerFetch} onDone={refresh} />}
            </section>

            <RulesBox rules={rules} bounds={data.bounds} refundShare={refundShare} autoRefundedUsd={report.autoRefundedUsd} ownerFetch={ownerFetch} onDone={refresh} />
          </aside>
        </div>

        <p className={s.foot}>
          Sandbox demo. Carrier events are simulated; every money movement runs through PayPal.
          {data.seeded && <> {data.seeded}</>}
        </p>
      </div>

      <div className={s.tick} aria-label="What the agent did in this report's day">
        <div className={s.tickLabel}>AGENT LAST NIGHT</div>
        <div className={s.run}>
          {[...activity, ...activity].map(([label, value], i) => (
            <span key={i} aria-hidden={i >= activity.length}>
              {label} <b>{value}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type OwnerFetch = (url: string, method: string, body: unknown) => Promise<unknown>;

function Approvals(props: { holds: LedgerRow[]; ownerFetch: OwnerFetch; onDone: () => Promise<void>; needKey: boolean; ownerKey: string; setOwnerKey: (k: string) => void }) {
  const { holds, ownerFetch, onDone } = props;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hold = holds[0];

  if (!hold) {
    return (
      <section className={`${s.panel} ${s.box}`} id="approvals" aria-labelledby="approvals-title">
        <h2 id="approvals-title" className={s.boxTitle}>Approvals</h2>
        <p className={s.muted} style={{ marginTop: 6 }}>{done ?? "Nothing is waiting for you."}</p>
      </section>
    );
  }

  const act = async (decision: "approved" | "declined") => {
    setBusy(true);
    setError(null);
    try {
      await ownerFetch("/api/owner/decide", "POST", { id: hold.id, decision });
      setDone(decision === "approved" ? "Approved. PayPal sent the refund; I'm writing to the buyer in their language." : "Declined. I'll offer the buyer a replacement instead.");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const approx = hold.currency === "JPY" && hold.netUsd ? ` (≈ ${money(-hold.netUsd)})` : "";
  return (
    <section className={s.need} id="approvals" aria-labelledby="need-title">
      <div className={s.needLabel}>
        Needs your OK, {hhmm(hold.at)}
        {holds.length > 1 && `, ${holds.length - 1} more after this`}
      </div>
      <h3 id="need-title">
        Refund {money(hold.amount, hold.currency)}
        {approx} to a buyer in {city(hold.buyer)}?
      </h3>
      <p>{hold.reason}</p>
      {hold.gateNote && <p className={s.gateLine}>{hold.gateNote}</p>}
      {props.needKey && (
        <label className={s.keyField}>
          Owner key (in the Devpost testing notes)
          <input type="password" value={props.ownerKey} onChange={(e) => props.setOwnerKey(e.target.value)} autoComplete="off" />
        </label>
      )}
      <div className={s.row}>
        <button type="button" className={`${s.button} ${s.moonButton}`} disabled={busy} onClick={() => act("approved")}>
          Approve refund
        </button>
        <button type="button" className={`${s.button} ${s.outlineDark}`} disabled={busy} onClick={() => act("declined")}>
          Decline
        </button>
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
      {done && <p className={s.done} role="status">{done}</p>}
    </section>
  );
}

function Reconciled({ recon }: { recon: DashboardData["reconciliation"] }) {
  const problems = recon.missingInLedger.length + recon.missingInPayPal.length + recon.mismatched.length;
  if (recon.pending) return <p className={s.recon}>PayPal&apos;s transaction records don&apos;t reach this day yet (they refresh every few hours). I&apos;ll check the figures against them once they do.</p>;
  if (recon.error) return <p className={s.recon}>Couldn&apos;t reach PayPal&apos;s transaction records just now; the figures above are from the ledger.</p>;
  const through = recon.through ? `${day(recon.through)}, ${hhmm(recon.through)} KST` : "";
  if (problems === 0) {
    return (
      <p className={s.recon}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--pass)" strokeWidth="2.2" aria-hidden="true">
          <path d="M4 12l5 5L20 6" />
        </svg>
        <span>
          Matches PayPal&apos;s records: {recon.checked} of {recon.checked} payments and refunds, through {through}.
        </span>
      </p>
    );
  }
  return (
    <p className={s.recon} style={{ color: "var(--block)" }}>
      Doesn&apos;t match PayPal through {through}:{" "}
      {[
        recon.missingInLedger.length && `${recon.missingInLedger.length} in PayPal but not in the ledger (${recon.missingInLedger.join(", ")})`,
        recon.missingInPayPal.length && `${recon.missingInPayPal.length} in the ledger but not in PayPal`,
        recon.mismatched.length && `${recon.mismatched.length} with a different amount`,
      ]
        .filter(Boolean)
        .join("; ")}
      .
    </p>
  );
}

function SuggestionBox({ suggestion, ownerFetch, onDone }: { suggestion: NonNullable<DashboardData["suggestion"]>; ownerFetch: OwnerFetch; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = suggestion.product;
  const jp = /Japanese/.test(suggestion.evidence);
  const act = async (action: "adopt" | "dismiss") => {
    setBusy(true);
    setError(null);
    try {
      await ownerFetch("/api/owner/suggestion", "POST", { window: suggestion.window, action });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={s.suggestion}>
      <p>
        {suggestion.evidence} Add a <b>{jp ? money(p.price.JPY, "JPY") : money(p.price.USD)} {p.name}</b>?
      </p>
      <p className={s.muted}>
        {p.description} {jp ? `${money(p.price.USD)} for USD buyers.` : `${money(p.price.JPY, "JPY")} for Japan.`}
      </p>
      {suggestion.status === "open" ? (
        <div className={s.row}>
          <button type="button" className={`${s.button} ${s.inkButton}`} disabled={busy} onClick={() => act("adopt")}>
            Adopt
          </button>
          <button type="button" className={`${s.button} ${s.lineButton}`} disabled={busy} onClick={() => act("dismiss")}>
            Dismiss
          </button>
        </div>
      ) : (
        <p style={{ marginTop: 10, fontWeight: 600 }} role="status">
          {suggestion.status === "adopted" ? "Listed. I'll offer it to buyers from the next message on." : "Dismissed."}
        </p>
      )}
      {error && <p className={s.errorLight} role="alert">{error}</p>}
    </div>
  );
}

const ruleFields: { key: keyof HouseRules; label: string; unit: string }[] = [
  { key: "maxDiscountPct", label: "Max discount", unit: "%" },
  { key: "autoRefundUsd", label: "Auto-refund up to, per order", unit: "$" },
  { key: "dailyRefundUsd", label: "Daily auto refunds", unit: "$" },
  { key: "lateAfterDays", label: "Late after, without a scan", unit: "days" },
];

function RulesBox(props: { rules: HouseRules; bounds: Record<keyof HouseRules, [number, number]>; refundShare: number; autoRefundedUsd: number; ownerFetch: OwnerFetch; onDone: () => Promise<void> }) {
  const { rules, bounds } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(Object.fromEntries(ruleFields.map((f) => [f.key, String(rules[f.key])])));
    setError(null);
    setEditing(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await props.ownerFetch("/api/owner/rules", "PUT", Object.fromEntries(ruleFields.map((f) => [f.key, Number(draft[f.key])])));
      await props.onDone();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`${s.panel} ${s.box}`} id="rules" aria-labelledby="rules-title">
      <div className={s.boxHead}>
        <h2 id="rules-title" className={s.boxTitle}>House rules</h2>
        {!editing && (
          <button type="button" className={s.textButton} onClick={start}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <form className={s.ruleForm} onSubmit={save}>
          {ruleFields.map((f) => (
            <label key={f.key}>
              <span>
                {f.label} ({f.unit})
                <br />
                <small>
                  {bounds[f.key][0]} to {bounds[f.key][1]}
                </small>
              </span>
              <input type="number" inputMode="decimal" min={bounds[f.key][0]} max={bounds[f.key][1]} step="any" value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} required />
            </label>
          ))}
          <p className={s.muted} style={{ fontSize: 13 }}>The shopkeeper and the rule gate use the new values from the next message on.</p>
          <div className={s.row} style={{ marginTop: 0 }}>
            <button type="submit" className={`${s.button} ${s.inkButton}`} disabled={busy}>
              Save rules
            </button>
            <button type="button" className={`${s.button} ${s.lineButton}`} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {error && <p className={s.errorLight} role="alert">{error}</p>}
        </form>
      ) : (
        <>
          <ul className={s.list}>
            <li><span>Max discount</span><b>{rules.maxDiscountPct}%</b></li>
            <li><span>Auto-refund up to, per order</span><b>${rules.autoRefundUsd}</b></li>
            <li><span>Late after, without a scan</span><b>{rules.lateAfterDays} days</b></li>
            <li><span>Daily auto refunds</span><b>{money(props.autoRefundedUsd)} / ${rules.dailyRefundUsd}</b></li>
          </ul>
          <div className={s.bar} role="img" aria-label={`${Math.round(props.refundShare)}% of the daily refund limit used`}>
            <i style={{ width: `${props.refundShare}%` }} />
          </div>
        </>
      )}
    </section>
  );
}
