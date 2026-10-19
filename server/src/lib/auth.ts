import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { CookieOptions } from "express";
import { jwtVerify, SignJWT } from "jose";
import { config } from "../config.js";
import type { Role } from "../generated/prisma/enums.js";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SESSION_DAYS = 7;

export const SESSION_COOKIE = "feasto_session";

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true, // page scripts can't read it, which protects it from XSS
  sameSite: "lax",
  secure: config.cookieSecure,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
};

/**
 * Hashes a password with scrypt. Node runs scrypt on its worker thread pool,
 * so several logins are hashed in parallel without blocking other requests.
 * Stored as "scrypt$<salt>$<hash>".
 */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  // Constant-time comparison so response timing doesn't leak how close a guess was
  return timingSafeEqual(actual, expected);
}

export type Session = { userId: string; role: Role; name: string };

export function signSession(session: Session) {
  return new SignJWT({ role: session.role, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(config.jwtSecret);
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { userId: payload.sub, role: payload.role as Role, name: String(payload.name) };
  } catch {
    return null;
  }
}
