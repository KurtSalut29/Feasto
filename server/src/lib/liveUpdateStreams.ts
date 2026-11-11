import type { Response } from "express";
import { redis } from "./redis.js";

/**
 * One Redis subscriber per API copy, shared by every browser connected to that copy.
 * `listeners` maps a channel to the browsers (open streams or waiting polls) that want its messages.
 */
type Listener = (message: string) => void;
const subscriber = redis.duplicate();
const listeners = new Map<string, Set<Listener>>();

subscriber.on("message", (channel: string, message: string) => {
  for (const listener of listeners.get(channel) ?? []) listener(message);
});

/** Sends the channels' messages to `listener` until the returned function is called. */
async function listen(channels: string[], listener: Listener) {
  for (const channel of channels) {
    let set = listeners.get(channel);
    if (!set) {
      set = new Set();
      listeners.set(channel, set);
      await subscriber.subscribe(channel);
    }
    set.add(listener);
  }
  return async () => {
    for (const channel of channels) {
      const set = listeners.get(channel);
      if (!set) continue;
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(channel);
        await subscriber.unsubscribe(channel);
      }
    }
  };
}

/** Starts a Server-Sent Events stream on `res` and forwards the given channels to it. */
export async function openStream(res: Response, channels: string[]) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Tell Nginx not to buffer, so each message reaches the browser immediately
    "X-Accel-Buffering": "no",
  });
  // The browser waits for this: if it never arrives, something on the way holds the stream back
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  const stopped = listen(channels, (message) => res.write(`data: ${message}\n\n`));
  // A comment every 25 s keeps proxies from closing an idle connection
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  res.on("close", () => {
    clearInterval(heartbeat);
    void stopped.then((stop) => stop());
  });
}

/**
 * For browsers that can't keep a stream open (a Cloudflare quick tunnel holds streams back):
 * waits up to `waitMs` for messages on the channels, then answers with them as JSON.
 * The browser asks again right away, so it still hears about changes within a moment.
 */
export function pollOnce(res: Response, channels: string[], waitMs = 20_000) {
  const events: unknown[] = [];
  let answered = false;
  let timer = setTimeout(answer, waitMs);

  const stopped = listen(channels, (message) => {
    events.push(JSON.parse(message));
    // Several messages often come together: wait a moment and send them in one answer
    if (events.length === 1) {
      clearTimeout(timer);
      timer = setTimeout(answer, 250);
    }
  });

  function answer() {
    if (answered) return;
    answered = true;
    clearTimeout(timer);
    void stopped.then((stop) => stop());
    if (!res.writableEnded) res.set("Cache-Control", "no-store").json({ events });
  }
  // The browser left (closed the tab, or the request was cancelled)
  res.on("close", answer);
}

export function closeSubscriber() {
  return subscriber.quit();
}

/** How many browsers are listening for live updates on this API copy right now. */
export function liveConnectionCount() {
  const browsers = new Set<Listener>();
  for (const set of listeners.values()) for (const listener of set) browsers.add(listener);
  return browsers.size;
}
