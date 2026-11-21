import type { Request } from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";
import { redis } from "./redis.js";

/**
 * Passkeys: the phone's or laptop's fingerprint, face or screen lock, used as a login step. Nothing
 * secret leaves the device: Feasto keeps a public key and checks a signature, so a passkey can't
 * be phished, guessed or read off a screen.
 *
 * A passkey belongs to a domain (its "RP ID"). On the classroom WiFi the address changes with the
 * network (192-168-1-175.local-ip.sh, 192-168-100-9.local-ip.sh, …), so those all use
 * "local-ip.sh", which isn't a public suffix: one passkey keeps working when the WiFi changes.
 */

const CHALLENGE_SECONDS = 5 * 60;

/** Where the request came from, as the browser says (it can't be changed by the page) */
export function originOf(req: Request) {
  const raw = req.get("origin");
  if (!raw) throw new HttpError(400, "Your browser didn't say where this came from. Try again in a normal browser window.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Your browser sent an address Feasto doesn't know.");
  }
  // Passkeys only work over HTTPS (or on the laptop itself)
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new HttpError(400, "Passkeys need a secure (https) address. Open Feasto through its https link.");
  return { origin: url.origin, rpId: rpIdFor(url.hostname) };
}

/** The domain a passkey belongs to: all the classroom addresses share one */
export const rpIdFor = (hostname: string) => (hostname.endsWith(".local-ip.sh") ? "local-ip.sh" : hostname);

const regKey = (userId: string) => `passkey-reg:${userId}`;
const authKey = (userId: string) => `passkey-auth:${userId}`;

/** What the browser needs to make a new passkey for this account */
export async function registrationOptions(req: Request, userId: string) {
  const { rpId } = originOf(req);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true, passkeys: { select: { credentialId: true, transports: true } } } });
  const options = await generateRegistrationOptions({
    rpName: "Feasto",
    rpID: rpId,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    // The same device can't be added twice
    excludeCredentials: user.passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await redis.set(regKey(userId), JSON.stringify({ challenge: options.challenge, rpId }), "EX", CHALLENGE_SECONDS);
  return options;
}

/** Checks the new passkey and keeps its public key */
export async function saveRegistration(req: Request, userId: string, response: RegistrationResponseJSON, label: string) {
  const saved = await redis.get(regKey(userId));
  if (!saved) throw new HttpError(410, "That took too long. Try adding the passkey again.");
  const { challenge, rpId } = JSON.parse(saved) as { challenge: string; rpId: string };
  const { origin } = originOf(req);
  let result;
  try {
    result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpId, requireUserVerification: true });
  } catch {
    throw new HttpError(400, "The passkey couldn't be checked. Try again.");
  }
  if (!result.verified) throw new HttpError(400, "The passkey couldn't be checked. Try again.");
  await redis.del(regKey(userId));
  const { credential, credentialBackedUp } = result.registrationInfo;
  return prisma.passkey.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      rpId,
      label,
      backedUp: credentialBackedUp,
    },
    select: { id: true, label: true, createdAt: true },
  });
}

/** What the browser needs to sign in with one of this account's passkeys, on this address */
export async function authenticationOptions(req: Request, userId: string) {
  const { rpId } = originOf(req);
  const passkeys = await prisma.passkey.findMany({ where: { userId, rpId }, select: { credentialId: true, transports: true } });
  if (passkeys.length === 0) {
    const elsewhere = await prisma.passkey.count({ where: { userId } });
    throw new HttpError(409, elsewhere ? "Your passkey was made on another Feasto address, so it doesn't work here. Use a code instead." : "This account has no passkey yet. Use a code instead.");
  }
  const options = await generateAuthenticationOptions({ rpID: rpId, allowCredentials: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })), userVerification: "required" });
  await redis.set(authKey(userId), options.challenge, "EX", CHALLENGE_SECONDS);
  return options;
}

/** Checks the signature against the account's passkey; true when it's right */
export async function checkAuthentication(req: Request, userId: string, response: AuthenticationResponseJSON) {
  const challenge = await redis.get(authKey(userId));
  if (!challenge) throw new HttpError(410, "That took too long. Try the passkey again.");
  const passkey = await prisma.passkey.findFirst({ where: { userId, credentialId: response.id } });
  if (!passkey) return false;
  const { origin } = originOf(req);
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: passkey.rpId,
      credential: { id: passkey.credentialId, publicKey: new Uint8Array(passkey.publicKey), counter: passkey.counter, transports: passkey.transports },
      requireUserVerification: true,
    });
    if (!result.verified) return false;
    await redis.del(authKey(userId));
    await prisma.passkey.update({ where: { id: passkey.id }, data: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() } });
    return true;
  } catch {
    return false;
  }
}
