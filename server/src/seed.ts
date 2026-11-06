// Creates the admin account. Safe to run many times: it only creates it once.
// Run with `npm run db:seed` (Docker runs it automatically after migrations).
import { hashPassword } from "./lib/auth.js";
import { prisma } from "./lib/db.js";

const email = process.env.ADMIN_EMAIL?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.log("ADMIN_EMAIL or ADMIN_PASSWORD not set; skipping admin account.");
} else {
  // Feasto has one admin, so changing ADMIN_EMAIL later doesn't create a second one
  const existing = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { email: true } });
  if (existing) {
    console.log(`The admin account ${existing.email} already exists.`);
  } else {
    await prisma.user.create({
      data: { email, name: "Feasto Admin", role: "ADMIN", passwordHash: await hashPassword(password) },
    });
    console.log(`Created admin account ${email}.`);
  }
}

await prisma.$disconnect();
