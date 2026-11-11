import type { RequestHandler } from "express";
import { sessionRevoked } from "../lib/accounts.js";
import { SESSION_COOKIE, verifySession, type Session } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import { hit, tooMany } from "../lib/rateLimit.js";
import { config } from "../config.js";
import type { Role } from "../generated/prisma/enums.js";

declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}


/**
 * Rejects the request with 401 unless it carries a valid session cookie of an account that isn't
 * disabled, signed after the account's last password change, and with 429 when that account is
 * flooding the API.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? await verifySession(token) : null;
  if (!session) throw new HttpError(401, "Please log in to continue.");
  const revoked = await sessionRevoked(session.userId, session.issuedAt);
  if (revoked === "disabled") throw new HttpError(401, "This account has been disabled.");
  if (revoked) throw new HttpError(401, "Your password was changed. Please log in again.");
  req.session = { userId: session.userId, role: session.role, name: session.name };
  // Far more than a person tapping around ever makes: it only stops a script flooding the API
  const limit = config.apiRequestsPerMinute;
  if (limit > 0) {
    const { over, retryAfter } = await hit(`rate:api:${session.userId}`, limit, 60);
    if (over) tooMany(res, retryAfter, "Too many requests from your account.");
  }
  next();
};

/** Use after requireAuth. Rejects with 403 unless the user has one of the given roles. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.session || !roles.includes(req.session.role)) {
      throw new HttpError(403, "This part of Feasto is for another kind of account. Log in with the right account to continue.");
    }
    next();
  };
}
