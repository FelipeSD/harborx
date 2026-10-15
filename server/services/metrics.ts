import os from "node:os";
import { db } from "../db/index.js";
import { docker } from "../docker.js";

interface CpuSample {
  idle: number;
  total: number;
}

let lastCpuSample: CpuSample | null = null;
let collectorTimer: NodeJS.Timeout | null = null;
let diskTimer: NodeJS.Timeout | null = null;

let cachedDiskUsage = {
  diskUsed: 0,
  diskTotal: 100 * 1024 * 1024 * 1024,
};
let isUpdatingDisk = false;

export async function refreshDiskUsage(): Promise<void> {
  if (isUpdatingDisk) return;
  isUpdatingDisk = true;
  try {
    const df = await docker.df();
    let diskUsed = df.LayersSize || 0;
    if (Array.isArray(df.Images)) {
      for (const img of df.Images) {
        diskUsed += img.Size || 0;
      }
    }
    if (Array.isArray(df.Containers)) {
      for (const cont of df.Containers) {
        diskUsed += cont.SizeRw || 0;
      }
    }
    const diskTotal = Math.max(diskUsed * 2, 100 * 1024 * 1024 * 1024);
    cachedDiskUsage = { diskUsed, diskTotal };
  } catch {
    // Docker df might fail if engine is temporarily unreachable
  } finally {
    isUpdatingDisk = false;
  }
}

function getCpuSample(): CpuSample {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }

  return { idle, total };
}

function calculateCpuPercent(): number {
  const currentSample = getCpuSample();
  if (!lastCpuSample) {
    lastCpuSample = currentSample;
    return 0;
  }

  const idleDiff = currentSample.idle - lastCpuSample.idle;
  const totalDiff = currentSample.total - lastCpuSample.total;
  lastCpuSample = currentSample;

  if (totalDiff <= 0) return 0;
  const cpuPercent = Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100));
  return Math.round(cpuPercent * 10) / 10;
}

export async function collectHostMetric(): Promise<void> {
  try {
    const ts = new Date().toISOString();
    const cpuPercent = calculateCpuPercent();

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);

    const { diskUsed, diskTotal } = cachedDiskUsage;

    db.prepare(
      `
      INSERT OR REPLACE INTO host_metrics (ts, cpu_percent, mem_used_bytes, mem_total_bytes, disk_used_bytes, disk_total_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(ts, cpuPercent, usedMem, totalMem, diskUsed, diskTotal);

    // Prune entries older than 24h
    db.prepare(`DELETE FROM host_metrics WHERE ts < datetime('now', '-24 hours')`).run();
  } catch (err) {
    console.error("[HarborX Metrics] Failed to collect host metrics:", err);
  }
}

export function startMetricsCollector(intervalMs = 60000): void {
  if (collectorTimer) return;

  // Initialize first sample
  lastCpuSample = getCpuSample();

  // Run initial disk usage calculation in background without blocking
  void refreshDiskUsage();

  // Refresh disk usage every 5 minutes in background
  diskTimer = setInterval(
    () => {
      void refreshDiskUsage();
    },
    5 * 60 * 1000,
  );

  // Run immediate initial sample
  void collectHostMetric();

  collectorTimer = setInterval(() => {
    void collectHostMetric();
  }, intervalMs);
}

export function stopMetricsCollector(): void {
  if (collectorTimer) {
    clearInterval(collectorTimer);
    collectorTimer = null;
  }
  if (diskTimer) {
    clearInterval(diskTimer);
    diskTimer = null;
  }
}

export interface HostMetricPoint {
  ts: string;
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  diskUsedGb: number;
  diskTotalGb: number;
}

export function getHostMetricsHistory(hours = 24): HostMetricPoint[] {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const rows = db
    .prepare(
      `
    SELECT ts, cpu_percent, mem_used_bytes, mem_total_bytes, disk_used_bytes, disk_total_bytes
    FROM host_metrics
    WHERE ts >= ?
    ORDER BY ts ASC
  `,
    )
    .all(cutoff) as Array<{
    ts: string;
    cpu_percent: number;
    mem_used_bytes: number;
    mem_total_bytes: number;
    disk_used_bytes: number;
    disk_total_bytes: number;
  }>;

  return rows.map((r) => ({
    ts: r.ts,
    cpuPercent: r.cpu_percent,
    memUsedMb: Math.round(r.mem_used_bytes / (1024 * 1024)),
    memTotalMb: Math.round(r.mem_total_bytes / (1024 * 1024)),
    diskUsedGb: Math.round((r.disk_used_bytes / (1024 * 1024 * 1024)) * 10) / 10,
    diskTotalGb: Math.round((r.disk_total_bytes / (1024 * 1024 * 1024)) * 10) / 10,
  }));
}
