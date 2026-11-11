import { prisma } from "./db.js";
import { datesBetween, dayCount, manilaRange } from "./reportDates.js";

/** What a store's sales report shows, for any period the vendor picks. Sales are before delivery fees. */
export type StoreReport = {
  store: { id: string; name: string; address: string; storeType: string };
  from: string;
  to: string;
  days: number;
  totals: {
    orders: number;
    sales: number;
    deliveryFees: number;
    itemsSold: number;
    averageOrder: number;
    cancelled: number;
    declined: number;
    /** e.g. 12 for 12:00–12:59; null with no orders */
    busiestHour: number | null;
  };
  daily: { date: string; orders: number; sales: number }[];
  dishes: { name: string; quantity: number; sales: number }[];
  payments: { method: string; orders: number; sales: number }[];
  fulfillment: { type: "Delivery" | "Pickup"; orders: number; sales: number }[];
  /** Every sold order, newest first (for the Excel file) */
  orders: { code: string; placedAt: string; customer: string; type: string; payment: string; status: string; items: string; subtotal: number; deliveryFee: number }[];
};

export const PAYMENT_NAMES: Record<string, string> = {
  COD: "Cash",
  ONLINE: "Online",
  GCASH: "GCash",
  MAYA: "Maya",
  GRABPAY: "GrabPay",
  SHOPEEPAY: "ShopeePay",
  COINS: "Coins.ph",
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  JCB: "JCB",
  AMEX: "American Express",
};

const STATUS_NAMES: Record<string, string> = {
  PLACED: "Waiting for the store",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  PICKED_UP: "On the way",
  DELIVERED: "Delivered",
  COMPLETED: "Picked up",
};

/** Same order code the app shows ("#A1B2C3") */
export const orderCode = (id: string) => `#${id.slice(-6).toUpperCase()}`;

/** Orders that count as sold: everything except unpaid, cancelled and declined ones (same rule as the admin report) */
const SOLD = ["PLACED", "ACCEPTED", "PREPARING", "READY", "PICKED_UP", "DELIVERED", "COMPLETED"] as const;

