import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "./db.js";
import { ID_TYPES } from "./identity.js";
import { redis } from "./redis.js";

/**
 * The first check of an uploaded ID, license or permit (the plan's "Level 1"). Claude looks at the
 * photo and says what kind of document it is — without being told what it should be, so it can't
 * be talked into agreeing — and Feasto compares that with what the person chose: a driver's
 * license when they picked "PhilSys ID" is caught, and so is a selfie, a meme, a sample picture
 * from the internet or a blurry photo.
 *
 * It runs twice, from one reading:
 * - during sign-up (and any later upload), so the person can fix it right away ("This looks like a
 *   driver's license, but you chose PhilSys ID");
 * - after the upload, saved for the admin, who still decides. It never approves anyone.
 *
 * Without ANTHROPIC_API_KEY it's simply off, and every upload is NOT_CHECKED (checked by hand, as before).
 *
 * Data privacy (RA 10173): the ID number itself is never stored, only a keyed hash to find the same
 * ID on two accounts, and nothing at all for a PhilSys (national) ID number. The photo is read, not
 * kept, until the account exists.
 */

export type DocumentKind = "RESIDENT_ID" | "LICENSE" | "PERMIT";
export type IdType = (typeof ID_TYPES)[number];

/** What the model may answer for "what is this", besides the IDs Feasto accepts */
const SEEN = [...ID_TYPES, "OTHER_ID", "BUSINESS_DOCUMENT", "OTHER_DOCUMENT", "NOT_A_DOCUMENT"] as const;
type Seen = (typeof SEEN)[number];

export const ID_LABEL: Record<IdType, string> = {
  PHILSYS: "PhilSys National ID",
  DRIVERS_LICENSE: "driver's license",
  PASSPORT: "passport",
  UMID: "UMID",
  SSS: "SSS ID",
  PRC: "PRC ID",
  POSTAL: "postal ID",
  VOTERS: "voter's ID",
  PHILHEALTH: "PhilHealth ID",
  TIN: "TIN ID",
  SENIOR: "senior citizen ID",
  PWD: "PWD ID",
  STUDENT: "school ID",
};
const isIdType = (v: string): v is IdType => (ID_TYPES as readonly string[]).includes(v);

/** Cards that are the same thing under two names */
const ALSO: Partial<Record<IdType, IdType[]>> = { SSS: ["UMID"], UMID: ["SSS"] };

const Reading = z.object({
  is_document: z.boolean().describe("True if the image is a photo or scan of a real-world identity or business document at all"),
  kind: z
    .enum(SEEN)
    .describe(
      "Which document this is. PHILSYS: PhilSys national ID card or ePhilID (paper or digital). DRIVERS_LICENSE: LTO driver's license, card or eGov/LTMS digital. " +
        "PASSPORT: Philippine or foreign passport. UMID: the Unified Multi-Purpose ID card. SSS: an SSS ID that isn't a UMID. PRC: PRC professional ID. " +
        "POSTAL: PHLPost postal ID. VOTERS: COMELEC voter's ID or voter's certification. PHILHEALTH: PhilHealth ID or member card. TIN: BIR TIN ID. " +
        "SENIOR: senior citizen (OSCA) ID. PWD: PWD ID. STUDENT: a school or university ID. OTHER_ID: any other ID card (company ID, barangay ID, NBI or police clearance, foreign ID). " +
        "BUSINESS_DOCUMENT: mayor's or business permit, DTI business name certificate, SEC registration, BIR certificate of registration (2303), FDA license to operate. " +
        "OTHER_DOCUMENT: any other paper or form. NOT_A_DOCUMENT: a selfie, a face, food, a screenshot of an app, a meme, a blank image, or anything that isn't a document.",
    ),
  document_type: z.string().describe("What it is, in a few plain words, e.g. \"PhilSys national ID\", \"LTO driver's license\", \"Mayor's permit\", \"A selfie\""),
  name: z.string().describe("The person's or business's name as printed, or empty if unreadable"),
  birth_date: z.string().describe("Birth date as printed, as YYYY-MM-DD if possible, or empty"),
  expires_on: z.string().describe("Expiry or validity end date as YYYY-MM-DD if printed, or empty"),
  document_number: z.string().describe("The ID, license or permit number as printed, or empty. Always empty for a PhilSys ID."),
  readable: z.boolean().describe("True if the name and the important text can be read clearly"),
  sample_or_template: z
    .boolean()
    .describe("True if it is a sample, specimen or template image rather than someone's real document: words like SAMPLE or SPECIMEN, a placeholder person such as Juan Dela Cruz, a mock-up, a drawing, or a stock picture from the internet"),
  screen_or_copy: z.boolean().describe("True if it looks like a photo of a screen, a printout of a photo, or an edited image. False for an official digital ID shown as issued (ePhilID, eGov license)."),
  concerns: z.array(z.string()).describe("Short plain reasons a reviewer should look closer, e.g. \"The photo on the ID is covered\". Only real problems, not general doubts. Empty if none."),
});

