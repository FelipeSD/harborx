import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { runMigrations } from "./migrate.js";

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, "harborx.db");
export const db: Database.Database = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

runMigrations(db);

export function closeDb(): void {
  db.close();
}
