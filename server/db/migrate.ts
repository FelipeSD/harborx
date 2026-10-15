import type Database from "better-sqlite3";

interface Migration {
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    name: "001_initial_schema",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
          created_at TEXT NOT NULL,
          disabled INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT UNIQUE NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          ip TEXT,
          user_agent TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          ts TEXT NOT NULL,
          user_id TEXT,
          action TEXT NOT NULL,
          target TEXT,
          details_json TEXT,
          ip TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts);
      `);
    },
  },
  {
    name: "002_host_metrics",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS host_metrics (
          ts TEXT PRIMARY KEY,
          cpu_percent REAL NOT NULL,
          mem_used_bytes REAL NOT NULL,
          mem_total_bytes REAL NOT NULL,
          disk_used_bytes REAL NOT NULL,
          disk_total_bytes REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_host_metrics_ts ON host_metrics(ts);
      `);
    },
  },
  {
    name: "003_registries",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS registries (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT UNIQUE NOT NULL,
          username TEXT NOT NULL,
          encrypted_secret TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_registries_url ON registries(url);
      `);
    },
  },
  {
    name: "004_stacks_and_webhooks",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS stacks (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('compose', 'git')),
          status TEXT NOT NULL CHECK (status IN ('deployed', 'stopped', 'failed', 'deploying')),
          compose_yaml TEXT NOT NULL,
          env_json TEXT,
          git_repo TEXT,
          git_branch TEXT,
          git_path TEXT,
          webhook_token TEXT UNIQUE,
          auto_deploy INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_stacks_name ON stacks(name);
        CREATE INDEX IF NOT EXISTS idx_stacks_webhook_token ON stacks(webhook_token);

        CREATE TABLE IF NOT EXISTS stack_deployments (
          id TEXT PRIMARY KEY,
          stack_id TEXT NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
          triggered_by TEXT NOT NULL,
          status TEXT NOT NULL,
          output_log TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_stack_deployments_stack_id ON stack_deployments(stack_id);
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare("SELECT name FROM schema_migrations").all() as Array<{
    name: string;
  }>;
  const applied = new Set(appliedRows.map((r) => r.name));

  for (const m of migrations) {
    if (!applied.has(m.name)) {
      const runInTx = db.transaction(() => {
        m.up(db);
        db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
          m.name,
          new Date().toISOString(),
        );
      });
      runInTx();
    }
  }
}
