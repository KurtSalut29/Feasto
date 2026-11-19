import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { config } from "../config.js";
import { HttpError, ValidationError } from "./http.js";
import { redis } from "./redis.js";

/**
 * Proving the email is really theirs before an account is made: Feasto emails a 6-digit code, the
 * person types it, and only then can they create the account (routes/auth.ts checks for the
 * "verified" mark). Codes live 10 minutes, a few wrong tries end one, and only a hash is kept.
 */

const CODE_MINUTES = 10;
/** After typing the right code, how long they have to finish the rest of the sign-up */
const VERIFIED_MINUTES = 45;
const RESEND_SECONDS = 60;
const SENDS_PER_HOUR = 5;
const MAX_TRIES = 5;

const codeKey = (email: string) => `signup-code:${email}`;
const verifiedKey = (email: string) => `signup-verified:${email}`;
/** Keyed with the server's secret, so a leaked hash can't be turned back into the code by trying all million */
const hashOf = (email: string, code: string) => createHash("sha256").update(Buffer.from(config.jwtSecret)).update(`:${email}:${code}`).digest("hex");

export const mailReady = () => Boolean(config.mail.user && config.mail.pass);

let transport: nodemailer.Transporter | null = null;
function mailer() {
  transport ??= nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: { user: config.mail.user, pass: config.mail.pass },
    connectionTimeout: 10_000,
  });
  return transport;
}

/** Emails a new code. Refuses too soon after the last one, and more than a few an hour. */
export async function sendSignupCode(email: string) {
  if (!mailReady()) throw new HttpError(503, "Feasto can't send emails yet, so sign-ups are closed. Ask the admin to set up the email account.");
  const wait = await redis.ttl(`signup-code-wait:${email}`);
  if (wait > 0) throw new HttpError(429, `A code was just sent. You can ask for another in ${wait} seconds.`);
  const sent = await redis.incr(`signup-code-sends:${email}`);
  if (sent === 1) await redis.expire(`signup-code-sends:${email}`, 3600);
  if (sent > SENDS_PER_HOUR) throw new HttpError(429, "Too many codes for this email. Try again in an hour.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await redis.set(codeKey(email), JSON.stringify({ hash: hashOf(email, code), tries: 0 }), "EX", CODE_MINUTES * 60);
  await redis.set(`signup-code-wait:${email}`, "1", "EX", RESEND_SECONDS);
  await redis.del(verifiedKey(email));
  try {
    await mailer().sendMail({
      from: config.mail.from.includes("<") ? config.mail.from : `"Feasto" <${config.mail.from}>`,
      to: email,
      subject: `${code} is your Feasto code`,
      text: `Your Feasto code is ${code}.\n\nType it on the sign-up page to confirm this is your email. It works for ${CODE_MINUTES} minutes.\n\nIf you didn't sign up for Feasto, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1f2937">
  <p style="font-size:20px;font-weight:700;color:#d24600;margin:0 0 16px">Feasto</p>
  <p style="margin:0 0 8px">Your code to finish signing up:</p>
  <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:8px 0 16px">${code}</p>
  <p style="margin:0 0 8px;color:#6b7280">Type it on the sign-up page. It works for ${CODE_MINUTES} minutes.</p>
  <p style="margin:16px 0 0;color:#9ca3af;font-size:13px">If you didn't sign up for Feasto, ignore this email.</p>
</div>`,
    });
  } catch {
    await redis.del(codeKey(email), `signup-code-wait:${email}`);
    throw new HttpError(502, "We couldn't send the code just now. Check the email address and try again in a moment.");
  }
  return { minutes: CODE_MINUTES, resendSeconds: RESEND_SECONDS };
}

/** Checks a typed code; the right one marks the email verified for the rest of the sign-up */
export async function checkSignupCode(email: string, code: string) {
  const raw = await redis.get(codeKey(email));
  if (!raw) throw new ValidationError({ emailCode: ["This code has expired. Tap “Send a new code”."] });
  const saved = JSON.parse(raw) as { hash: string; tries: number };
  const right = timingSafeEqual(Buffer.from(saved.hash), Buffer.from(hashOf(email, code)));
  if (!right) {
    saved.tries += 1;
    if (saved.tries >= MAX_TRIES) {
      await redis.del(codeKey(email));
      throw new ValidationError({ emailCode: ["Too many wrong tries. Tap “Send a new code”."] });
    }
    await redis.set(codeKey(email), JSON.stringify(saved), "KEEPTTL");
    throw new ValidationError({ emailCode: [`That code isn't right. ${MAX_TRIES - saved.tries} ${MAX_TRIES - saved.tries === 1 ? "try" : "tries"} left.`] });
  }
  await redis.del(codeKey(email));
  await redis.set(verifiedKey(email), "1", "EX", VERIFIED_MINUTES * 60);
}

/** Whether the email was verified in this sign-up; used up when the account is made */
export async function emailVerified(email: string) {
  return (await redis.get(verifiedKey(email))) === "1";
}
export const forgetVerified = (email: string) => redis.del(verifiedKey(email));
