import type { Request } from "express";
import { HttpError } from "./http.js";

/**
 * Cloudflare Turnstile: a free bot check with no puzzle for people. The sign-up and login pages
 * show the widget, which hands the browser a token; the server asks Cloudflare whether the token
 * is good before doing anything else. Off without TURNSTILE_SECRET_KEY (the classroom laptop has
 * no internet, and a site key only works on the address it was made for).
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileOn = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

export async function requireHuman(req: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  const token = typeof req.body?.turnstileToken === "string" ? req.body.turnstileToken : "";
  if (!token) throw new HttpError(400, "Wait for the check that you're not a bot to finish, then try again.");
  let success = false;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    success = response.ok && ((await response.json()) as { success?: boolean }).success === true;
  } catch {
    // Cloudflare can't be reached: let people in rather than lock everyone out
    return;
  }
  if (!success) throw new HttpError(400, "The check that you're not a bot didn't pass. Refresh the page and try again.");
}
