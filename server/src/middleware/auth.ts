import type { RequestHandler } from "express";
import { SESSION_COOKIE, verifySession, type Session } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import type { Role } from "../generated/prisma/enums.js";

declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

/** Rejects the request with 401 unless it carries a valid session cookie. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? await verifySession(token) : null;
  if (!session) throw new HttpError(401, "Please log in to continue.");
  req.session = session;
  next();
};

/** Use after requireAuth. Rejects with 403 unless the user has one of the given roles. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.session || !roles.includes(req.session.role)) {
      throw new HttpError(403, "You don't have access to this.");
    }
    next();
  };
}