export async function storeReport(vendorId: string, from: string, to: string): Promise<StoreReport> {
  const range = manilaRange(from, to);
  const { gte, lt } = range;
  const [store, sold, cancelled, declined, daily, dishes, payments, fulfillment, hours, orders] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { id: true, name: true, address: true, storeType: true } }),
    prisma.order.aggregate({ where: { vendorId, createdAt: range, status: { in: [...SOLD] } }, _count: true, _sum: { subtotal: true, deliveryFee: true } }),
    prisma.order.count({ where: { vendorId, createdAt: range, status: "CANCELLED" } }),
    prisma.order.count({ where: { vendorId, createdAt: range, status: "REJECTED" } }),
    prisma.$queryRaw<{ day: string; orders: bigint; sales: string }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS day, count(*) AS orders, sum(subtotal)::text AS sales
      FROM "Order"
      WHERE "vendorId" = ${vendorId} AND "createdAt" >= ${gte} AND "createdAt" < ${lt} AND status NOT IN ('AWAITING_PAYMENT', 'REJECTED', 'CANCELLED')
      GROUP BY day`,
    prisma.$queryRaw<{ name: string; quantity: bigint; sales: string }[]>`
      SELECT i.name, sum(i.quantity) AS quantity, sum(i.quantity * i."unitPrice")::text AS sales
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
      WHERE o."vendorId" = ${vendorId} AND o."createdAt" >= ${gte} AND o."createdAt" < ${lt} AND o.status NOT IN ('AWAITING_PAYMENT', 'REJECTED', 'CANCELLED')
      GROUP BY i.name ORDER BY quantity DESC, i.name`,
    prisma.$queryRaw<{ method: string; online: string | null; orders: bigint; sales: string }[]>`
      SELECT c."paymentMethod"::text AS method, c."onlineMethod"::text AS online, count(*) AS orders, sum(o.subtotal)::text AS sales
      FROM "Order" o JOIN "Checkout" c ON c.id = o."checkoutId"
      WHERE o."vendorId" = ${vendorId} AND o."createdAt" >= ${gte} AND o."createdAt" < ${lt} AND o.status NOT IN ('AWAITING_PAYMENT', 'REJECTED', 'CANCELLED')
      GROUP BY 1, 2`,
    prisma.order.groupBy({ by: ["fulfillment"], where: { vendorId, createdAt: range, status: { in: [...SOLD] } }, _count: true, _sum: { subtotal: true } }),
    prisma.$queryRaw<{ hour: number; orders: bigint }[]>`
      SELECT extract(hour FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila'))::int AS hour, count(*) AS orders
      FROM "Order"
      WHERE "vendorId" = ${vendorId} AND "createdAt" >= ${gte} AND "createdAt" < ${lt} AND status NOT IN ('AWAITING_PAYMENT', 'REJECTED', 'CANCELLED')
      GROUP BY hour ORDER BY orders DESC, hour LIMIT 1`,
    prisma.order.findMany({
      where: { vendorId, createdAt: range, status: { in: [...SOLD] } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        id: true,
        createdAt: true,
        status: true,
        fulfillment: true,
        subtotal: true,
        deliveryFee: true,
        items: { select: { name: true, quantity: true } },
        checkout: { select: { paymentMethod: true, onlineMethod: true, resident: { select: { name: true } } } },
      },
    }),
  ]);

  const byDay = new Map(daily.map((d) => [d.day, d]));
  const salesTotal = Number(sold._sum.subtotal ?? 0);
  const itemsSold = dishes.reduce((n, d) => n + Number(d.quantity), 0);

  // Wallets and cards by name; older online orders without a wallet show as "Online"
  const paymentRows = new Map<string, { orders: number; sales: number }>();
  for (const p of payments) {
    const name = PAYMENT_NAMES[p.method === "COD" ? "COD" : (p.online ?? "ONLINE")];
    const row = paymentRows.get(name) ?? { orders: 0, sales: 0 };
    row.orders += Number(p.orders);
    row.sales += Number(p.sales);
    paymentRows.set(name, row);
  }

  return {
    store,
    from,
    to,
    days: dayCount(from, to),
    totals: {
      orders: sold._count,
      sales: salesTotal,
      deliveryFees: Number(sold._sum.deliveryFee ?? 0),
      itemsSold,
      averageOrder: sold._count ? salesTotal / sold._count : 0,
      cancelled,
      declined,
      busiestHour: hours[0]?.hour ?? null,
    },
    daily: datesBetween(from, to).map((date) => ({ date, orders: Number(byDay.get(date)?.orders ?? 0), sales: Number(byDay.get(date)?.sales ?? 0) })),
    dishes: dishes.map((d) => ({ name: d.name, quantity: Number(d.quantity), sales: Number(d.sales) })),
    payments: [...paymentRows].map(([method, row]) => ({ method, ...row })).sort((a, b) => b.sales - a.sales),
    fulfillment: (["DELIVERY", "PICKUP"] as const).map((type) => {
      const row = fulfillment.find((f) => f.fulfillment === type);
      return { type: type === "DELIVERY" ? "Delivery" : "Pickup", orders: row?._count ?? 0, sales: Number(row?._sum.subtotal ?? 0) } as const;
    }),
    orders: orders.map((o) => ({
      code: orderCode(o.id),
      placedAt: o.createdAt.toISOString(),
      customer: o.checkout.resident.name,
      type: o.fulfillment === "DELIVERY" ? "Delivery" : "Pickup",
      payment: PAYMENT_NAMES[o.checkout.paymentMethod === "COD" ? "COD" : (o.checkout.onlineMethod ?? "ONLINE")],
      status: STATUS_NAMES[o.status] ?? o.status,
      items: o.items.map((i) => `${i.quantity}× ${i.name}`).join(", "),
      subtotal: Number(o.subtotal),
      deliveryFee: Number(o.deliveryFee),
    })),
  };
}

/** "12 PM – 1 PM" */
export function hourLabel(hour: number) {
  const name = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? "AM" : "PM"}`;
  return `${name(hour)} – ${name(hour + 1)}`;
}
