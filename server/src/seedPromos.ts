import { prisma } from "./lib/db.js";

/**
 * Starting promos for a database that has none (`node dist/seedPromos.js`): a first-order voucher,
 * free delivery, and the next payday and 12.12 sale days with their vouchers. Feasto pays for all
 * of them, each with a budget; the admin pauses or changes them in Admin › Promos.
 */
const manilaDay = (iso: string) => ({ startsAt: new Date(`${iso}T00:00:00+08:00`), endsAt: new Date(`${iso}T23:59:59+08:00`) });

/** The next 15th or 30th, and the next 12.12 */
function nextDates(now = new Date()) {
  const ph = new Date(now.getTime() + 8 * 3600_000);
  const y = ph.getUTCFullYear();
  const m = ph.getUTCMonth();
  const d = ph.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const payday = d < 15 ? `${y}-${pad(m + 1)}-15` : d < 30 ? `${y}-${pad(m + 1)}-${Math.min(30, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())}` : `${m === 11 ? y + 1 : y}-${pad(m === 11 ? 1 : m + 2)}-15`;
  const twelve = m < 11 || (m === 11 && d <= 12) ? `${y}-12-12` : `${y + 1}-12-12`;
  return { payday, twelve };
}

try {
  if ((await prisma.promo.count()) > 0) console.log("There are already promos; nothing added.");
  else {
    const { payday, twelve } = nextDates();
    const paydaySale = await prisma.campaign.create({ data: { name: "Payday Treat", tagline: "Sweldo na! Treat yourself", ...manilaDay(payday) } });
    const twelveSale = await prisma.campaign.create({ data: { name: "12.12 Sale", tagline: "One day only: vouchers from Feasto and deals from your favorite stores", ...manilaDay(twelve) } });
    await prisma.promo.createMany({
      data: [
        { kind: "VOUCHER", code: "WELCOME75", title: "Welcome to Feasto", benefit: "AMOUNT_OFF", value: 75, minSpend: 200, audience: "FIRST_ORDER", perUserLimit: 1, budget: 5000 },
        { kind: "VOUCHER", code: "LIBRESHIP", title: "Free delivery over ₱300", benefit: "FREE_DELIVERY", value: 0, maxDiscount: 60, minSpend: 300, perUserLimit: 3, budget: 3000 },
        { kind: "VOUCHER", code: "PAYDAY50", title: "Payday treat", benefit: "AMOUNT_OFF", value: 50, minSpend: 400, perUserLimit: 1, budget: 2000, campaignId: paydaySale.id },
        { kind: "VOUCHER", code: "SALE1212", title: "12.12: 12% off", benefit: "PERCENT_OFF", value: 12, maxDiscount: 120, minSpend: 300, perUserLimit: 1, budget: 5000, campaignId: twelveSale.id },
      ],
    });
    console.log(`Added 4 vouchers (WELCOME75, LIBRESHIP, PAYDAY50 on ${payday}, SALE1212 on ${twelve}) and 2 sale days. Change them in Admin › Promos.`);
  }
} finally {
  await prisma.$disconnect();
}
