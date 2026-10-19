import { config } from "../config.js";
import { redis } from "./redis.js";

const KEY = "heartbeats";
const EVERY_MS = 5000;

let requests = 0;
let lastRequests = 0;

/** Counts handled requests, so the system monitor can show each API copy's load. */
export function countRequest() {
  requests++;
}

/**
 * Every 5 seconds, each API copy and worker writes "I'm alive" to Redis with a few
 * numbers. The admin's System page reads them: a copy that stops writing (crashed or
 * stopped) shows as offline after 15 seconds.
 */
export function startHeartbeat(role: "api" | "worker", extra: () => Record<string, number> = () => ({})) {
  const startedAt = new Date().toISOString();
  const beat = async () => {
    const perSecond = (requests - lastRequests) / (EVERY_MS / 1000);
    lastRequests = requests;
    await redis.hset(
      KEY,
      config.instanceId,
      JSON.stringify({
        role,
        startedAt,
        at: new Date().toISOString(),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        requests,
        requestsPerSecond: Math.round(perSecond * 10) / 10,
        ...extra(),
      }),
    );
  };
  void beat();
  const timer = setInterval(() => void beat().catch(() => undefined), EVERY_MS);
  return () => clearInterval(timer);
}

export async function readHeartbeats() {
  const raw = await redis.hgetall(KEY);
  const now = Date.now();
  return Object.entries(raw)
    .map(([instance, json]) => {
      const data = JSON.parse(json) as { role: string; at: string } & Record<string, unknown>;
      return { instance, ...data, online: now - new Date(data.at).getTime() < 15_000 };
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.instance.localeCompare(b.instance));
}
