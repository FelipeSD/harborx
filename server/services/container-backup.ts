import { PassThrough } from "node:stream";
import type {
  ContainerBackupInspection,
  ContainerBackupRestoreResult,
  ResticSnapshot,
} from "../../shared/types.js";
import { docker } from "../docker.js";

export interface DatabaseDetectionResult {
  isDatabase: boolean;
  dbType: string | null;
}

export interface BackupContainerSummary {
  id: string;
  name: string;
  state: string;
  image: string;
}

export interface ContainerBackupInfo {
  id: string;
  name: string;
  image: string;
  isDatabase: boolean;
  dbType: string | null;
  hasBackupConfigured: boolean;
  isBackupRunner?: boolean;
  backupContainer?: BackupContainerSummary;
}

/**
 * Detects whether an image/container is a backup-toolkit container.
 */
export function isBackupToolkitContainer(image = "", envList: string[] = []): boolean {
  const img = image.toLowerCase();
  if (img.includes("backup-toolkit")) return true;
  const envKeys = envList.map((e) => (e.split("=")[0] || "").toUpperCase());
  return (
    envKeys.includes("RESTIC_PASSWORD") &&
    (envKeys.includes("R2_BUCKET") || envKeys.includes("RESTIC_REPOSITORY")) &&
    envKeys.includes("DB_TYPE")
  );
}

/**
 * Detects whether a container runs a database based on image, name, or environment variables.
 */
export function detectDatabaseType(
  imageName = "",
  containerName = "",
  envList: string[] = [],
): DatabaseDetectionResult {
  const img = imageName.toLowerCase();
  const name = containerName.toLowerCase();
  const envKeys = envList.map((e) => (e.split("=")[0] || "").toUpperCase());

  if (
    img.includes("postgres") ||
    img.includes("timescale") ||
    img.includes("postgis") ||
    name.includes("postgres") ||
    envKeys.some((k) => k.startsWith("POSTGRES_"))
  ) {
    return { isDatabase: true, dbType: "PostgreSQL" };
  }

  if (
    img.includes("mysql") ||
    name.includes("mysql") ||
    envKeys.some((k) => k.startsWith("MYSQL_"))
  ) {
    return { isDatabase: true, dbType: "MySQL" };
  }

  if (
    img.includes("mariadb") ||
    name.includes("mariadb") ||
    envKeys.some((k) => k.startsWith("MARIADB_"))
  ) {
    return { isDatabase: true, dbType: "MariaDB" };
  }

  if (
    img.includes("mongo") ||
    name.includes("mongo") ||
    envKeys.some((k) => k.startsWith("MONGO_"))
  ) {
    return { isDatabase: true, dbType: "MongoDB" };
  }

  if (
    img.includes("redis") ||
    img.includes("valkey") ||
    img.includes("dragonfly") ||
    img.includes("keydb") ||
    name.includes("redis") ||
    envKeys.some((k) => k.startsWith("REDIS_"))
  ) {
    return { isDatabase: true, dbType: "Redis / Key-Value" };
  }

  if (img.includes("mssql") || img.includes("sqlserver") || name.includes("sqlserver")) {
    return { isDatabase: true, dbType: "Microsoft SQL Server" };
  }

  if (img.includes("elasticsearch") || img.includes("opensearch")) {
    return { isDatabase: true, dbType: "Elasticsearch" };
  }

  if (img.includes("cassandra") || img.includes("scylla")) {
    return { isDatabase: true, dbType: "Cassandra" };
  }

  if (img.includes("clickhouse")) {
    return { isDatabase: true, dbType: "ClickHouse" };
  }

  if (img.includes("couchdb")) {
    return { isDatabase: true, dbType: "CouchDB" };
  }

  if (img.includes("influxdb")) {
    return { isDatabase: true, dbType: "InfluxDB" };
  }

  if (
    name.endsWith("-db") ||
    name.endsWith("_db") ||
    name.includes("database") ||
    name.includes("-database") ||
    img.includes("/database") ||
    img.includes("cockroach")
  ) {
    return { isDatabase: true, dbType: "Banco de Dados" };
  }

  return { isDatabase: false, dbType: null };
}

/**
 * Searches for an associated backup container configured for the given container.
 */
