import type { Response } from "express";
import { redis } from "./redis.js";

/**
 * One Redis subscriber per API copy, shared by every browser connected to that copy.
 * `listeners` maps a channel to the open browser streams that want its messages.
 */
const subscriber = redis.duplicate();
const listeners = new Map<string, Set<Response>>();

subscriber.on("message", (channel: string, message: string) => {
  for (const res of listeners.get(channel) ?? []) {
    res.write(`data: ${message}\n\n`);
  }
});

/** Starts a Server-Sent Events stream on `res` and forwards the given channels to it. */
export async function openStream(res: Response, channels: string[]) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Tell Nginx not to buffer, so each message reaches the browser immediately
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  for (const channel of channels) {
    let set = listeners.get(channel);
    if (!set) {
      set = new Set();
      listeners.set(channel, set);
      await subscriber.subscribe(channel);
    }
    set.add(res);
  }

  // A comment every 25 s keeps proxies from closing an idle connection
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  res.on("close", async () => {
    clearInterval(heartbeat);
    for (const channel of channels) {
      const set = listeners.get(channel);
      if (!set) continue;
      set.delete(res);
      if (set.size === 0) {
        listeners.delete(channel);
        await subscriber.unsubscribe(channel);
      }
    }
  });
}

export function closeSubscriber() {
  return subscriber.quit();
}

/** How many browsers hold a live connection to this API copy right now. */
export function liveConnectionCount() {
  const streams = new Set<Response>();
  for (const set of listeners.values()) for (const res of set) streams.add(res);
  return streams.size;
}