/** A reading as kept between the sign-up check and the saved one: no ID number, only its hash */
type Kept = Omit<z.infer<typeof Reading>, "document_number"> & { numberHash: string | null };

let client: Anthropic | null = null;
export const checkingOn = () => Boolean(process.env.ANTHROPIC_API_KEY);
const MODEL = process.env.DOCUMENT_CHECK_MODEL || "claude-opus-5-5";
/** A sign-up shouldn't wait longer than this; after it, the admin checks by hand */
const WAIT_MS = 30_000;
/** The same photo read once: the sign-up check is reused when the account's upload arrives */
const KEEP_SECONDS = 3 * 3600;

const MEDIA = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/** Names match when every word of the shorter is in the longer, ignoring case, dots and middle initials */
export function namesMatch(a: string, b: string) {
  const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  const [x, y] = [words(a), words(b)];
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.includes(w));
}

const numberHashOf = (number: string) =>
  createHash("sha256").update(Buffer.from(config.jwtSecret)).update(`:doc-number:${number.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`).digest("hex");

const readingKey = (data: Buffer) => `doc-reading:${createHash("sha256").update(data).digest("hex")}`;

/** Whether this exact file was read already (checking it again costs nothing, so isn't counted) */
export const alreadyRead = async (data: Buffer) => (await redis.exists(readingKey(data)).catch(() => 0)) === 1;

/** Claude's reading of one file, or why there's none. Kept for a few hours by the file's hash. */
async function readDocument(data: Buffer, extension: string): Promise<{ reading: Kept | null; failure: string | null }> {
  if (!checkingOn()) return { reading: null, failure: "The automatic check isn't set up, so check it by hand." };
  const key = readingKey(data);
  const kept = await redis.get(key).catch(() => null);
  if (kept) return { reading: JSON.parse(kept) as Kept, failure: null };

  const base64 = data.toString("base64");
  const source =
    extension === "pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: MEDIA[extension as keyof typeof MEDIA] ?? "image/jpeg", data: base64 } } as const);

  client ??= new Anthropic();
  try {
    const response = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: "low", format: zodOutputFormat(Reading) },
        system:
          "You read documents uploaded to Feasto, a food delivery app in Naval, Biliran, Philippines, before a human admin reviews them. " +
          "Say what the document really is from what you see, whatever anyone claims it is. Read only what is printed. Never guess a value you can't read: leave it empty. " +
          "Your answer helps the admin decide; it never approves anyone.",
        messages: [{ role: "user", content: [source, { type: "text", text: "What is this? Read it and fill in every field." }] }],
      },
      { timeout: WAIT_MS, maxRetries: 1 },
    );
    const parsed = response.parsed_output;
    if (!parsed) return { reading: null, failure: response.stop_reason === "refusal" ? "The automatic check declined to read it." : "The automatic check couldn't read it." };
    const { document_number, ...rest } = parsed;
    const reading: Kept = { ...rest, numberHash: document_number && rest.kind !== "PHILSYS" ? numberHashOf(document_number) : null };
    await redis.set(key, JSON.stringify(reading), "EX", KEEP_SECONDS).catch(() => undefined);
    return { reading, failure: null };
  } catch (error) {
    return { reading: null, failure: error instanceof Anthropic.APIError ? `The automatic check failed (${error.status ?? "no answer"}).` : "The automatic check failed." };
  }
}

export type Verdict = "LOOKS_REAL" | "REVIEW" | "NOT_A_DOCUMENT" | "NOT_CHECKED";

/** What the person uploading sees, and what the admin sees, from one reading */
export type Judgement = {
  verdict: Verdict;
  /** Why it can't be sent as it is (the person fixes it, or sends it anyway after trying again) */
  block: string | null;
  /** Worth knowing, but it can still be sent: the admin looks closer */
  warnings: string[];
  /** What it looks like, in words */
  seenAs: string | null;
  /** The kind of ID it seems to be, when that's not the one chosen (to offer "Change to …") */
  suggestIdType: IdType | null;
  /** The same in the admin's words, saved with the check */
  reasons: string[];
  nameMatches: boolean | null;
};

