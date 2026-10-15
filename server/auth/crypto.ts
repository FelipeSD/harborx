import crypto from "node:crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit nonce for GCM
const SALT = "harborx-credential-vault-salt-v1";

// Derive a consistent 32-byte key from the configured secret
const encryptionKey = crypto.scryptSync(config.secret, SALT, 32);

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: `iv.authTag.ciphertext` (hex encoded).
 */
export function encryptCredential(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}.${authTag}.${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM string formatted as `iv.authTag.ciphertext`.
 */
export function decryptCredential(encryptedPayload: string): string {
  const parts = encryptedPayload.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }

  const [ivHex, authTagHex, cipherHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
