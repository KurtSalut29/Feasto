import type { NextFunction, Request, Response } from "express";
import { CHANNELS, publish } from "./liveUpdates.js";

/**
 * Changes that already send their own, more precise live update (order and booking status, which
 * reach only the people on that order), or that change nothing others can see.
 */
const ALREADY_LIVE = /^\/api\/(vendor\/(orders|bookings)\/|admin\/(reports|marshalling|stuck|orders)|vendor\/reports)/;

/** Several saves in a row (a store editing five dishes) reach the other pages as one update. */
const QUIET_MS = 1500;
let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * After a store or the admin successfully saves anything, tells every open Feasto page that data
 * changed. Each page then loads its data again in the background (see LiveUpdates on the web), so a
 * resident at checkout sees the store's new payment method without pressing refresh. The message
 * goes over Redis pub/sub, so it reaches the pages connected to every API copy.
 */
export function announceDataChanges(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  res.on("finish", () => {
    const by = req.session?.role;
    if (res.statusCode >= 400 || (by !== "VENDOR" && by !== "ADMIN")) return;
    if (ALREADY_LIVE.test(req.originalUrl)) return;
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      void publish(CHANNELS.everyone, { type: "data.changed", by }).catch(() => {});
    }, QUIET_MS);
  });
  next();
}