/** "a passport", "an SSS ID", "a UMID" */
const a = (words: string) => (/^([aeio]|SSS)/i.test(words) ? `an ${words}` : `a ${words}`);
const chosenWords = (kind: DocumentKind, idType: IdType | null) =>
  kind === "LICENSE" ? "driver's license" : kind === "PERMIT" ? "business permit" : idType ? ID_LABEL[idType] : "valid ID";

/** Compares a reading with what was asked for: the kind of document, the name, the dates */
/** `typedNumber` is the license or permit number typed on the form, compared by hash only */
export function judge(reading: Kept, kind: DocumentKind, idType: IdType | null, expectedName: string, typedNumber?: string | null): Judgement {
  const wanted: Seen[] =
    kind === "LICENSE" ? ["DRIVERS_LICENSE"] : kind === "PERMIT" ? ["BUSINESS_DOCUMENT"] : idType ? [idType, ...(ALSO[idType] ?? [])] : [...ID_TYPES];
  const chosen = chosenWords(kind, idType);
  const seenAs = isIdType(reading.kind) ? ID_LABEL[reading.kind] : reading.document_type.trim() || null;
  const reasons: string[] = [];
  const warnings: string[] = [];
  let block: string | null = null;
  let suggestIdType: IdType | null = null;

  if (!reading.is_document || reading.kind === "NOT_A_DOCUMENT") {
    const looks = reading.document_type.trim();
    const what = looks && !/not a document/i.test(looks) ? ` (it looks like ${looks[0].toLowerCase()}${looks.slice(1)})` : "";
    block = `This isn't ${a(chosen)}${what}. Take a photo of the front of your ${chosen}, with the text readable.`;
    return { verdict: "NOT_A_DOCUMENT", block, warnings, seenAs, suggestIdType, reasons: [`Not a document${what}.`], nameMatches: null };
  }

  if (reading.sample_or_template) {
    block = `This looks like a sample picture of ${a(chosen)}, not a real one. Take a photo of your own ${chosen}.`;
    reasons.push("It looks like a sample or template image, not a real document.");
  } else if (!wanted.includes(reading.kind)) {
    const seen = seenAs ?? "a different document";
    if (kind === "RESIDENT_ID" && isIdType(reading.kind)) {
      suggestIdType = reading.kind;
      block = idType
        ? `This looks like ${a(seen)}, but you chose ${chosen}. Change “Kind of ID” to ${ID_LABEL[reading.kind].replace(/^./, (c) => c.toUpperCase())}, or upload your ${chosen}.`
        : `This looks like ${a(seen)}. Choose that under “Kind of ID”.`;
    } else if (kind === "RESIDENT_ID") {
      block = `This looks like ${a(seen)}, which isn't one of the IDs Feasto accepts. Upload one from the “Kind of ID” list.`;
    } else if (kind === "LICENSE") {
      block = `This looks like ${a(seen)}, not a driver's license. Upload your LTO driver's license (the card, or the eGov digital license).`;
    } else {
      block = `This looks like ${a(seen)}, not a business permit. Upload your mayor's or business permit, or your DTI or SEC registration.`;
    }
    reasons.push(idType || kind !== "RESIDENT_ID" ? `It looks like ${a(seen)}, not the ${chosen} chosen.` : `It looks like ${a(seen)}, not an accepted ID.`);
  } else if (!reading.readable) {
    block = "The text on it can't be read clearly. Take the photo again close up, in good light, without glare.";
    reasons.push("Parts of it can't be read clearly.");
  }

  if (reading.screen_or_copy) {
    warnings.push("It looks like a photo of a screen, a printout or an edited picture. A photo of the real card is checked faster.");
    reasons.push("It may be a photo of a screen, a printout or an edited image.");
  }
  const today = new Date().toISOString().slice(0, 10);
  if (reading.expires_on && /^\d{4}-\d{2}-\d{2}$/.test(reading.expires_on) && reading.expires_on < today) {
    warnings.push(`It looks expired (${reading.expires_on}). The admin may not accept an expired ${chosen}.`);
    reasons.push(`It expired on ${reading.expires_on}.`);
  }
  const nameMatches = reading.name && expectedName ? namesMatch(reading.name, expectedName) : null;
  if (nameMatches === false) {
    warnings.push(
      kind === "PERMIT"
        ? `The name on it looks like “${reading.name}”, not “${expectedName}”. Check the business name you typed.`
        : `The name on it looks like “${reading.name}”, but the account says “${expectedName}”. If you typed your name differently from your ID, fix it.`,
    );
    reasons.push(`The name on it (${reading.name}) isn't the account's (${expectedName}).`);
  }
  if (!block && typedNumber?.trim() && reading.numberHash && numberHashOf(typedNumber) !== reading.numberHash) {
    warnings.push(`The number on it isn't the ${kind === "PERMIT" ? "permit" : "license"} number you typed. Check it.`);
    reasons.push(`The number on it isn't the ${kind === "PERMIT" ? "permit" : "license"} number given.`);
  }
  reasons.push(...reading.concerns);

  const verdict: Verdict = reasons.length === 0 ? "LOOKS_REAL" : "REVIEW";
  return { verdict, block, warnings, seenAs, suggestIdType, reasons, nameMatches };
}

