import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { docker } from "../docker.js";
import { findGitAuthForRepo, syncDockerAuthConfig } from "./registries.js";

const execFileAsync = promisify(execFile);

export interface StackEnvVar {
  key: string;
  value: string;
  secret: boolean;
}

export interface StackRecord {
  id: string;
  name: string;
  type: "compose" | "git";
  status: "deployed" | "stopped" | "failed" | "deploying";
  composeYaml: string;
  env: StackEnvVar[];
  gitRepo?: string;
  gitBranch?: string;
  gitPath?: string;
  gitRegistryId?: string;
  webhookToken: string;
  autoDeploy: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StackWithContainers extends StackRecord {
  containersCount: number;
  runningContainersCount: number;
  containers: Array<{
    id: string;
    name: string;
    state: string;
    status: string;
    image: string;
    ports: Array<{ hostPort?: number; containerPort: number; protocol: string }>;
  }>;
  recentDeployment?: {
    id: string;
    triggeredBy: string;
    status: string;
    outputLog: string;
    createdAt: string;
  };
}

function getStackDir(stackName: string): string {
  const dir = path.join(config.dataDir, "stacks", stackName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveComposeFilePath(stackDir: string, requestedPath?: string | null): string {
  if (requestedPath && requestedPath.trim()) {
    const raw = requestedPath.trim();
    if (fs.existsSync(path.join(stackDir, raw))) {
      return raw;
    }
    // Check .yaml <-> .yml swap
    if (raw.endsWith(".yaml")) {
      const alt = raw.slice(0, -5) + ".yml";
      if (fs.existsSync(path.join(stackDir, alt))) return alt;
    } else if (raw.endsWith(".yml")) {
      const alt = raw.slice(0, -4) + ".yaml";
      if (fs.existsSync(path.join(stackDir, alt))) return alt;
    }
  }

  const candidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
    "deploy/docker-compose.yml",
    "deploy/docker-compose.yaml",
    "deploy/compose.yml",
    "deploy/compose.yaml",
    "docker/docker-compose.yml",
    "docker/docker-compose.yaml",
    "docker/compose.yml",
    "docker/compose.yaml",
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(stackDir, candidate))) {
      return candidate;
    }
  }

  return requestedPath?.trim() || "docker-compose.yml";
}

