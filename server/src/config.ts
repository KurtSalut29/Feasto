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
  // Name shown in responses and logs so you can see which copy handled the work.
  instanceId: process.env.INSTANCE_ID ?? os.hostname(),
};
