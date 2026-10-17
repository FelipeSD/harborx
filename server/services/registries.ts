import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../db/index.js";
import { config } from "../config.js";
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

export function syncDockerAuthConfig(): string {
  const dockerConfigDir = path.join(config.dataDir, ".docker");
  try {
    if (!fs.existsSync(dockerConfigDir)) {
      fs.mkdirSync(dockerConfigDir, { recursive: true });
    }

    const rows = db
      .prepare("SELECT url, username, encrypted_secret FROM registries")
      .all() as Array<{
      url: string;
      username: string;
      encrypted_secret: string;
    }>;

    const auths: Record<string, { auth: string }> = {};

    for (const r of rows) {
      try {
        const password = decryptCredential(r.encrypted_secret);
        const auth = Buffer.from(`${r.username}:${password}`).toString("base64");
        const clean = r.url.toLowerCase().trim();

        auths[clean] = { auth };
        auths[`https://${clean}`] = { auth };

        if (
          clean === "docker.io" ||
          clean === "registry-1.docker.io" ||
          clean.startsWith("index.docker.io")
        ) {
          auths["https://index.docker.io/v1/"] = { auth };
          auths["index.docker.io"] = { auth };
        }
      } catch {
        // Skip entry if decryption fails
      }
    }

    const configPath = path.join(dockerConfigDir, "config.json");
    let existingConfig: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch {
        existingConfig = {};
      }
    }

    const finalConfig = {
      ...existingConfig,
      auths,
    };

    fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2), "utf8");
  } catch (err) {
    console.error("Falha ao sincronizar config.json do Docker:", err);
  }

  return dockerConfigDir;
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

export function getRegistry(id: string): RegistryPublic | undefined {
  const row = db
    .prepare("SELECT id, name, url, username, created_at, updated_at FROM registries WHERE id = ?")
    .get(id) as
    | {
        id: string;
        name: string;
        url: string;
        username: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return undefined;

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getRegistrySecret(id: string): string | undefined {
  const row = db.prepare("SELECT encrypted_secret FROM registries WHERE id = ?").get(id) as
    { encrypted_secret: string } | undefined;
  if (!row) return undefined;
  try {
    return decryptCredential(row.encrypted_secret);
  } catch {
    return undefined;
  }
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

  syncDockerAuthConfig();

  return {
    id,
    name: name.trim(),
    url: cleanUrl,
    username: username.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateRegistry(
  id: string,
  data: {
    name?: string;
    url?: string;
    username?: string;
    secret?: string;
  },
): RegistryPublic {
  const row = db
    .prepare(
      "SELECT id, name, url, username, encrypted_secret, created_at, updated_at FROM registries WHERE id = ?",
    )
    .get(id) as
    | {
        id: string;
        name: string;
        url: string;
        username: string;
        encrypted_secret: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    throw new Error("Registro não encontrado");
  }

  const now = new Date().toISOString();
  const name = data.name !== undefined && data.name.trim().length > 0 ? data.name.trim() : row.name;

  let cleanUrl = row.url;
  if (data.url !== undefined && data.url.trim().length > 0) {
    cleanUrl = data.url
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .toLowerCase();
  }

  const username =
    data.username !== undefined && data.username.trim().length > 0
      ? data.username.trim()
      : row.username;

  let encryptedSecret = row.encrypted_secret;
  if (data.secret !== undefined && data.secret.trim().length > 0) {
    encryptedSecret = encryptCredential(data.secret.trim());
  }

  db.prepare(
    `UPDATE registries
     SET name = ?, url = ?, username = ?, encrypted_secret = ?, updated_at = ?
     WHERE id = ?`,
  ).run(name, cleanUrl, username, encryptedSecret, now, id);

  syncDockerAuthConfig();

  return {
    id,
    name,
    url: cleanUrl,
    username,
    createdAt: row.created_at,
    updatedAt: now,
  };
}

export function deleteRegistry(id: string): boolean {
  const info = db.prepare("DELETE FROM registries WHERE id = ?").run(id);
  if (info.changes > 0) {
    syncDockerAuthConfig();
    return true;
  }
  return false;
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
