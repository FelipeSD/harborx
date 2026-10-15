import crypto from "node:crypto";
import { db } from "../db/index.js";

export interface LogAuditOptions {
  action: string;
  userId?: string | null | undefined;
  target?: string | null | undefined;
  details?: unknown;
  ip?: string | null | undefined;
}

export function logAudit({
  action,
  userId = null,
  target = null,
  details,
  ip = null,
}: LogAuditOptions): void {
  try {
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    const detailsJson = details !== undefined ? JSON.stringify(details) : null;

    db.prepare(
      `
      INSERT INTO audit_log (id, ts, user_id, action, target, details_json, ip)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(id, ts, userId, action, target, detailsJson, ip);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

export interface AuditLogItem {
  id: string;
  ts: string;
  userId: string | null;
  username?: string | null;
  action: string;
  target: string | null;
  details: unknown;
  ip: string | null;
}

export function queryAuditLogs(limit = 100, offset = 0): { items: AuditLogItem[]; total: number } {
  const countRow = db.prepare("SELECT COUNT(*) as total FROM audit_log").get() as { total: number };
  const total = countRow?.total || 0;

  const rows = db
    .prepare(
      `
      SELECT a.id, a.ts, a.user_id, u.username, a.action, a.target, a.details_json, a.ip
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.ts DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(limit, offset) as Array<{
    id: string;
    ts: string;
    user_id: string | null;
    username: string | null;
    action: string;
    target: string | null;
    details_json: string | null;
    ip: string | null;
  }>;

  const items: AuditLogItem[] = rows.map((r) => {
    let details: unknown = null;
    if (r.details_json) {
      try {
        details = JSON.parse(r.details_json);
      } catch {
        details = r.details_json;
      }
    }
    return {
      id: r.id,
      ts: r.ts,
      userId: r.user_id,
      username: r.username,
      action: r.action,
      target: r.target,
      details,
      ip: r.ip,
    };
  });

  return { items, total };
}
