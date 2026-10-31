import { timingSafeEqual } from "node:crypto";

// Owner actions (approving refunds, changing rules, adopting a suggestion) need OWNER_KEY when it is set.
// Reading the dashboard does not: everything on it is sandbox demo data.
export const ownerKeyRequired = () => Boolean(process.env.OWNER_KEY);

export function ownerAllowed(req: Request): boolean {
  const key = process.env.OWNER_KEY;
  if (!key) return true;
  const given = Buffer.from(req.headers.get("x-owner-key") ?? "");
  const want = Buffer.from(key);
  return given.length === want.length && timingSafeEqual(given, want);
}