export async function listStacks(): Promise<StackWithContainers[]> {
  const rows = db.prepare("SELECT * FROM stacks ORDER BY name ASC").all() as Array<{
    id: string;
    name: string;
    type: "compose" | "git";
    status: "deployed" | "stopped" | "failed" | "deploying";
    compose_yaml: string;
    env_json: string;
    git_repo: string | null;
    git_branch: string | null;
    git_path: string | null;
    webhook_token: string;
    auto_deploy: number;
    created_at: string;
    updated_at: string;
  }>;

  // Retrieve all containers once to match project labels
  let allContainers: Array<{
    Id: string;
    Names?: string[];
    State?: string;
    Status?: string;
    Image?: string;
    Ports?: Array<{ PublicPort?: number; PrivatePort?: number; Type?: string }>;
    Labels?: Record<string, string>;
  }> = [];

  try {
    allContainers = (await docker.listContainers({ all: true })) as typeof allContainers;
  } catch {
    allContainers = [];
  }

  let recentDeployments: Array<{
    id: string;
    stack_id: string;
    triggered_by: string;
    status: string;
    output_log: string;
    created_at: string;
  }> = [];

  try {
    recentDeployments = db
      .prepare(
        `SELECT d1.id, d1.stack_id, d1.triggered_by, d1.status, d1.output_log, d1.created_at
         FROM stack_deployments d1
         INNER JOIN (
           SELECT stack_id, MAX(created_at) AS max_created
           FROM stack_deployments
           GROUP BY stack_id
         ) d2 ON d1.stack_id = d2.stack_id AND d1.created_at = d2.max_created`,
      )
      .all() as typeof recentDeployments;
  } catch {
    recentDeployments = [];
  }

  const depMap = new Map<
    string,
    {
      id: string;
      triggeredBy: string;
      status: string;
      outputLog: string;
      createdAt: string;
    }
  >();

  for (const dep of recentDeployments) {
    depMap.set(dep.stack_id, {
      id: dep.id,
      triggeredBy: dep.triggered_by,
      status: dep.status,
      outputLog: dep.output_log,
      createdAt: dep.created_at,
    });
  }

  return rows.map((r) => {
    let env: StackEnvVar[] = [];
    try {
      env = r.env_json ? (JSON.parse(r.env_json) as StackEnvVar[]) : [];
    } catch {
      env = [];
    }

    // Find containers for this project
    const stackContainers = allContainers.filter(
      (c) =>
        c.Labels?.["com.docker.compose.project"]?.toLowerCase() === r.name.toLowerCase() ||
        c.Labels?.["com.harborx.stack"]?.toLowerCase() === r.name.toLowerCase(),
    );

    const running = stackContainers.filter((c) => c.State === "running").length;

    const containers = stackContainers.map((c) => ({
      id: c.Id,
      name: (c.Names?.[0] || c.Id).replace(/^\//, ""),
      state: c.State || "unknown",
      status: c.Status || "",
      image: c.Image || "",
      ports: (c.Ports || []).map((p) => ({
        hostPort: p.PublicPort,
        containerPort: p.PrivatePort || 0,
        protocol: p.Type || "tcp",
      })),
    }));

    const recentDep = depMap.get(r.id);

    return {
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      composeYaml: r.compose_yaml,
      env,
      gitRepo: r.git_repo || undefined,
      gitBranch: r.git_branch || undefined,
      gitPath: r.git_path || undefined,
      gitRegistryId: (r as { git_registry_id?: string | null }).git_registry_id || undefined,
      webhookToken: r.webhook_token,
      autoDeploy: Boolean(r.auto_deploy),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      containersCount: stackContainers.length,
      runningContainersCount: running,
      containers,
      recentDeployment: recentDep,
    };
  });
}

export async function getStack(id: string): Promise<StackWithContainers | null> {
  const row = db.prepare("SELECT * FROM stacks WHERE id = ? OR name = ?").get(id, id) as
    | {
        id: string;
        name: string;
        type: "compose" | "git";
        status: "deployed" | "stopped" | "failed" | "deploying";
        compose_yaml: string;
        env_json: string;
        git_repo: string | null;
        git_branch: string | null;
        git_path: string | null;
        webhook_token: string;
        auto_deploy: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  let env: StackEnvVar[] = [];
  try {
    env = row.env_json ? (JSON.parse(row.env_json) as StackEnvVar[]) : [];
  } catch {
    env = [];
  }

  let stackContainers: Array<{
    Id: string;
    Names?: string[];
    State?: string;
    Status?: string;
    Image?: string;
    Ports?: Array<{ PublicPort?: number; PrivatePort?: number; Type?: string }>;
    Labels?: Record<string, string>;
  }> = [];

  try {
    const list = (await docker.listContainers({ all: true })) as typeof stackContainers;
    stackContainers = list.filter(
      (c) =>
        c.Labels?.["com.docker.compose.project"]?.toLowerCase() === row.name.toLowerCase() ||
        c.Labels?.["com.harborx.stack"]?.toLowerCase() === row.name.toLowerCase(),
    );
  } catch {
    stackContainers = [];
  }

  const running = stackContainers.filter((c) => c.State === "running").length;

  const containers = stackContainers.map((c) => ({
    id: c.Id,
    name: (c.Names?.[0] || c.Id).replace(/^\//, ""),
    state: c.State || "unknown",
    status: c.Status || "",
    image: c.Image || "",
    ports: (c.Ports || []).map((p) => ({
      hostPort: p.PublicPort,
      containerPort: p.PrivatePort || 0,
      protocol: p.Type || "tcp",
    })),
  }));

  const recentDep = db
    .prepare(
      "SELECT id, triggered_by, status, output_log, created_at FROM stack_deployments WHERE stack_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(row.id) as
    | {
        id: string;
        triggered_by: string;
        status: string;
        output_log: string;
        created_at: string;
      }
    | undefined;

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    composeYaml: row.compose_yaml,
    env,
    gitRepo: row.git_repo || undefined,
    gitBranch: row.git_branch || undefined,
    gitPath: row.git_path || undefined,
    gitRegistryId: (row as { git_registry_id?: string | null }).git_registry_id || undefined,
    webhookToken: row.webhook_token,
    autoDeploy: Boolean(row.auto_deploy),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    containersCount: stackContainers.length,
    runningContainersCount: running,
    containers,
    recentDeployment: recentDep
      ? {
          id: recentDep.id,
          triggeredBy: recentDep.triggered_by,
          status: recentDep.status,
          outputLog: recentDep.output_log,
          createdAt: recentDep.created_at,
        }
      : undefined,
  };
}

export function createStackRecord(data: {
  name: string;
  type: "compose" | "git";
  composeYaml?: string;
  env?: StackEnvVar[];
  gitRepo?: string;
  gitBranch?: string;
  gitPath?: string;
  gitRegistryId?: string | null;
  autoDeploy?: boolean;
}): StackRecord {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  const envJson = JSON.stringify(data.env || []);
  const yaml = data.composeYaml || "";

  db.prepare(
    `INSERT INTO stacks (id, name, type, status, compose_yaml, env_json, git_repo, git_branch, git_path, git_registry_id, webhook_token, auto_deploy, created_at, updated_at)
     VALUES (?, ?, ?, 'stopped', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    data.name.trim().toLowerCase(),
    data.type,
    yaml,
    envJson,
    data.gitRepo || null,
    data.gitBranch || "main",
    data.gitPath || "compose.yaml",
    data.gitRegistryId || null,
    token,
    data.autoDeploy ? 1 : 0,
    now,
    now,
  );

  return {
    id,
    name: data.name.trim().toLowerCase(),
    type: data.type,
    status: "stopped",
    composeYaml: yaml,
    env: data.env || [],
    gitRepo: data.gitRepo,
    gitBranch: data.gitBranch || "main",
    gitPath: data.gitPath || "compose.yaml",
    gitRegistryId: data.gitRegistryId || undefined,
    webhookToken: token,
    autoDeploy: Boolean(data.autoDeploy),
    createdAt: now,
    updatedAt: now,
  };
}

export async function deployStack(
  stackId: string,
  triggeredBy = "user",
  options?: { pull?: boolean },
): Promise<{ success: boolean; output: string }> {
  const stack = await getStack(stackId);
  if (!stack) throw new Error("Stack não encontrada");

  db.prepare("UPDATE stacks SET status = 'deploying', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    stack.id,
  );

  const stackDir = getStackDir(stack.name);
  let outputLog = "";
  let finalStatus: "deployed" | "failed" = "deployed";
  let activeGitAuthSecret: string | undefined;
  let activeComposeFile = "compose.yaml";

  try {
    if (stack.type === "git" && stack.gitRepo) {
      const gitDir = path.join(stackDir, ".git");

      // Normalize git@ SSH URLs to https://
      let cleanRepo = stack.gitRepo.trim();
      if (cleanRepo.startsWith("git@")) {
        cleanRepo = cleanRepo.replace(/^git@([^:]+):/, "https://$1/");
      }

      const gitAuth = findGitAuthForRepo(cleanRepo, stack.gitRegistryId);
      if (gitAuth?.secret) {
        activeGitAuthSecret = gitAuth.secret;
      }

      const isGitHub = cleanRepo.includes("github.com");
      const authUsername = isGitHub
        ? "x-access-token"
        : gitAuth?.username.replace(/^@+/, "").trim() || "oauth2";

      const gitExtraArgs: string[] = ["-c", "credential.helper=", "-c", "core.askPass="];

      if (gitAuth && !cleanRepo.includes("@")) {
        const basicToken = Buffer.from(`${authUsername}:${gitAuth.secret}`).toString("base64");
        gitExtraArgs.push("-c", `http.extraheader=Authorization: Basic ${basicToken}`);
        outputLog += `[HarborX GitAuth] Utilizando credencial registrada '${gitAuth.registryName}' (${authUsername}) para autenticação segura no Git.\n`;
      }

      const gitEnv = {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "",
      };

      if (fs.existsSync(gitDir)) {
        try {
          const pullRes = await execFileAsync("git", [...gitExtraArgs, "pull"], {
            cwd: stackDir,
            timeout: 60000,
            env: gitEnv,
          });
          outputLog += `[git pull]\n${pullRes.stdout}\n${pullRes.stderr}\n`;
        } catch (pullErr) {
          if (gitAuth) {
            try {
              const u = new URL(cleanRepo.startsWith("http") ? cleanRepo : `https://${cleanRepo}`);
              u.username = authUsername;
              u.password = gitAuth.secret;
              const directAuthUrl = u.toString();

              const fallbackPull = await execFileAsync(
                "git",
                ["-c", "credential.helper=", "-c", "core.askPass=", "pull", directAuthUrl],
                { cwd: stackDir, timeout: 60000, env: gitEnv },
              );
              outputLog += `[git pull]\n${fallbackPull.stdout}\n${fallbackPull.stderr}\n`;
            } catch {
              throw pullErr;
            }
          } else {
            throw pullErr;
          }
        }
      } else {
        try {
          const cloneRes = await execFileAsync(
            "git",
            [...gitExtraArgs, "clone", "--branch", stack.gitBranch || "main", cleanRepo, "."],
            { cwd: stackDir, timeout: 120000, env: gitEnv },
          );
          outputLog += `[git clone]\n${cloneRes.stdout}\n${cloneRes.stderr}\n`;
        } catch (cloneErr) {
          if (gitAuth) {
            try {
              const u = new URL(cleanRepo.startsWith("http") ? cleanRepo : `https://${cleanRepo}`);
              u.username = authUsername;
              u.password = gitAuth.secret;
              const directAuthUrl = u.toString();

              const fallbackClone = await execFileAsync(
                "git",
                [
                  "-c",
                  "credential.helper=",
                  "-c",
                  "core.askPass=",
                  "clone",
                  "--branch",
                  stack.gitBranch || "main",
                  directAuthUrl,
                  ".",
                ],
                { cwd: stackDir, timeout: 120000, env: gitEnv },
              );
              outputLog += `[git clone]\n${fallbackClone.stdout}\n${fallbackClone.stderr}\n`;

              // Sanitize remote URL on disk so credentials are never stored in .git/config
              try {
                await execFileAsync("git", ["remote", "set-url", "origin", cleanRepo], {
                  cwd: stackDir,
                  timeout: 10000,
                });
              } catch {
                // ignore
              }
            } catch {
              throw cloneErr;
            }
          } else {
            throw cloneErr;
          }
        }
      }

      if (gitAuth?.secret) {
        outputLog = outputLog.replaceAll(gitAuth.secret, "******");
      }

      // Resolve compose file in git repository (handles .yaml vs .yml and common directory conventions)
      const resolvedFile = resolveComposeFilePath(stackDir, stack.gitPath);
      activeComposeFile = resolvedFile;

      const targetComposeFile = path.join(stackDir, resolvedFile);
      if (fs.existsSync(targetComposeFile)) {
        const content = fs.readFileSync(targetComposeFile, "utf8");
        db.prepare("UPDATE stacks SET compose_yaml = ?, git_path = ? WHERE id = ?").run(
          content,
          resolvedFile,
          stack.id,
        );
        if (resolvedFile !== stack.gitPath) {
          outputLog += `[HarborX] Arquivo compose resolvido automaticamente: '${resolvedFile}'.\n`;
        }
      } else {
        try {
          const filesInRoot = fs.readdirSync(stackDir).filter((f) => !f.startsWith("."));
          outputLog += `[HarborX Aviso] Arquivo compose '${resolvedFile}' não encontrado no repositório. Arquivos encontrados: ${filesInRoot.join(", ") || "(vazio)"}\n`;
        } catch {
          // ignore
        }
      }
    } else {
      // Direct compose mode: write compose.yaml
      activeComposeFile = "compose.yaml";
      const composePath = path.join(stackDir, "compose.yaml");
      fs.writeFileSync(composePath, stack.composeYaml, "utf8");
    }

    // Write .env file
    if (stack.env && stack.env.length > 0) {
      const envLines = stack.env.map((e) => `${e.key}=${e.value}`);
      fs.writeFileSync(path.join(stackDir, ".env"), envLines.join("\n"), "utf8");
    }

    // Execute docker compose up
    const composeFile = activeComposeFile;
    const dockerConfigDir = syncDockerAuthConfig();
    const dockerEnv = {
      ...process.env,
      DOCKER_CONFIG: dockerConfigDir,
    };

    if (options?.pull) {
      try {
        const pullRes = await execFileAsync(
          "docker",
          ["compose", "-p", stack.name, "-f", composeFile, "pull"],
          { cwd: stackDir, env: dockerEnv, timeout: 300000 },
        );
        outputLog += `[docker compose pull]\n${pullRes.stdout}\n${pullRes.stderr}\n`;
      } catch (pullErr: unknown) {
        const msg = pullErr instanceof Error ? pullErr.message : String(pullErr);
        outputLog += `[docker compose pull aviso]\n${msg}\n`;
      }
    }

    const composeArgs = [
      "compose",
      "-p",
      stack.name,
      "-f",
      composeFile,
      "up",
      "-d",
      "--remove-orphans",
    ];

    if (options?.pull) {
      composeArgs.push("--pull", "always", "--force-recreate");
    }

    const upRes = await execFileAsync("docker", composeArgs, {
      cwd: stackDir,
      env: dockerEnv,
      timeout: 300000,
    });

    outputLog += `[docker compose up]\n${upRes.stdout}\n${upRes.stderr}\n`;
    finalStatus = "deployed";
  } catch (err: unknown) {
    finalStatus = "failed";
    let msg = err instanceof Error ? err.message : String(err);
    if (activeGitAuthSecret) {
      msg = msg.replaceAll(activeGitAuthSecret, "******");
    }
    outputLog += `\n[ERRO]\n${msg}\n`;

    if (
      msg.includes("403") ||
      msg.includes("Repository not found") ||
      msg.includes("access denied") ||
      msg.includes("not found")
    ) {
      outputLog += `\n[DIAGNÓSTICO HARBORX - ACESSO AO REPOSITÓRIO GIT]\nAcesso negado (403) ou Repositório não encontrado.\nPossíveis causas no GitHub:\n1. Token Fine-Grained (github_pat_...): No GitHub (Settings > Developer Settings > Personal access tokens > Fine-grained tokens), verifique o campo "Repository access". Se estiver configurado como "Only select repositories", adicione este repositório à lista e certifique-se de que a permissão "Contents: Read-only" está concedida.\n2. Organizações: Se o repositório pertence a uma Organização, o proprietário da organização precisa aprovar o acesso do token.\n3. Token Clássico (ghp_...): Para repositórios privados, marque o escopo "repo".\n`;
    }
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE stacks SET status = ?, updated_at = ? WHERE id = ?").run(
    finalStatus,
    now,
    stack.id,
  );

  // Record deployment log
  const depId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO stack_deployments (id, stack_id, triggered_by, status, output_log, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    depId,
    stack.id,
    triggeredBy,
    finalStatus === "deployed" ? "success" : "failed",
    outputLog,
    now,
  );

  if (finalStatus === "failed") {
    throw new Error(outputLog);
  }

  return { success: true, output: outputLog };
}

