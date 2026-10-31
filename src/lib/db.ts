import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// One SQLite file holds the shop's state: ledger, orders, conversations, house rules, adopted products.
// Each record is a JSON document; the modules keep a working copy in memory and write through on change.
// On Render's free plan the disk is reset on every deploy and restart, so the demo night is seeded again (seed.ts).

export type DocKind = "ledger" | "order" | "session" | "outbox" | "rules" | "product" | "report";

type Store = { db?: DatabaseSync };
const g = globalThis as unknown as { __nightDeskDb?: Store };
const store = (g.__nightDeskDb ??= {});

function db(): DatabaseSync {
  if (store.db) return store.db;
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  const conn = new DatabaseSync(path.join(dir, "night-desk.db"));
  // Several processes can open the file at once (next build collects page data in parallel workers): wait, don't fail.
  conn.exec(`PRAGMA busy_timeout = 10000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, at TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (kind, id));`);
  return (store.db = conn);
}

export function save(kind: DocKind, id: string, doc: unknown, at = new Date().toISOString()) {
  db().prepare("INSERT INTO docs (kind, id, at, json) VALUES (?, ?, ?, ?) ON CONFLICT (kind, id) DO UPDATE SET json = excluded.json").run(kind, id, at, JSON.stringify(doc));
}

export function load<T>(kind: DocKind): T[] {
  const rows = db().prepare("SELECT json FROM docs WHERE kind = ? ORDER BY at, rowid").all(kind) as { json: string }[];
  return rows.map((r) => JSON.parse(r.json) as T);
}

export function loadOne<T>(kind: DocKind, id: string): T | undefined {
  const row = db().prepare("SELECT json FROM docs WHERE kind = ? AND id = ?").get(kind, id) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as T) : undefined;
}

export const isEmpty = () => (db().prepare("SELECT COUNT(*) AS n FROM docs").get() as { n: number }).n === 0;
