import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { decryptCredential, encryptCredential } from "../auth/crypto.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { docker } from "../docker.js";

const execFileAsync = promisify(execFile);

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

export function findGitAuthForRepo(
  repoUrl: string,
  preferredRegistryId?: string | null,
): { username: string; secret: string; registryName: string } | undefined {
  try {
    if (preferredRegistryId && preferredRegistryId !== "none" && preferredRegistryId !== "auto") {
      const reg = getRegistry(preferredRegistryId);
      const secret = getRegistrySecret(preferredRegistryId);
      if (reg && secret) {
        const cleanUser = reg.username.replace(/^@+/, "").trim();
        return { username: cleanUser, secret, registryName: reg.name };
      }
    }

    if (preferredRegistryId === "none") {
      return undefined;
    }

    // Auto-detect based on repo URL (support both https:// and git@ URLs)
    let cleanRepo = repoUrl.toLowerCase().trim();
    if (cleanRepo.startsWith("git@")) {
      cleanRepo = cleanRepo.replace(/^git@([^:]+):/, "https://$1/");
    }

    const rows = db
      .prepare("SELECT id, name, url, username, encrypted_secret FROM registries")
      .all() as Array<{
      id: string;
      name: string;
      url: string;
      username: string;
      encrypted_secret: string;
    }>;

    for (const r of rows) {
      const regUrl = r.url.toLowerCase();
      const isGitHubRepo = cleanRepo.includes("github.com");
      const isGitHubReg = regUrl.includes("github.com") || regUrl.includes("ghcr.io");

      const isGitLabRepo = cleanRepo.includes("gitlab.com");
      const isGitLabReg = regUrl.includes("gitlab.com");

      let matchesCustom = false;
      try {
        const repoHost = new URL(cleanRepo.startsWith("http") ? cleanRepo : `https://${cleanRepo}`)
          .hostname;
        matchesCustom = repoHost === regUrl || regUrl.includes(repoHost);
      } catch {
        // ignore
      }

      if ((isGitHubRepo && isGitHubReg) || (isGitLabRepo && isGitLabReg) || matchesCustom) {
        const secret = decryptCredential(r.encrypted_secret);
        const cleanUser = r.username.replace(/^@+/, "").trim();
        return { username: cleanUser, secret, registryName: r.name };
      }
    }
  } catch (err) {
    console.error("Erro ao resolver credencial Git:", err);
  }
  return undefined;
}

export function normalizeRegistryServerAddress(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const lower = trimmed.toLowerCase();
  const clean = lower.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (
    clean === "docker.io" ||
    clean === "registry-1.docker.io" ||
    clean.startsWith("index.docker.io")
  ) {
    return "https://index.docker.io/v1/";
  }
  if (trimmed.startsWith("http://")) {
    return `http://${clean}`;
  }
  return `https://${clean}`;
}

export interface VerifyCredentialsResult {
  success: boolean;
  status?: string;
  error?: string;
  warning?: string;
  scopes?: string[];
  permissions?: {
    canCloneRepos: boolean;
    canPullImages: boolean;
    provider?: string;
    account?: string;
  };
}

