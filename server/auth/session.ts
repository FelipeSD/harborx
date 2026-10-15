import crypto from "node:crypto";
import type { User, UserRole } from "../../shared/types.js";
import { db } from "../db/index.js";
import { generateToken, hashToken } from "./password.js";

const SESSION_TTL_HOURS = 12;

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  disabled: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  ip: string | null;
  user_agent: string | null;
  username: string;
  role: UserRole;
  disabled: number;
}

function calculateExpiry(): string {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + SESSION_TTL_HOURS);
  return expiry.toISOString();
}

export function countUsers(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row ? row.count : 0;
}

export function getUserByUsername(username: string): (User & { passwordHash: string }) | null {
  const row = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username) as
    UserRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    disabled: row.disabled === 1,
    passwordHash: row.password_hash,
  };
}

export function getUserById(id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    disabled: row.disabled === 1,
  };
}

export function createUser(username: string, passwordHash: string, role: UserRole): User {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO users (id, username, password_hash, role, created_at, disabled)
    VALUES (?, ?, ?, ?, ?, 0)
  `,
  ).run(id, username.trim(), passwordHash, role, createdAt);

  return {
    id,
    username: username.trim(),
    role,
    createdAt,
    disabled: false,
  };
}

export function createSession(userId: string, ip?: string, userAgent?: string): string {
  const rawToken = generateToken(32);
  const tokenHash = hashToken(rawToken);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = calculateExpiry();

  db.prepare(
    `
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(id, userId, tokenHash, expiresAt, createdAt, ip ?? null, userAgent ?? null);

  return rawToken;
}

export function validateSession(
  rawToken: string,
): { user: User; session: { id: string; expiresAt: string } } | null {
  if (!rawToken || typeof rawToken !== "string") return null;

  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();

  const row = db
    .prepare(
      `
    SELECT s.id, s.user_id, s.token_hash, s.expires_at, s.created_at, s.ip, s.user_agent,
           u.username, u.role, u.created_at as user_created_at, u.disabled
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `,
    )
    .get(tokenHash) as (SessionRow & { user_created_at: string }) | undefined;

  if (!row) return null;

  // Check if user is disabled
  if (row.disabled === 1) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
    return null;
  }

  // Check if session has expired
  if (row.expires_at < now) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
    return null;
  }

  // Slide expiration forward (sliding session)
  const newExpiry = calculateExpiry();
  db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(newExpiry, row.id);

  return {
    user: {
      id: row.user_id,
      username: row.username,
      role: row.role,
      createdAt: row.user_created_at,
      disabled: false,
    },
    session: {
      id: row.id,
      expiresAt: newExpiry,
    },
  };
}

export function deleteSession(rawToken: string): void {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}
