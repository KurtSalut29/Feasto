import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { redis } from "./redis.js";

/**
 * Two-step login with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy):
 * the standard time-based codes of RFC 6238. The app and Feasto share a secret once (the QR code);
 * after that both work out the same 6 digits from the time, every 30 seconds, without the internet.
 *
 * The secret is stored encrypted (AES-256-GCM, with a key made from the server's secret), a code
 * works once (a copied code can't be used again), and the backup codes are kept only as hashes.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
/** One step either side, for a phone clock a little off */
const WINDOW = 1;
const ISSUER = "Feasto";

// ---------- Base32, the alphabet authenticator apps use for the secret ----------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(text: string) {
  const clean = text.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Not base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---------- The codes ----------

/** The 6-digit code for one 30-second step (RFC 4226's HOTP over the step number) */
export function codeAt(secret: Buffer, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(number).padStart(DIGITS, "0");
}

export const stepOf = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);

/** The step a typed code belongs to (within one step of now), or null when it's wrong */
export function matchingStep(secret: Buffer, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = stepOf(now);
  for (let delta = -WINDOW; delta <= WINDOW; delta++) {
    const expected = Buffer.from(codeAt(secret, current + delta));
    if (timingSafeEqual(expected, Buffer.from(code))) return current + delta;
  }
  return null;
}

/**
 * Checks a code for a user, and uses it up: the same code (or an older one) can't be used again,
 * even on another API copy, because the last step used is kept in Redis.
 */
export async function useCode(userId: string, secret: Buffer, code: string) {
  const step = matchingStep(secret, code);
  if (step === null) return false;
  const key = `totp-last:${userId}`;
  const last = Number(await redis.get(key));
  if (last && step <= last) return false;
  await redis.set(key, String(step), "EX", STEP_SECONDS * (WINDOW * 2 + 2));
  return true;
}

// ---------- The secret, stored encrypted ----------

const key = () => createHash("sha256").update(Buffer.from(config.jwtSecret)).update(":totp-secret").digest();

export function newSecret() {
  return randomBytes(20);
}

export function sealSecret(secret: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(secret), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

export function openSecret(sealed: string) {
  const [, iv, tag, data] = sealed.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv!, "base64url"));
  decipher.setAuthTag(Buffer.from(tag!, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data!, "base64url")), decipher.final()]);
}

/** What the QR code holds: the app reads the secret, the name and the issuer from it */
export const otpauthUrl = (secret: Buffer, email: string) =>
  `otpauth://totp/${encodeURIComponent(`${ISSUER}:${email}`)}?secret=${base32(secret)}&issuer=${ISSUER}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

// ---------- Backup codes, for a lost phone ----------

const BACKUP_COUNT = 8;
const hashBackup = (userId: string, code: string) =>
  createHash("sha256").update(Buffer.from(config.jwtSecret)).update(`:backup:${userId}:${code.replace(/[\s-]/g, "").toLowerCase()}`).digest("hex");

/** Eight one-time codes like "k7m2-9qx4", shown once; only their hashes are kept */
export function newBackupCodes(userId: string) {
  const letters = "abcdefghjkmnpqrstuvwxyz23456789";
  const codes = Array.from({ length: BACKUP_COUNT }, () => {
    const raw = Array.from(randomBytes(8), (b) => letters[b % letters.length]).join("");
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, hashes: codes.map((c) => hashBackup(userId, c)) };
}

/** The hashes left after using `code`, or null when it isn't one of them */
export function useBackupCode(userId: string, hashes: string[], code: string) {
  const hash = hashBackup(userId, code);
  if (!hashes.includes(hash)) return null;
  return hashes.filter((h) => h !== hash);
}
