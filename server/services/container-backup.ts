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
  backupContainer?: BackupContainerSummary;
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
  const envKeys = envList.map((e) => e.split("=")[0].toUpperCase());

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
  docker.modem.demuxStream(
    stream,
    {
      write: (chunk: Buffer) => {
        logOutput += chunk.toString("utf8");
      },
    },
    {
      write: (chunk: Buffer) => {
        logOutput += chunk.toString("utf8");
      },
    },
  );

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
