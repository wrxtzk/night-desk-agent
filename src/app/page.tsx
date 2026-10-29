"use client";
import { useEffect, useRef, useState } from "react";
import { shop } from "@/lib/shop";

type Line = { who: "buyer" | "shop"; text: string };

// M0 test page: talk to the shopkeeper and pay through the PayPal sandbox.
// The real buyer page and owner dashboard follow design.md (M1–M3).
export default function Home() {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const session = useRef("");

  useEffect(() => {
    session.current = sessionStorage.getItem("night-desk-session") ?? crypto.randomUUID();
    sessionStorage.setItem("night-desk-session", session.current);
    const q = new URLSearchParams(location.search);
    if (q.get("paid") === "1") setStatus(`Payment captured (${q.get("capture")}).`);
    if (q.get("paid") === "0") setStatus("Payment was not completed.");
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setLines((l) => [...l, { who: "buyer", text }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.current, message: text }) });
      const data = await res.json();
      setLines((l) => [...l, { who: "shop", text: data.text ?? data.error ?? "No reply." }]);
    } finally {
      setBusy(false);
    }
  }

  const linkify = (t: string) =>
    t.split(/(https:\/\/\S+)/g).map((part, i) => (part.startsWith("https://") ? <a key={i} href={part}>{part}</a> : part));

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, letterSpacing: -0.5 }}>{shop.name}</h1>
      <p style={{ color: "#5d5d62" }}>Minded overnight by Night Desk. A fictional demo shop on the PayPal sandbox: ask about {shop.sells} in any language. <a href="/api/ledger">Ledger (JSON)</a></p>
      {status && <p style={{ background: "#eef56a", padding: "8px 12px", borderRadius: 8 }}>{status}</p>}
      <div style={{ display: "grid", gap: 12, margin: "24px 0" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ justifySelf: l.who === "buyer" ? "end" : "start", maxWidth: "85%", whiteSpace: "pre-wrap", padding: "10px 14px", borderRadius: 10, background: l.who === "buyer" ? "#0e0e10" : "#f6f6f2", color: l.who === "buyer" ? "#fafaf7" : "#0e0e10", wordBreak: "break-word" }}>
            {linkify(l.text)}
          </div>
        ))}
        {busy && <div style={{ color: "#5d5d62" }}>The shopkeeper is typing…</div>}
      </div>
      <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message the shop" style={{ flex: 1, minHeight: 44, padding: "0 12px", border: "1px solid #e6e6e1", borderRadius: 8, fontSize: 16 }} />
        <button disabled={busy} style={{ minHeight: 44, padding: "0 16px", borderRadius: 8, border: 0, background: "#0e0e10", color: "#fafaf7", fontWeight: 600 }}>Send</button>
      </form>
    </main>
  );
}
