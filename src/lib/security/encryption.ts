/**
 * AES-256-GCM envelope encryption for provider tokens.
 *
 * OAuth refresh tokens and third-party API keys are stored encrypted in
 * `integration_credentials`. That table is never readable by the browser: RLS
 * denies it to all client roles and only server code holding ENCRYPTION_KEY can
 * decrypt what it contains.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = "v1";

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new EncryptionError(
      "ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new EncryptionError("ENCRYPTION_KEY must be valid base64.");
  }
  if (key.length !== 32) {
    throw new EncryptionError(
      `ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}.`,
    );
  }
  cachedKey = key;
  return key;
}

/** True when encryption is available in this environment. */
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a UTF-8 string into a self-describing `v1:iv:tag:ciphertext` token. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a token produced by `encryptSecret`. Throws if tampered with. */
export function decryptSecret(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new EncryptionError("Stored secret is not in a recognised format.");
  }
  const key = getKey();
  const iv = Buffer.from(parts[1] ?? "", "base64");
  const authTag = Buffer.from(parts[2] ?? "", "base64");
  const ciphertext = Buffer.from(parts[3] ?? "", "base64");
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new EncryptionError("Stored secret has an invalid envelope.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new EncryptionError("Stored secret could not be decrypted.");
  }
}

/** Constant-time comparison for shared secrets such as CRON_SECRET. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a ?? "", "utf8");
  const right = Buffer.from(b ?? "", "utf8");
  if (left.length !== right.length) {
    // Still perform a comparison so timing does not leak the length.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Render a secret for display without revealing it. Used anywhere the UI needs
 * to confirm that a credential exists.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "Not set";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 3)}••••••••${value.slice(-2)}`;
}
