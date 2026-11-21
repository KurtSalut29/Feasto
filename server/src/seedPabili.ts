import { prisma } from "./lib/db.js";
import { STARTER_SHOPS } from "./pabiliStarter.js";

/**
 * Puts the starting Pabili shops in a database that has none (`node dist/seedPabili.js`).
 * Never touches a list the admin has already made.
 */
try {
  const existing = await prisma.pabiliShop.count();
  if (existing > 0) console.log(`There are already ${existing} Pabili shops; nothing added.`);
  else {
    await prisma.pabiliShop.createMany({ data: STARTER_SHOPS });
    console.log(`Added ${STARTER_SHOPS.length} starting Pabili shops. Replace them with the real shops in Admin › Pabili.`);
  }
} finally {
  await prisma.$disconnect();
}
