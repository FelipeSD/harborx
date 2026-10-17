import { db } from "../db/index.js";
import { decryptCredential, encryptCredential } from "../auth/crypto.js";
import type { R2BackupSettings } from "../../shared/types.js";

const R2_SETTINGS_KEY = "r2_backup_defaults";

interface StoredR2Settings {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  encryptedSecretAccessKey?: string | undefined;
  encryptedResticPassword?: string | undefined;
  intervalSeconds?: number | undefined;
  keepDaily?: number | undefined;
  keepWeekly?: number | undefined;
  keepMonthly?: number | undefined;
}

export function getR2BackupSettings(decryptSecrets = false): R2BackupSettings | null {
  const row = db
    .prepare("SELECT value_json FROM integration_settings WHERE key = ?")
    .get(R2_SETTINGS_KEY) as { value_json: string } | undefined;

  if (!row) return null;

  try {
    const stored = JSON.parse(row.value_json) as StoredR2Settings;
    let secretAccessKey: string | undefined = undefined;
    let resticPassword: string | undefined = undefined;

    if (decryptSecrets) {
      if (stored.encryptedSecretAccessKey) {
        try {
          secretAccessKey = decryptCredential(stored.encryptedSecretAccessKey);
        } catch {
          secretAccessKey = undefined;
        }
      }
      if (stored.encryptedResticPassword) {
        try {
          resticPassword = decryptCredential(stored.encryptedResticPassword);
        } catch {
          resticPassword = undefined;
        }
      }
    }

    return {
      endpoint: stored.endpoint,
      bucket: stored.bucket,
      accessKeyId: stored.accessKeyId,
      secretAccessKey,
      resticPassword,
      hasSecretKey: Boolean(stored.encryptedSecretAccessKey),
      hasResticPassword: Boolean(stored.encryptedResticPassword),
      intervalSeconds: stored.intervalSeconds ?? 86400,
      keepDaily: stored.keepDaily ?? 7,
      keepWeekly: stored.keepWeekly ?? 4,
      keepMonthly: stored.keepMonthly ?? 12,
    };
  } catch {
    return null;
  }
}

export function saveR2BackupSettings(settings: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey?: string | undefined;
  resticPassword?: string | undefined;
  intervalSeconds?: number | undefined;
  keepDaily?: number | undefined;
  keepWeekly?: number | undefined;
  keepMonthly?: number | undefined;
}): void {
  // Check if there are existing stored settings so we preserve encrypted secrets if not passed
  const existing = getR2BackupSettings(true);

  let encryptedSecretAccessKey = existing?.secretAccessKey
    ? encryptCredential(existing.secretAccessKey)
    : undefined;
  if (settings.secretAccessKey && settings.secretAccessKey.trim()) {
    encryptedSecretAccessKey = encryptCredential(settings.secretAccessKey.trim());
  }

  let encryptedResticPassword = existing?.resticPassword
    ? encryptCredential(existing.resticPassword)
    : undefined;
  if (settings.resticPassword && settings.resticPassword.trim()) {
    encryptedResticPassword = encryptCredential(settings.resticPassword.trim());
  }

  const stored: StoredR2Settings = {
    endpoint: settings.endpoint.trim(),
    bucket: settings.bucket.trim(),
    accessKeyId: settings.accessKeyId.trim(),
    encryptedSecretAccessKey,
    encryptedResticPassword,
    intervalSeconds: settings.intervalSeconds ?? 86400,
    keepDaily: settings.keepDaily ?? 7,
    keepWeekly: settings.keepWeekly ?? 4,
    keepMonthly: settings.keepMonthly ?? 12,
  };

  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO integration_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `,
  ).run(R2_SETTINGS_KEY, JSON.stringify(stored), now);
}