const notChecked = (failure: string | null): Judgement => ({
  verdict: "NOT_CHECKED",
  block: null,
  warnings: [],
  seenAs: null,
  suggestIdType: null,
  reasons: [failure ?? "Check it by hand."],
  nameMatches: null,
});

/** The check while the person is still on the form: nothing is saved but the reading */
export async function precheckDocument(data: Buffer, extension: string, kind: DocumentKind, idType: IdType | null, expectedName: string, typedNumber?: string | null) {
  const { reading, failure } = await readDocument(data, extension);
  const result = reading ? judge(reading, kind, idType, expectedName, typedNumber) : notChecked(failure);
  // The admin's wording and the name read stay on the server
  const { reasons: _reasons, nameMatches: _nameMatches, ...forThem } = result;
  return forThem;
}

/** Reads one uploaded document and saves the verdict for the admin (once per file). Safe to run twice. */
export async function checkDocument(input: { file: string; kind: DocumentKind; userId: string | null }) {
  const done = await prisma.documentCheck.findUnique({ where: { file: input.file }, select: { id: true } });
  if (done) return;

  const extension = path.extname(input.file).slice(1);
  const data = await readFile(path.join(config.documentDir, input.file));
  const { reading, failure } = await readDocument(data, extension);
  if (!reading) {
    await prisma.documentCheck
      .create({ data: { file: input.file, kind: input.kind, userId: input.userId, verdict: "NOT_CHECKED", reasons: [failure ?? "Check it by hand."], model: checkingOn() ? MODEL : null } })
      .catch(() => undefined);
    return;
  }

  const owner = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId }, select: { name: true, idType: true, vendor: { select: { name: true, businessName: true, permitNumber: true } }, riderProfile: { select: { licenseNumber: true } } } })
    : null;
  const expectedName = input.kind === "PERMIT" ? (owner?.vendor?.businessName ?? owner?.vendor?.name ?? owner?.name ?? "") : (owner?.name ?? "");
  const idType = input.kind === "RESIDENT_ID" && owner?.idType && isIdType(owner.idType) ? owner.idType : null;
  const typedNumber = input.kind === "PERMIT" ? owner?.vendor?.permitNumber : input.kind === "LICENSE" ? owner?.riderProfile?.licenseNumber : null;
  const result = judge(reading, input.kind, idType, expectedName, typedNumber);

  // The same ID on another account. Never for a PhilSys number, which isn't kept in any form.
  if (reading.numberHash) {
    const elsewhere = await prisma.documentCheck.count({ where: { numberHash: reading.numberHash, userId: { not: input.userId } } });
    if (elsewhere > 0) result.reasons.push("The same document number was uploaded by another account.");
  }
  const verdict = result.verdict === "LOOKS_REAL" && result.reasons.length > 0 ? "REVIEW" : result.verdict;

  await prisma.documentCheck
    .create({
      data: {
        file: input.file,
        kind: input.kind,
        userId: input.userId,
        verdict,
        documentType: reading.document_type.slice(0, 80),
        nameOnDocument: reading.name.slice(0, 120) || null,
        birthDate: reading.birth_date.slice(0, 20) || null,
        expiresOn: reading.expires_on.slice(0, 20) || null,
        nameMatches: result.nameMatches,
        reasons: result.reasons.map((r) => r.slice(0, 200)).slice(0, 8),
        numberHash: reading.numberHash,
        model: MODEL,
      },
    })
    .catch(() => undefined);
}

/** The verdicts for files the admin is looking at */
export async function checksFor(files: (string | null | undefined)[]) {
  const list = files.filter((f): f is string => Boolean(f));
  if (!list.length) return new Map<string, Awaited<ReturnType<typeof prisma.documentCheck.findMany>>[number]>();
  const rows = await prisma.documentCheck.findMany({ where: { file: { in: list } } });
  return new Map(rows.map((r) => [r.file, r]));
}
