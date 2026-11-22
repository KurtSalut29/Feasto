import { createHash } from "node:crypto";
import { config } from "../config.js";
import { notifyAdmin } from "./activity.js";
import { prisma } from "./db.js";
import { namesMatch } from "./documentCheck.js";
import { HttpError } from "./http.js";

/**
 * PhilSys (Level 2 of the ID check): the QR on the back of the National ID (PhilID) or the ePhilID.
 *
 * What Feasto does now, without eGov's approval:
 *   - reads the QR's details (name, birthday, card number) and compares them with the account;
 *   - keeps only a keyed hash of the card number, never the number itself (as the Data Privacy Act
 *     and the PhilSys Act ask), so one card can't verify two accounts;
 *   - shows the admin what matched, next to the photo. The admin still decides: a QR can be copied,
 *     and only PhilSys can confirm its signature.
 *
 * eVerify (PhilSys's own check) plugs in at `confirmWithPhilsys` once the group's application to
 * the eGov API portal is approved and its address and keys are in .env. Until then it's off, and
 * nothing is sent to anyone.
 */

export type QrReading = { firstName: string; middleName: string; lastName: string; birthDate: string | null; pcn: string | null; issuer: string | null; signed: boolean };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "January 01, 1990", "1990-01-01", "01/01/1990" → "1990-01-01" */
export function isoDate(text: string | undefined | null) {
  if (!text) return null;
  const t = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS.findIndex((x) => x.startsWith(m![1]!.toLowerCase().slice(0, 3)));
    if (month >= 0) return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return null;
}

/** Reads the PhilID or ePhilID QR's text (a signed JSON record). Null when it isn't one. */
export function parsePhilsysQr(text: string): QrReading | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const subject = (typeof record.subject === "object" && record.subject ? record.subject : record) as Record<string, unknown>;
  const find = (...keys: string[]) => {
    for (const [k, v] of Object.entries(subject)) if (keys.some((key) => key.toLowerCase() === k.toLowerCase()) && typeof v === "string") return v.trim();
    return "";
  };
  const firstName = find("fName", "firstName", "first_name", "givenName");
  const lastName = find("lName", "lastName", "last_name", "surname");
  if (!firstName || !lastName) return null;
  const pcn = find("PCN", "philsysCardNumber", "cardNumber", "PSN").replace(/\D/g, "");
  const issuer = typeof record.Issuer === "string" ? record.Issuer : typeof record.issuer === "string" ? record.issuer : null;
  return {
    firstName,
    middleName: find("mName", "middleName", "middle_name"),
    lastName,
    birthDate: isoDate(find("DOB", "dateOfBirth", "birthDate", "birth_date")),
    pcn: pcn.length >= 12 && pcn.length <= 19 ? pcn : null,
    issuer,
    signed: typeof record.signature === "string" && record.signature.length > 20,
  };
}

const pcnHashOf = (pcn: string) => createHash("sha256").update(Buffer.from(config.jwtSecret)).update(`:pcn:${pcn}`).digest("hex");

/** eVerify, once approved and connected: PhilSys confirms the QR. Not connected yet, so nothing is sent. */
export const everifyOn = () => Boolean(process.env.PHILSYS_EVERIFY_URL && process.env.PHILSYS_CLIENT_ID && process.env.PHILSYS_CLIENT_SECRET);
async function confirmWithPhilsys(_qr: string): Promise<boolean | null> {
  // The eGov API portal gives the request format with the approval; until then there's nothing to call.
  return null;
}

/** A resident's QR, compared with their account and kept (as a hash and the match) for the admin */
export async function recordPhilsysQr(userId: string, text: string) {
  const qr = parsePhilsysQr(text);
  if (!qr) throw new HttpError(400, "That isn't a PhilSys QR. Scan the QR on the back of your National ID, or on your ePhilID.");
  if (!qr.pcn) throw new HttpError(400, "The QR doesn't have a card number we can read. Try the QR on your ePhilID.");
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, firstName: true, middleName: true, lastName: true, birthDate: true, idStatus: true, role: true } });
  if (me.role !== "RESIDENT") throw new HttpError(403, "This is for residents.");
  const hash = pcnHashOf(qr.pcn);
  const other = await prisma.user.findFirst({ where: { pcnHash: hash, id: { not: userId } }, select: { id: true } });
  if (other) throw new HttpError(409, "This National ID is already on another Feasto account. Each card can be on one account.");
  const qrName = [qr.firstName, qr.middleName, qr.lastName].filter(Boolean).join(" ");
  const accountName = [me.firstName, me.middleName, me.lastName].filter(Boolean).join(" ") || me.name;
  const nameMatches = namesMatch(qrName, accountName);
  const birthDateMatches = me.birthDate && qr.birthDate ? me.birthDate.toISOString().slice(0, 10) === qr.birthDate : null;
  const confirmed = everifyOn() ? await confirmWithPhilsys(text).catch(() => null) : null;
  const match = { nameMatches, birthDateMatches, birthDateOnQr: Boolean(qr.birthDate), issuer: qr.issuer, signed: qr.signed, everify: confirmed };
  await prisma.user.update({
    where: { id: userId },
    data: { pcnHash: hash, philsysQrAt: new Date(), philsysMatch: match, ...(confirmed === true && { philsysVerifiedAt: new Date() }) },
  });
  if (me.idStatus === "PENDING") {
    await notifyAdmin({
      title: nameMatches ? "PhilSys QR matches a resident" : "PhilSys QR doesn't match a resident's name",
      body: `${me.name} scanned their National ID's QR: ${nameMatches ? "the name matches" : "the name is different"}${birthDateMatches === null ? "" : birthDateMatches ? ", the birthday matches" : ", the birthday is different"}.`,
      link: "/admin/resident-ids",
    });
  }
  return match;
}
