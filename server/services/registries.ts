import crypto from "node:crypto";
import { db } from "../db/index.js";
import { decryptCredential, encryptCredential } from "../auth/crypto.js";

export interface RegistryPublic {
  id: string;
  name: string;
  url: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryAuth {
  username: string;
  password?: string;
  serveraddress?: string;
}

export function listRegistries(): RegistryPublic[] {
  const rows = db
    .prepare(
      "SELECT id, name, url, username, created_at, updated_at FROM registries ORDER BY name ASC",
    )
    .all() as Array<{
    id: string;
    name: string;
    url: string;
    username: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    username: r.username,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function createRegistry(
  name: string,
  url: string,
  username: string,
  secret: string,
): RegistryPublic {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // Normalize url
  const cleanUrl = url
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
  const encrypted = encryptCredential(secret);

  db.prepare(
    `INSERT INTO registries (id, name, url, username, encrypted_secret, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name.trim(), cleanUrl, username.trim(), encrypted, now, now);

  return {
    id,
    name: name.trim(),
    url: cleanUrl,
    username: username.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function deleteRegistry(id: string): boolean {
  const info = db.prepare("DELETE FROM registries WHERE id = ?").run(id);
  return info.changes > 0;
}

export function getRegistryAuthForImage(imageRef: string): RegistryAuth | undefined {
  // Determine domain
  let domain = "";
  const parts = imageRef.split("/");
  if (
    parts.length > 1 &&
    (parts[0]?.includes(".") || parts[0]?.includes(":") || parts[0] === "localhost")
  ) {
    domain = parts[0]?.toLowerCase() || "";
  } else {
    // Docker Hub default
    domain = "docker.io";
  }

  const row = db
    .prepare("SELECT username, encrypted_secret, url FROM registries WHERE url = ? OR url = ?")
    .get(domain, `https://${domain}`) as
    { username: string; encrypted_secret: string; url: string } | undefined;

  if (!row) return undefined;

  try {
    const password = decryptCredential(row.encrypted_secret);
    return {
      username: row.username,
      password,
      serveraddress: row.url,
    };
  } catch {
    return undefined;
  }
}
