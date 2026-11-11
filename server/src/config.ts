import os from "node:os";

// Local development reads server/.env; inside Docker the variables come from docker-compose.yml.
try {
  process.loadEnvFile();
} catch {
  // No .env file, so rely on the real environment.
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  rabbitmqUrl: process.env.RABBITMQ_URL ?? "amqp://feasto:feasto@localhost:5672",
  rabbitmqManagementUrl: process.env.RABBITMQ_MANAGEMENT_URL ?? "http://localhost:15672",
  // Every API copy signs and checks sessions with the same secret, so any copy can serve any user.
  jwtSecret: new TextEncoder().encode(required("JWT_SECRET")),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  // Where uploaded photos are saved. In Docker this is a volume shared by every API copy.
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  // Business permits and driver's licenses. Shared by the API copies, but Nginx can't see this
  // folder, so a file only leaves through the API after checking who is asking.
  documentDir: process.env.DOCUMENT_DIR ?? "documents",
  // Simulated work in the worker, so parallel processing is visible in the demo
  orderProcessingDelayMs: Number(process.env.ORDER_PROCESSING_DELAY_MS ?? 800),
  paymentDelayMs: Number(process.env.PAYMENT_DELAY_MS ?? 1500),
  reportPartDelayMs: Number(process.env.REPORT_PART_DELAY_MS ?? 300),
  // Mapbox, for road distances that set the delivery fee. Without it, distances are estimated.
  mapboxToken: process.env.MAPBOX_TOKEN ?? "",
  // Push notifications that reach phones while Feasto is closed. Without the keys, Feasto only
  // shows notifications in the open app. Make them with: npx web-push generate-vapid-keys
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT || "mailto:admin@feasto.com",
  },
  // Name shown in responses and logs so you can see which copy handled the work.
  instanceId: process.env.INSTANCE_ID ?? os.hostname(),
};