export async function findAssociatedBackupContainer(
  containerId: string,
): Promise<{ hasBackup: boolean; backupContainer?: BackupContainerSummary }> {
  try {
    const container = docker.getContainer(containerId);
    const inspect = await container.inspect().catch(() => null);
    if (!inspect) return { hasBackup: false };

    const rawName = (inspect.Name || "").replace(/^\//, "");
    const labels = inspect.Config?.Labels || {};
    const project =
      labels["com.docker.compose.project"] ||
      labels["io.portainer.stack.name"] ||
      labels["harborx.stack"] ||
      labels["com.docker.stack.namespace"];

    const allContainers = await docker.listContainers({ all: true });

    // 1. Look for backup container in the same compose project/stack
    if (project) {
      const match = allContainers.find((c) => {
        const cProject =
          c.Labels["com.docker.compose.project"] ||
          c.Labels["io.portainer.stack.name"] ||
          c.Labels["harborx.stack"] ||
          c.Labels["com.docker.stack.namespace"];

        if (cProject?.toLowerCase() !== project.toLowerCase()) return false;
        if (c.Id === containerId) return false;

        const cImg = (c.Image || "").toLowerCase();
        const cName = (c.Names?.[0] || "").toLowerCase();
        const cService = (c.Labels["com.docker.compose.service"] || "").toLowerCase();

        return (
          cImg.includes("backup-toolkit") ||
          cService.includes("backup") ||
          cName.includes("database-backup") ||
          cName.includes("backup-toolkit") ||
          cName.endsWith("-backup")
        );
      });

      if (match) {
        return {
          hasBackup: true,
          backupContainer: {
            id: match.Id,
            name: (match.Names?.[0] || match.Id.slice(0, 12)).replace(/^\//, ""),
            state: match.State,
            image: match.Image,
          },
        };
      }
    }

    // 2. Look by naming conventions (e.g. app-database-backup, postgres-backup)
    const nameMatch = allContainers.find((c) => {
      if (c.Id === containerId) return false;
      const cName = (c.Names?.[0] || "").replace(/^\//, "").toLowerCase();
      const cImg = (c.Image || "").toLowerCase();
      return (
        (cImg.includes("backup-toolkit") || cName.includes("backup")) &&
        (cName === `${rawName.toLowerCase()}-backup` ||
          cName === `${rawName.toLowerCase()}-database-backup` ||
          cName.includes(`${rawName.toLowerCase()}-backup`))
      );
    });

    if (nameMatch) {
      return {
        hasBackup: true,
        backupContainer: {
          id: nameMatch.Id,
          name: (nameMatch.Names?.[0] || nameMatch.Id.slice(0, 12)).replace(/^\//, ""),
          state: nameMatch.State,
          image: nameMatch.Image,
        },
      };
    }

    return { hasBackup: false };
  } catch {
    return { hasBackup: false };
  }
}

/**
 * Executes a pre-removal backup run on the designated backup container.
 */
export async function executePreRemoveBackup(
  backupContainerId: string,
): Promise<{ success: boolean; log: string }> {
  const container = docker.getContainer(backupContainerId);
  const inspect = await container.inspect();
  let logOutput = "";

  if (!inspect.State.Running) {
    // Start container which runs backup_once on startup
    await container.start();
    await new Promise((r) => setTimeout(r, 6000));
    try {
      const logs = await container.logs({ stdout: true, stderr: true, tail: 80 });
      logOutput = logs.toString("utf8");
    } catch {
      logOutput = "Backup container iniciado com sucesso.";
    }
    return { success: true, log: logOutput };
  }

  // Container is running: execute backup command directly
  const exec = await container.exec({
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    Cmd: [
      "bash",
      "-c",
      `
set -Eeuo pipefail
export RESTIC_REPOSITORY="s3:\${R2_ENDPOINT%/}/\${R2_BUCKET}"
export AWS_DEFAULT_REGION="\${AWS_DEFAULT_REGION:-auto}"
export DB_PORT="\${DB_PORT:-$(case "\${DB_TYPE:-}" in mysql) echo 3306;; postgres) echo 5432;; mongodb) echo 27017;; esac)}"
dump_dir="$(mktemp -d)"
trap 'rm -rf "$dump_dir"' EXIT

if [ -f "/usr/local/bin/backup-\${DB_TYPE}.sh" ]; then
  "/usr/local/bin/backup-\${DB_TYPE}.sh" "$dump_dir"
elif [ -f "/usr/local/bin/entrypoint.sh" ]; then
  /usr/local/bin/entrypoint.sh --once || true
fi

restic snapshots >/dev/null 2>&1 || restic init
restic backup "$dump_dir" --tag "db:\${DB_TYPE:-db}" --tag "database:\${DB_NAME:-app}" --tag "pre-remove" --tag automated
restic forget --keep-daily "\${BACKUP_KEEP_DAILY:-7}" --keep-weekly "\${BACKUP_KEEP_WEEKLY:-4}" --keep-monthly "\${BACKUP_KEEP_MONTHLY:-12}" --prune
echo "HARBORX_BACKUP_SUCCESS"
      `,
    ],
  });

  const stream = await exec.start({ hijack: true, stdin: false });
  const outStream = new PassThrough();
  outStream.on("data", (chunk: Buffer) => {
    logOutput += chunk.toString("utf8");
  });
  docker.modem.demuxStream(stream, outStream, outStream);

  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
    setTimeout(() => resolve(), 90000);
  });

  const execInspect = await exec.inspect();
  if (
    execInspect.ExitCode !== 0 &&
    !logOutput.includes("HARBORX_BACKUP_SUCCESS") &&
    !logOutput.includes("snapshot")
  ) {
    throw new Error(
      `Falha na execução do backup (ExitCode ${execInspect.ExitCode}): ${
        logOutput.slice(-300).trim() || "Erro ao gravar dados no R2"
      }`,
    );
  }

  return { success: true, log: logOutput };
}

/**
 * Resolves the backup container instance for a given target container ID.
 * Returns information about the backup runner whether the target itself is the backup container
 * or whether it has an associated backup companion container.
 */
export async function resolveBackupContainer(containerId: string): Promise<{
  isBackupRunner: boolean;
  backupContainerId: string;
  backupContainerName: string;
  targetContainerName: string;
  image: string;
  env: Record<string, string>;
  isDirectToolkit: boolean;
} | null> {
  try {
    const container = docker.getContainer(containerId);
    const inspect = await container.inspect().catch(() => null);
    if (!inspect) return null;

    const rawName = (inspect.Name || "").replace(/^\//, "");
    const image = inspect.Config?.Image || "";
    const envList = inspect.Config?.Env || [];

    const envMap: Record<string, string> = {};
    for (const item of envList) {
      const idx = item.indexOf("=");
      if (idx !== -1) {
        envMap[item.slice(0, idx)] = item.slice(idx + 1);
      }
    }

    // 1. Is this container itself a backup-toolkit container?
    if (isBackupToolkitContainer(image, envList)) {
      return {
        isBackupRunner: true,
        backupContainerId: containerId,
        backupContainerName: rawName,
        targetContainerName: rawName,
        image,
        env: envMap,
        isDirectToolkit: true,
      };
    }

    // 2. Is there an associated backup container?
    const associated = await findAssociatedBackupContainer(containerId);
    if (associated.hasBackup && associated.backupContainer) {
      const bContainer = docker.getContainer(associated.backupContainer.id);
      const bInspect = await bContainer.inspect().catch(() => null);
      if (!bInspect) return null;

      const bEnvMap: Record<string, string> = {};
      for (const item of bInspect.Config?.Env || []) {
        const idx = item.indexOf("=");
        if (idx !== -1) {
          bEnvMap[item.slice(0, idx)] = item.slice(idx + 1);
        }
      }

      return {
        isBackupRunner: true,
        backupContainerId: associated.backupContainer.id,
        backupContainerName: associated.backupContainer.name,
        targetContainerName: rawName,
        image: bInspect.Config?.Image || associated.backupContainer.image,
        env: bEnvMap,
        isDirectToolkit: false,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Inspects the Cloudflare R2 / S3 repository and lists existing snapshots for the target container.
 */
export async function inspectBackupSnapshots(
  containerId: string,
): Promise<ContainerBackupInspection> {
  const resolved = await resolveBackupContainer(containerId);
  if (!resolved) {
    throw new Error(
      "Nenhum container de backup configurado ou associado a este container. Certifique-se de que o container utilize a imagem felipesdam496/backup-toolkit.",
    );
  }

  const { backupContainerId, env } = resolved;
  const backupContainer = docker.getContainer(backupContainerId);
  const inspect = await backupContainer.inspect();

  if (!inspect.State.Running) {
    await backupContainer.start();
    await new Promise((r) => setTimeout(r, 4000));
  }

  const defaultPort = (type: string) => {
    switch (type.toLowerCase()) {
      case "postgres":
      case "postgresql":
        return "5432";
      case "mysql":
      case "mariadb":
        return "3306";
      case "mongodb":
      case "mongo":
        return "27017";
      default:
        return "";
    }
  };

  const dbType = env["DB_TYPE"] || "desconhecido";
  const dbHost = env["DB_HOST"] || "localhost";
  const dbPort = env["DB_PORT"] || defaultPort(dbType);
  const dbName = env["DB_NAME"] || "";
  const r2Bucket = env["R2_BUCKET"] || "";
  const r2Endpoint = env["R2_ENDPOINT"] || "";
  const repository =
    env["RESTIC_REPOSITORY"] ||
    (r2Endpoint && r2Bucket
      ? `s3:${r2Endpoint.replace(/\/+$/, "")}/${r2Bucket}`
      : "Configurado no container");

  const exec = await backupContainer.exec({
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    Cmd: [
      "bash",
      "-c",
      `
set -Eeuo pipefail
export RESTIC_REPOSITORY="\${RESTIC_REPOSITORY:-s3:\${R2_ENDPOINT%/}/\${R2_BUCKET}}"
export AWS_DEFAULT_REGION="\${AWS_DEFAULT_REGION:-auto}"
restic snapshots --json
      `,
    ],
  });

  const stream = await exec.start({ hijack: true, stdin: false });
  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();
  let stdout = "";
  let stderr = "";

  stdoutStream.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  stderrStream.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  docker.modem.demuxStream(stream, stdoutStream, stderrStream);

  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
    setTimeout(() => resolve(), 35000);
  });

  let snapshots: ResticSnapshot[] = [];
  let isInitialized = false;
  let inspectionError: string | undefined = undefined;

  const trimmedOut = stdout.trim();
  if (trimmedOut.startsWith("[") && trimmedOut.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmedOut) as ResticSnapshot[];
      if (Array.isArray(parsed)) {
        snapshots = parsed.sort(
          (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
        );
        isInitialized = true;
      }
    } catch (err) {
      inspectionError = `Falha ao interpretar lista de snapshots: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  } else {
    const combinedLog = (stderr + "\n" + stdout).trim();
    if (
      combinedLog.includes("Is there a repository at the following location?") ||
      combinedLog.includes("unable to open config file") ||
      combinedLog.includes("no such file or directory") ||
      combinedLog.includes("repository does not exist")
    ) {
      isInitialized = false;
      inspectionError =
        "Repositório R2/S3 ainda não foi inicializado ou nenhum snapshot foi criado ainda.";
    } else if (combinedLog.length > 0) {
      inspectionError = combinedLog;
    }
  }

  return {
    repository,
    dbType,
    dbName,
    dbHost,
    dbPort,
    totalSnapshots: snapshots.length,
    latestSnapshot: snapshots[0] || null,
    snapshots,
    isInitialized,
    error: inspectionError,
    backupContainerId: resolved.backupContainerId,
    backupContainerName: resolved.backupContainerName,
  };
}

/**
 * Executes a safety restore of a specific or latest snapshot from Cloudflare R2 / S3.
 * Requires typed confirmation to prevent accidental data loss.
 */
export async function executeResticRestore(
  containerId: string,
  snapshotId: string = "latest",
  confirmText: string,
): Promise<ContainerBackupRestoreResult> {
  const resolved = await resolveBackupContainer(containerId);
  if (!resolved) {
    throw new Error(
      "Container de backup não encontrado ou não configurado para este serviço. Certifique-se de que o container utilize a imagem felipesdam496/backup-toolkit.",
    );
  }

  const normalizedConfirm = confirmText.trim().toLowerCase();
  const validTarget = resolved.targetContainerName.toLowerCase();
  const validBackup = resolved.backupContainerName.toLowerCase();

  const isConfirmed =
    normalizedConfirm === "restaurar" ||
    normalizedConfirm === validTarget ||
    normalizedConfirm === validBackup;

  if (!isConfirmed) {
    throw new Error(
      `Confirmação inválida. É obrigatório digitar 'RESTAURAR' ou o nome do container ('${resolved.targetContainerName}') para autorizar esta operação crítica de restauração.`,
    );
  }

  const backupContainer = docker.getContainer(resolved.backupContainerId);
  const inspect = await backupContainer.inspect();
  if (!inspect.State.Running) {
    await backupContainer.start();
    await new Promise((r) => setTimeout(r, 4000));
  }

  const safeSnapshotId = (snapshotId || "latest")
    .trim()
    .replace(/[^a-zA-Z0-9_\-.:]/g, "");

  const exec = await backupContainer.exec({
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    Cmd: [
      "bash",
      "-c",
      `
set -Eeuo pipefail
export RESTIC_REPOSITORY="\${RESTIC_REPOSITORY:-s3:\${R2_ENDPOINT%/}/\${R2_BUCKET}}"
export AWS_DEFAULT_REGION="\${AWS_DEFAULT_REGION:-auto}"
export DB_PORT="\${DB_PORT:-$(case "\${DB_TYPE:-}" in mysql|mariadb) echo 3306;; postgres|postgresql) echo 5432;; mongodb|mongo) echo 27017;; esac)}"

echo "=========================================================="
echo " [HARBORX] RESTAURAÇÃO CRÍTICA DE BANCO DE DADOS"
echo "=========================================================="
echo "Timestamp: $(date -Is)"
echo "Alvo: \${DB_TYPE} em \${DB_HOST}:\${DB_PORT} (Banco: \${DB_NAME})"
echo "Repositório: \${RESTIC_REPOSITORY}"
echo "Snapshot Solicitado: ${safeSnapshotId}"
echo "=========================================================="
echo ""

restore_dir="$(mktemp -d)"
trap 'rm -rf "$restore_dir"' EXIT

echo "▶ [1/3] Conectando ao R2/S3 e descarregando snapshot '${safeSnapshotId}'..."
restic restore "${safeSnapshotId}" --target "$restore_dir"
echo "✓ Snapshot descarregado com sucesso."
echo ""

echo "▶ [2/3] Localizando arquivo de dump no snapshot extraído..."
case "\${DB_TYPE}" in
  postgres|postgresql)
    target_file=$(find "$restore_dir" -type f \\( -name "postgres.dump" -o -name "*.dump" -o -name "*.sql" \\) | head -n 1)
    if [ -z "$target_file" ]; then
      echo "ERRO: Arquivo de dump PostgreSQL (.dump ou .sql) não encontrado no snapshot." >&2
      exit 1
    fi
    echo "✓ Arquivo localizado: $(basename "$target_file") ($(du -h "$target_file" | cut -f1))"
    echo ""
    echo "▶ [3/3] Aplicando restauração no PostgreSQL (\${DB_NAME})..."
    /usr/local/bin/restore-postgres.sh "$target_file" || ( [ $? -eq 1 ] && echo "Avisos de esquema tolerados pelo pg_restore." )
    ;;
  mysql|mariadb)
    target_file=$(find "$restore_dir" -type f \\( -name "mysql.sql.gz" -o -name "*.sql.gz" -o -name "*.sql" \\) | head -n 1)
    if [ -z "$target_file" ]; then
      echo "ERRO: Arquivo de dump MySQL (.sql.gz ou .sql) não encontrado no snapshot." >&2
      exit 1
    fi
    echo "✓ Arquivo localizado: $(basename "$target_file") ($(du -h "$target_file" | cut -f1))"
    echo ""
    echo "▶ [3/3] Aplicando restauração no MySQL (\${DB_NAME})..."
    /usr/local/bin/restore-mysql.sh "$target_file"
    ;;
  mongodb|mongo)
    target_file=$(find "$restore_dir" -type f \\( -name "mongodb.archive.gz" -o -name "*.archive.gz" -o -name "*.archive" \\) | head -n 1)
    if [ -z "$target_file" ]; then
      echo "ERRO: Arquivo de dump MongoDB (.archive.gz ou .archive) não encontrado no snapshot." >&2
      exit 1
    fi
    echo "✓ Arquivo localizado: $(basename "$target_file") ($(du -h "$target_file" | cut -f1))"
    echo ""
    echo "▶ [3/3] Aplicando restauração no MongoDB (\${DB_NAME})..."
    /usr/local/bin/restore-mongodb.sh "$target_file"
    ;;
  *)
    echo "ERRO: Tipo de banco '\${DB_TYPE}' não reconhecido para restauração automática." >&2
    exit 1
    ;;
esac

echo ""
echo "HARBORX_RESTORE_SUCCESS"
echo "=========================================================="
echo " [HARBORX] RESTAURAÇÃO CONCLUÍDA COM SUCESSO!"
echo "=========================================================="
      `,
    ],
  });

  const stream = await exec.start({ hijack: true, stdin: false });
  let logOutput = "";
  const outStream = new PassThrough();
  outStream.on("data", (chunk: Buffer) => {
    logOutput += chunk.toString("utf8");
  });
  docker.modem.demuxStream(stream, outStream, outStream);

  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
    setTimeout(() => resolve(), 300000); // 5 minutes timeout
  });

  const execInspect = await exec.inspect();
  const isSuccess =
    execInspect.ExitCode === 0 || logOutput.includes("HARBORX_RESTORE_SUCCESS");

  if (!isSuccess) {
    throw new Error(
      `Falha na execução da restauração (ExitCode ${execInspect.ExitCode}): ${
        logOutput.slice(-500).trim() ||
        "Erro desconhecido durante execução do script de restauração"
      }`,
    );
  }

  return {
    success: true,
    log: logOutput,
    message: `Backup restaurado com sucesso a partir do snapshot '${safeSnapshotId}'.`,
  };
}
