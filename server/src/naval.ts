// Sets Feasto up with the real food stores of Naval, Biliran, for testing and deployment.
// It DELETES EVERYTHING (accounts, stores, orders, photos, carts) and then creates:
//   - the admin, from ADMIN_EMAIL / ADMIN_PASSWORD
//   - every store in naval/stores.json, approved and open, with its menu and photos.
//     Each store gets a log-in (<slug>@feasto.com) with the password STORE_PASSWORD.
// No residents, riders or orders: classmates register those themselves.
//
// The store list is built from web/public/Feasto_Categories (see naval/README.md).
//
// Run:  docker compose --profile tools run --rm --build naval
import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import type { StoreType } from "./generated/prisma/client.js";
import { hashPassword } from "./lib/auth.js";
import { prisma } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { newRiderCode } from "./lib/verification.js";

const NAVAL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "naval");
const PHOTO_DIR = path.join(NAVAL_DIR, "photos");

type Dish = { name: string; category: string; price: number; description: string | null; photo: string | null };
type Store = {
  slug: string;
  email: string;
  name: string;
  storeType: StoreType;
  description: string;
  address: string;
  opensAt: string;
  closesAt: string;
  latitude: number;
  longitude: number;
  cover: string | null;
  menu: Dish[];
};

async function wipe() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "DocumentRenewal", "ActivityLog", "PlatformSettings", "JobOffer", "Review", "Favorite", "Notification", "OutboxEvent", "Booking", "DiningTable", "OrderItem", "Order", "Checkout", "MenuItem", "Address", "RiderProfile", "Vendor", "User" CASCADE`,
  );
  // Carts, caches, login lockouts, rider positions and old reports
  await redis.flushdb();
  for (const dir of [config.uploadDir, config.documentDir]) {
    await mkdir(dir, { recursive: true });
    for (const file of await readdir(dir)) await rm(path.join(dir, file), { force: true });
  }
}

/** Puts a store photo where the API serves uploads from */
async function photo(file: string | null) {
  if (!file) return null;
  const name = `naval-${file}`;
  await copyFile(path.join(PHOTO_DIR, file), path.join(config.uploadDir, name));
  return `/uploads/${name}`;
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD first.");
  const storePassword = process.env.STORE_PASSWORD || "demo1234";
  const stores = JSON.parse(await readFile(path.join(NAVAL_DIR, "stores.json"), "utf8")) as Store[];

  console.log("Wiping all data…");
  await wipe();

  const admin = await prisma.user.create({
    data: { email: adminEmail, name: "Feasto Admin", role: "ADMIN", passwordHash: await hashPassword(adminPassword) },
  });

  console.log(`Creating ${stores.length} Naval stores…`);
  const passwordHash = await hashPassword(storePassword);
  const now = new Date();
  for (const s of stores) {
    const owner = await prisma.user.create({
      data: {
        email: s.email,
        name: s.name,
        role: "VENDOR",
        passwordHash,
        vendor: {
          create: {
            name: s.name,
            storeType: s.storeType,
            acceptsReservations: s.storeType === "RESTAURANT" || s.storeType === "CAFE",
            description: s.description,
            address: s.address,
            latitude: s.latitude,
            longitude: s.longitude,
            imageUrl: await photo(s.cover),
            riderCode: newRiderCode(),
            status: "APPROVED",
            reviewedAt: now,
            opensAt: s.opensAt,
            closesAt: s.closesAt,
          },
        },
      },
      include: { vendor: true },
    });
    const vendorId = owner.vendor!.id;
    for (const dish of s.menu) {
      await prisma.menuItem.create({
        data: { vendorId, name: dish.name, category: dish.category, description: dish.description, price: dish.price, imageUrl: await photo(dish.photo) },
      });
    }
    console.log(`  ${s.name}: ${s.menu.length} dishes`);
  }

  await prisma.activityLog.createMany({
    data: stores.map((s) => ({ actorId: admin.id, actorName: admin.name, category: "APPROVALS" as const, action: "Approved store", target: s.name, createdAt: now })),
  });

  const dishes = stores.reduce((n, s) => n + s.menu.length, 0);
  console.log(`\nDone: ${stores.length} stores and ${dishes} dishes. Admin: ${adminEmail}`);
  console.log(`Store log-ins are <slug>@feasto.com (listed in naval/README.md) with the STORE_PASSWORD from .env.`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
  redis.disconnect();
}
