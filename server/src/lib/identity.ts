import { resolve4, resolveMx } from "node:dns/promises";
import { z } from "zod";

/**
 * Who someone is, checked as well as a sign-up form can: the name in parts as on a valid ID (no
 * numbers, symbols or obvious fakes), a strong password, and an email whose domain can really
 * receive mail (not a throwaway one, and no typo like gmial.com). A resident also uploads a valid
 * ID, which the admin checks against the name (routes/residentIds.ts).
 */

export const SUFFIXES = ["Jr.", "Sr.", "II", "III", "IV", "V"] as const;

/** Valid IDs accepted in the Philippines, plus a school ID for students */
export const ID_TYPES = [
  "PHILSYS",
  "DRIVERS_LICENSE",
  "PASSPORT",
  "UMID",
  "SSS",
  "PRC",
  "POSTAL",
  "VOTERS",
  "PHILHEALTH",
  "TIN",
  "SENIOR",
  "PWD",
  "STUDENT",
] as const;

// ---------- Names ----------

/** Letters (any language), with spaces, dots, hyphens and apostrophes inside: "Ma. Cristina", "O'Neil", "Dela Cruz-Reyes" */
const NAME = /^\p{L}[\p{L}\p{M} .'-]*$/u;
/** Words people type when they don't want to give a name */
const NOT_A_NAME = new Set(["test", "testing", "tester", "asdf", "asd", "qwerty", "admin", "user", "sample", "fake", "anonymous", "anon", "unknown", "none", "null", "xxx", "abc", "abcd", "name", "firstname", "lastname", "surname", "noname", "nobody"]);

/** "JUAN" or "juan" becomes "Juan"; "McDonald" and "dela Cruz" are left as typed */
function tidy(value: string) {
  const v = value.trim().replace(/\s+/g, " ");
  const oneCase = v === v.toLowerCase() || v === v.toUpperCase();
  return oneCase ? v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase()) : v;
}

const namePart = (what: string) =>
  z
    .string()
    .trim()
    .max(40, `The ${what} is too long.`)
    .refine((v) => !/\d/.test(v), `A ${what} has no numbers.`)
    .refine((v) => v === "" || NAME.test(v), `Use letters only in the ${what} (spaces, dots, hyphens and apostrophes are fine).`)
    .refine((v) => !/(\p{L})\1\1/iu.test(v), `That doesn't look like a real ${what}.`)
    .refine((v) => !NOT_A_NAME.has(v.toLowerCase().replace(/[^a-z]/g, "")), `Enter your real ${what}, as on your ID.`)
    .transform(tidy);

const required = (what: string) => namePart(what).refine((v) => v.replace(/[^\p{L}]/gu, "").length >= 2, `Enter your ${what}, as on your ID.`);
const optional = (what: string) =>
  z
    .union([namePart(what), z.literal("")])
    .optional()
    .transform((v) => v || null);

/** First, middle (optional), last and suffix (optional), as on a valid ID */
export const nameFields = {
  firstName: required("first name"),
  middleName: optional("middle name"),
  lastName: required("last name"),
  suffix: z
    .union([z.enum(SUFFIXES, "Choose a suffix from the list."), z.literal("")])
    .optional()
    .transform((v) => v || null),
};

export const fullName = (n: { firstName: string; middleName?: string | null; lastName: string; suffix?: string | null }) =>
  [n.firstName, n.middleName, n.lastName, n.suffix].filter(Boolean).join(" ");

// ---------- Passwords ----------

/** Passwords that meet the rules but everyone tries first */
const COMMON = new Set(["password1!", "password1@", "password123!", "p@ssw0rd", "p@ssword1", "p@ssw0rd1", "passw0rd!", "qwerty123!", "qwerty1!", "welcome1!", "welcome123!", "admin123!", "admin@123", "letmein1!", "iloveyou1!", "abc123!@#", "abcd1234!", "feasto123!", "feasto@123", "changeme1!", "12345678a!", "1q2w3e4r!"]);

/** The rules for a new password (sign-up, and changing it): 8+ characters, a small and a capital letter, a number and a special character */
export const newPassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "72 characters at most.")
  .regex(/[a-z]/, "Include a small letter (a–z).")
  .regex(/[A-Z]/, "Include a capital letter (A–Z).")
  .regex(/\d/, "Include a number (0–9).")
  .regex(/[^A-Za-z0-9\s]/, "Include a special character, like @ # $ % ! or *.")
  .refine((p) => !COMMON.has(p.toLowerCase()), "That password is too common. Choose another one.");

/** A password shouldn't contain the person's own name or email */
export function passwordHasOwnDetails(password: string, details: (string | null | undefined)[]) {
  const p = password.toLowerCase();
  return details.some((d) => {
    const word = (d ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return word.length >= 4 && p.includes(word);
  });
}

// ---------- Email ----------

/** Throwaway inboxes: they work for a few minutes, so nobody can be reached through them later */
const DISPOSABLE = new Set([
  "mailinator.com", "10minutemail.com", "10minutemail.net", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "grr.la", "yopmail.com", "yopmail.net",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmailo.com", "tempail.com", "trashmail.com", "trashmail.de", "getnada.com", "nada.email", "dispostable.com",
  "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "emailondeck.com", "mohmal.com", "burnermail.io", "mintemail.com", "mytemp.email", "spamgourmet.com",
  "mailnesia.com", "moakt.com", "tmail.ws", "tmpmail.org", "tmpmail.net", "minuteinbox.com", "discard.email", "inboxkitten.com", "1secmail.com", "1secmail.net",
]);

/** Misspelled big mail domains, and what was meant */
const TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.comm": "gmail.com", "gmali.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com", "yhoo.com": "yahoo.com", "yahho.com": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com", "homail.com": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.co": "outlook.com", "outlook.con": "outlook.com", "outllok.com": "outlook.com", "icloud.co": "icloud.com", "iclod.com": "icloud.com",
};

const DNS_MS = 3000;
const remembered = new Map<string, { ok: boolean; at: number }>();

/** Whether a domain has mail servers (or at least an address, which can take mail too). Unsure (no internet) counts as yes. */
async function domainTakesMail(domain: string) {
  const known = remembered.get(domain);
  if (known && Date.now() - known.at < 6 * 3600_000) return known.ok;
  const within = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), DNS_MS))]);
  const missing = (e: unknown) => ["ENOTFOUND", "ENODATA", "NXDOMAIN"].includes((e as { code?: string }).code ?? "");
  let ok = true;
  try {
    const mx = await within(resolveMx(domain));
    ok = mx.some((r) => r.exchange && r.exchange !== ".");
  } catch (e) {
    if (!missing(e)) return true; // no answer at all (offline classroom): don't block sign-ups
    try {
      ok = (await within(resolve4(domain))).length > 0;
    } catch (e2) {
      ok = !missing(e2);
    }
  }
  remembered.set(domain, { ok, at: Date.now() });
  return ok;
}

/** What's wrong with an email address beyond its format, or null. A typo comes with the fix. */
export async function emailProblem(email: string): Promise<{ message: string; suggestion?: string } | null> {
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  const fix = TYPOS[domain];
  if (fix) return { message: `Did you mean ${local}@${fix}?`, suggestion: `${local}@${fix}` };
  if (DISPOSABLE.has(domain) || [...DISPOSABLE].some((d) => domain.endsWith(`.${d}`))) {
    return { message: "Use your own email, not a temporary one. Feasto sends your receipts and account messages there." };
  }
  if (!(await domainTakesMail(domain))) return { message: `No email can be delivered to ${domain}. Check the spelling of your email.` };
  return null;
}
