import crypto from "node:crypto";
import { db } from "../db/index.js";

export interface LogAuditOptions {
  action: string;
  userId?: string | null;
  target?: string | null;
  details?: unknown;
  ip?: string | null;
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