export async function verifyRegistryCredentials(data: {
  url: string;
  username: string;
  secret: string;
  repoUrl?: string;
}): Promise<VerifyCredentialsResult> {
  const cleanUrl = data.url.toLowerCase().trim();
  const username = data.username.trim();
  const secret = data.secret.trim();

  // 1. If explicit repoUrl is provided or url is a git repo URL
  if (
    data.repoUrl ||
    cleanUrl.endsWith(".git") ||
    (cleanUrl.startsWith("http") && cleanUrl.includes(".git"))
  ) {
    const targetRepo = (data.repoUrl || cleanUrl).trim();
    try {
      const basicToken = Buffer.from(`${username}:${secret}`).toString("base64");
      await execFileAsync(
        "git",
        [
          "-c",
          `http.extraheader=AUTHORIZATION: basic ${basicToken}`,
          "ls-remote",
          "--heads",
          targetRepo,
        ],
        { timeout: 15000 },
      );
      return {
        success: true,
        status:
          "Conexão com repositório Git confirmada! Permissões de clone e leitura validadas com sucesso.",
        permissions: {
          canCloneRepos: true,
          canPullImages: true,
          provider: "git",
        },
      };
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : String(err);
      if (secret) {
        msg = msg.replaceAll(secret, "******");
      }
      return {
        success: false,
        error: `Falha ao acessar o repositório Git: verifique se o repositório existe e se o token possui permissão de leitura/clone (${msg}).`,
        permissions: {
          canCloneRepos: false,
          canPullImages: false,
          provider: "git",
        },
      };
    }
  }

  // 2. Check if GitHub (ghcr.io, github.com, api.github.com)
  if (
    cleanUrl.includes("github.com") ||
    cleanUrl.includes("ghcr.io") ||
    cleanUrl.includes("api.github.com")
  ) {
    try {
      const ghRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${secret}`,
          "User-Agent": "HarborX-Platform",
          Accept: "application/vnd.github+json",
        },
      });

      if (ghRes.status === 401) {
        return {
          success: false,
          error:
            "Credenciais inválidas: o token do GitHub informado é inválido, expirou ou não possui acesso à API.",
          permissions: {
            canCloneRepos: false,
            canPullImages: false,
            provider: "github",
          },
        };
      }

      if (!ghRes.ok) {
        const errText = await ghRes.text();
        return {
          success: false,
          error: `Erro ao validar token na API do GitHub (${ghRes.status}): ${errText}`,
          permissions: {
            canCloneRepos: false,
            canPullImages: false,
            provider: "github",
          },
        };
      }

      const userData = (await ghRes.json()) as { login?: string };
      const accountName = userData.login || username;

      const rawScopes = ghRes.headers.get("x-oauth-scopes");
      if (rawScopes !== null && rawScopes !== undefined) {
        // Classic Personal Access Token
        const scopes = rawScopes
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

        const hasRepo = scopes.includes("repo");
        const hasPublicRepo = scopes.includes("public_repo");
        const hasPackages =
          scopes.includes("read:packages") || scopes.includes("write:packages") || hasRepo;

        if (!hasRepo && !hasPublicRepo) {
          // Token is authenticated, but lacks the repository permissions HarborX needs!
          return {
            success: false,
            error: `Token conectado ao GitHub como @${accountName}, mas NÃO possui as permissões necessárias para o HarborX criar Stacks! Falta o escopo 'repo' para clonar repositórios de código. Escopos atualmente concedidos: [${scopes.join(", ") || "nenhum"}]. Gere um novo token no GitHub com o escopo 'repo'.`,
            scopes,
            permissions: {
              canCloneRepos: false,
              canPullImages: hasPackages,
              provider: "github",
              account: accountName,
            },
          };
        }

        if (hasPublicRepo && !hasRepo) {
          return {
            success: true,
            status: `Token conectado para @${accountName} com permissões para repositórios públicos.`,
            warning:
              "Atenção: O token possui apenas o escopo 'public_repo'. Repositórios privados do GitHub falharão no clone para Stacks. Para suporte a repositórios privados, marque o escopo 'repo'.",
            scopes,
            permissions: {
              canCloneRepos: true,
              canPullImages: hasPackages,
              provider: "github",
              account: accountName,
            },
          };
        }

        return {
          success: true,
          status: `Token do GitHub validado com sucesso para @${accountName}! Possui permissão completa de repositório ('repo') para criação de Stacks e acesso a imagens no GHCR.`,
          scopes,
          permissions: {
            canCloneRepos: true,
            canPullImages: true,
            provider: "github",
            account: accountName,
          },
        };
      } else {
        // Fine-grained personal access token (github_pat_...)
        try {
          const reposRes = await fetch("https://api.github.com/user/repos?per_page=1", {
            headers: {
              Authorization: `Bearer ${secret}`,
              "User-Agent": "HarborX-Platform",
              Accept: "application/vnd.github+json",
            },
          });

          if (reposRes.ok) {
            return {
              success: true,
              status: `Token Fine-Grained do GitHub validado com sucesso para @${accountName}!`,
              warning:
                "Importante: No GitHub, confirme que este token possui permissão no repositório específico da Stack ('Repository access: All repositories' ou o repositório selecionado) com permissão 'Contents: Read-only'.",
              permissions: {
                canCloneRepos: true,
                canPullImages: true,
                provider: "github",
                account: accountName,
              },
            };
          } else {
            return {
              success: false,
              error: `Token Fine-Grained conectado para @${accountName}, mas NÃO possui permissão em repositórios! No GitHub, configure as permissões do token em 'Repository access' e 'Repository permissions -> Contents: Read-only' para que o HarborX consiga criar a Stack.`,
              permissions: {
                canCloneRepos: false,
                canPullImages: false,
                provider: "github",
                account: accountName,
              },
            };
          }
        } catch {
          return {
            success: true,
            status: `Token do GitHub validado com sucesso para @${accountName}.`,
            permissions: {
              canCloneRepos: true,
              canPullImages: true,
              provider: "github",
              account: accountName,
            },
          };
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Falha ao comunicar com a API do GitHub: ${msg}`,
      };
    }
  }

  // 3. Check if GitLab
  if (cleanUrl.includes("gitlab.com")) {
    try {
      const glRes = await fetch("https://gitlab.com/api/v4/personal_access_tokens/self", {
        headers: {
          "PRIVATE-TOKEN": secret,
        },
      });

      if (glRes.status === 401) {
        return {
          success: false,
          error: "Credenciais inválidas: o token do GitLab informado é inválido ou expirou.",
        };
      }

      if (glRes.ok) {
        const glData = (await glRes.json()) as { scopes?: string[]; name?: string };
        const scopes = glData.scopes || [];
        const hasRepo =
          scopes.includes("read_repository") ||
          scopes.includes("write_repository") ||
          scopes.includes("api");

        if (!hasRepo) {
          return {
            success: false,
            error: `Token do GitLab autenticado, mas NÃO possui a permissão 'read_repository' necessária para o HarborX clonar repositórios de Stacks. Escopos detectados: [${scopes.join(", ")}].`,
            scopes,
            permissions: {
              canCloneRepos: false,
              canPullImages: scopes.includes("read_registry"),
              provider: "gitlab",
            },
          };
        }

        return {
          success: true,
          status:
            "Token do GitLab validado com sucesso! Possui permissão 'read_repository' para criação de Stacks.",
          scopes,
          permissions: {
            canCloneRepos: true,
            canPullImages: true,
            provider: "gitlab",
          },
        };
      }
    } catch {
      // Fallback to Docker checkAuth below if GitLab API fails or is unreachable
    }
  }

  // 4. Fallback: Test with Docker Daemon (for Docker Hub or generic registries)
  const serveraddress = normalizeRegistryServerAddress(data.url);
  try {
    const res = await docker.checkAuth({
      username,
      password: secret,
      serveraddress,
    });

    const statusMsg =
      (res as { Status?: string })?.Status || "Autenticação no registro realizada com sucesso!";

    return {
      success: true,
      status: statusMsg,
      permissions: {
        canCloneRepos: false,
        canPullImages: true,
        provider: cleanUrl.includes("docker.io") ? "dockerhub" : "generic_docker",
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    let friendlyError = msg;
    if (
      msg.includes("401") ||
      msg.toLowerCase().includes("unauthorized") ||
      msg.toLowerCase().includes("incorrect") ||
      msg.toLowerCase().includes("bad credentials")
    ) {
      friendlyError =
        "Credenciais inválidas: usuário ou senha/token incorretos para este registro.";
    } else if (
      msg.includes("ENOTFOUND") ||
      msg.toLowerCase().includes("no such host") ||
      msg.includes("EAI_AGAIN")
    ) {
      friendlyError = `Não foi possível alcançar o servidor do registro (${serveraddress}). Verifique o domínio digitado.`;
    } else if (msg.includes("connect ECONNREFUSED")) {
      friendlyError = `Conexão recusada ao tentar conectar em ${serveraddress}.`;
    }

    return {
      success: false,
      error: friendlyError,
    };
  }
}