export async function stopStack(stackId: string): Promise<void> {
  const stack = await getStack(stackId);
  if (!stack) throw new Error("Stack não encontrada");

  const stackDir = getStackDir(stack.name);
  const composeFile = stack.type === "git" ? stack.gitPath || "compose.yaml" : "compose.yaml";

  await execFileAsync("docker", ["compose", "-p", stack.name, "-f", composeFile, "stop"], {
    cwd: stackDir,
    timeout: 60000,
  });

  db.prepare("UPDATE stacks SET status = 'stopped', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    stack.id,
  );
}

export async function startStack(stackId: string): Promise<void> {
  const stack = await getStack(stackId);
  if (!stack) throw new Error("Stack não encontrada");

  const stackDir = getStackDir(stack.name);
  const composeFile = stack.type === "git" ? stack.gitPath || "compose.yaml" : "compose.yaml";

  await execFileAsync("docker", ["compose", "-p", stack.name, "-f", composeFile, "start"], {
    cwd: stackDir,
    timeout: 60000,
  });

  db.prepare("UPDATE stacks SET status = 'deployed', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    stack.id,
  );
}

export async function removeStack(stackId: string, removeVolumes = false): Promise<void> {
  const stack = await getStack(stackId);
  if (!stack) throw new Error("Stack não encontrada");

  const stackDir = path.join(config.dataDir, "stacks", stack.name);
  const composeFile = stack.type === "git" ? stack.gitPath || "compose.yaml" : "compose.yaml";
  const composePath = path.join(stackDir, composeFile);

  // Executa 'docker compose down' apenas se a stack possuir containers e o compose existir
  if (stack.containersCount > 0 && fs.existsSync(composePath)) {
    const downArgs = ["compose", "-p", stack.name, "-f", composeFile, "down"];
    if (removeVolumes) downArgs.push("-v");

    try {
      await execFileAsync("docker", downArgs, { cwd: stackDir, timeout: 15000 });
    } catch {
      // Ignore down errors if containers are already gone
    }
  }

  // Remove stack files se existirem
  try {
    if (fs.existsSync(stackDir)) {
      fs.rmSync(stackDir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }

  // Delete DB record
  db.prepare("DELETE FROM stacks WHERE id = ?").run(stack.id);
}

export async function updateStackRecord(
  stackId: string,
  data: {
    name?: string;
    type?: "compose" | "git";
    composeYaml?: string;
    env?: StackEnvVar[];
    gitRepo?: string;
    gitBranch?: string;
    gitPath?: string;
    gitRegistryId?: string | null;
    autoDeploy?: boolean;
  },
): Promise<void> {
  const stack = await getStack(stackId);
  if (!stack) throw new Error("Stack não encontrada");

  const newName = data.name ? data.name.trim().toLowerCase() : stack.name;
  const newType = data.type ?? stack.type;
  const newYaml = data.composeYaml !== undefined ? data.composeYaml : stack.composeYaml;
  const newEnvJson = data.env !== undefined ? JSON.stringify(data.env) : JSON.stringify(stack.env);
  const newGitRepo = data.gitRepo !== undefined ? data.gitRepo || null : stack.gitRepo || null;
  const newGitBranch =
    data.gitBranch !== undefined ? data.gitBranch || "main" : stack.gitBranch || "main";
  const newGitPath =
    data.gitPath !== undefined ? data.gitPath || "compose.yaml" : stack.gitPath || "compose.yaml";
  const newGitRegistryId =
    data.gitRegistryId !== undefined ? data.gitRegistryId || null : stack.gitRegistryId || null;
  const newAutoDeploy =
    data.autoDeploy !== undefined ? (data.autoDeploy ? 1 : 0) : stack.autoDeploy ? 1 : 0;
  const now = new Date().toISOString();

  // If stack name changed, rename directory if old directory exists
  if (newName !== stack.name) {
    const oldDir = path.join(config.dataDir, "stacks", stack.name);
    const newDir = path.join(config.dataDir, "stacks", newName);
    if (fs.existsSync(oldDir)) {
      try {
        fs.renameSync(oldDir, newDir);
      } catch {
        fs.mkdirSync(newDir, { recursive: true });
      }
    }
  }

  db.prepare(
    `
    UPDATE stacks
    SET name = ?, type = ?, compose_yaml = ?, env_json = ?, git_repo = ?, git_branch = ?, git_path = ?, git_registry_id = ?, auto_deploy = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(
    newName,
    newType,
    newYaml,
    newEnvJson,
    newGitRepo,
    newGitBranch,
    newGitPath,
    newGitRegistryId,
    newAutoDeploy,
    now,
    stack.id,
  );
}

export async function updateStackCompose(
  stackId: string,
  composeYaml: string,
  env?: StackEnvVar[],
): Promise<void> {
  return updateStackRecord(stackId, { composeYaml, env });
}

export function getStackByWebhookToken(token: string): StackRecord | null {
  const row = db.prepare("SELECT * FROM stacks WHERE webhook_token = ?").get(token) as
    | {
        id: string;
        name: string;
        type: "compose" | "git";
        status: "deployed" | "stopped" | "failed" | "deploying";
        compose_yaml: string;
        env_json: string;
        git_repo: string | null;
        git_branch: string | null;
        git_path: string | null;
        webhook_token: string;
        auto_deploy: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;

  let env: StackEnvVar[] = [];
  try {
    env = row.env_json ? (JSON.parse(row.env_json) as StackEnvVar[]) : [];
  } catch {
    env = [];
  }

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    composeYaml: row.compose_yaml,
    env,
    gitRepo: row.git_repo || undefined,
    gitBranch: row.git_branch || undefined,
    gitPath: row.git_path || undefined,
    webhookToken: row.webhook_token,
    autoDeploy: Boolean(row.auto_deploy),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
