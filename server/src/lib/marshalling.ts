import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { redis } from "./redis.js";

/**
 * Marshalling turns an object in memory into bytes that can travel (here: JSON text, sent as
 * UTF-8 bytes); unmarshalling turns the bytes back into an object on the other side. Feasto's
 * servers do it every time data crosses a process: an API copy saving an event to the outbox,
 * a worker sending it through RabbitMQ, another worker reading it, live updates on Redis
 * pub/sub, the Redis cache, and request bodies from the browser.
 *
 * Every marshal and unmarshal here is also written to a short shared log in Redis, so the
 * admin's System page can show it happening across all the copies, with the real data.
 */

/** Where the bytes travel */
export type Transport = "rabbitmq" | "outbox" | "pubsub" | "redis" | "http";

export type TraceStep = {
  id: string;
  at: string;
  /** The API copy or worker that did it */
  instance: string;
  step: "marshal" | "unmarshal";
  transport: Transport;
  /** Queue, channel, cache key or route */
  channel: string;
  /** What the data is, e.g. "orders.placed" or "rider.location" */
  kind: string;
  /** Links the steps of one message's trip (for RabbitMQ, the outbox event id) */
  messageId: string | null;
  bytes: number;
  /** Time spent turning it into text or back, in milliseconds */
  ms: number;
  /** The text on the wire, shortened when long */
  text: string;
  truncated: boolean;
};

const KEY = "trace:marshal";
/** How many steps the log keeps; older ones fall off */
const KEEP = 400;
/** How much of each message the log keeps */
const PREVIEW_CHARS = 2000;
/** Fields never shown on the System page */
const SECRET = /password|token|secret/i;

type Where = { transport: Transport; channel: string; kind?: string; messageId?: string | null };

function hideSecrets(text: string) {
  if (!SECRET.test(text)) return text;
  try {
    return JSON.stringify(JSON.parse(text, (key, value) => (SECRET.test(key) ? "••••••" : value)));
  } catch {
    return text;
  }
}

function record(step: "marshal" | "unmarshal", where: Where, text: string, ms: number, kind: string) {
  const safe = hideSecrets(text);
  const entry: TraceStep = {
    id: randomUUID(),
    at: new Date().toISOString(),
    instance: config.instanceId,
    step,
    transport: where.transport,
    channel: where.channel,
    kind,
    messageId: where.messageId ?? null,
    bytes: Buffer.byteLength(text),
    ms: Math.round(ms * 1000) / 1000,
    text: safe.slice(0, PREVIEW_CHARS),
    truncated: safe.length > PREVIEW_CHARS,
  };
  // Never let the log slow down or break the real work
  redis
    .multi()
    .lpush(KEY, JSON.stringify(entry))
    .ltrim(KEY, 0, KEEP - 1)
    .exec()
    .catch(() => {});
}

/** What a value is, for the log: its `type` field when it has one */
function kindOf(value: unknown, fallback: string) {
  return value && typeof value === "object" && "type" in value && typeof value.type === "string" ? value.type : fallback;
}

/** Object → JSON text, logged. */
export function marshal(value: unknown, where: Where) {
  const started = performance.now();
  const text = JSON.stringify(value);
  record("marshal", where, text, performance.now() - started, where.kind ?? kindOf(value, where.channel));
  return text;
}

/** JSON text → object, logged. */
export function unmarshal<T>(text: string, where: Where): T {
  const started = performance.now();
  const value = JSON.parse(text) as T;
  record("unmarshal", where, text, performance.now() - started, where.kind ?? kindOf(value, where.channel));
  return value;
}

/** Logs an unmarshal that a library already did (e.g. Express reading a request body). */
export function recordUnmarshal(text: string, where: Where & { kind: string }, ms = 0) {
  record("unmarshal", where, text, ms, where.kind);
}

/** Logs a marshal that a library does (e.g. Prisma writing an object as a JSON column). */
export function recordMarshal(value: unknown, where: Where & { kind: string }) {
  const started = performance.now();
  const text = JSON.stringify(value);
  record("marshal", where, text, performance.now() - started, where.kind);
}

/** The newest steps first */
export async function readTrace(limit = KEEP) {
  const rows = await redis.lrange(KEY, 0, limit - 1);
  return rows.map((row) => JSON.parse(row) as TraceStep);
}
