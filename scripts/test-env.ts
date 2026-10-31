// Imported first by the check scripts: a throwaway database, no demo night.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "night-desk-check-"));
process.env.NIGHT_DESK_SEED = "0";
