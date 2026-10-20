import { Router } from "express";
import { ACTIVE_STORE } from "../lib/accounts.js";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { CHANNELS, notify, publish } from "../lib/realtime.js";
import { manilaTime } from "../lib/storeHours.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { myVendorId } from "./vendor.js";

/**
 * Table bookings use fixed one-hour slots. A booking holds `activeSlotKey` =
 * "<tableId>|<start>", which has a unique index, so the database itself refuses a
 * second booking for the same table and time, even when requests for the last table
 * arrive at the same moment through different API copies.
 */

const BOOKING_DAYS_AHEAD = 14;
const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const timeParam = z.string().regex(/^([01]\d|2[0-3]):00$/, "Pick a time.");

/** "2026-10-21" + "19:00" in Manila -> the exact moment. */
const manilaMoment = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`);
const todayInManila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** Whole-hour starts from opening until an hour before closing, e.g. 08:00 … 20:00. */
function hourlySlots(opensAt: string, closesAt: string) {
  const [oh, om] = opensAt.split(":").map(Number);
  const [ch, cm] = closesAt.split(":").map(Number);
  const first = om > 0 ? oh + 1 : oh;
  const lastStart = ch * 60 + cm - 60;
  const slots: string[] = [];
  for (let h = first; h * 60 <= lastStart; h++) slots.push(`${String(h).padStart(2, "0")}:00`);
  return slots;
}

function checkDate(date: string) {
  const today = todayInManila();
  const last = new Date(Date.now() + (BOOKING_DAYS_AHEAD + 1) * 86400_000 + 8 * 3600_000).toISOString().slice(0, 10);
  if (date < today || date > last) throw new HttpError(400, `Book up to ${BOOKING_DAYS_AHEAD} days ahead.`);
}

async function bookableStore(vendorId: string) {
  const store = await prisma.vendor.findFirst({
    where: { id: vendorId, ...ACTIVE_STORE, acceptsReservations: true },
    select: { id: true, name: true, ownerId: true, opensAt: true, closesAt: true, tables: { where: { isActive: true }, select: { id: true, label: true, seats: true } } },
  });
  if (!store || store.tables.length === 0) throw new HttpError(404, "This store doesn't take table bookings.");
  return store;
}

// ---------- Residents ----------

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

const availabilityQuery = z.object({ date: dateParam, partySize: z.coerce.number().int().min(1).max(30) });

bookingsRouter.get("/availability/:vendorId", requireRole("RESIDENT"), async (req, res) => {
  const { date, partySize } = availabilityQuery.parse(req.query);
  checkDate(date);
  const store = await bookableStore(String(req.params.vendorId));
  const tables = store.tables.filter((t) => t.seats >= partySize);
  const slots = hourlySlots(store.opensAt, store.closesAt);

  const taken = await prisma.booking.findMany({
    where: {
      tableId: { in: tables.map((t) => t.id) },
      status: "CONFIRMED",
      startsAt: { gte: manilaMoment(date, "00:00"), lt: new Date(manilaMoment(date, "00:00").getTime() + 86400_000) },
    },
    select: { tableId: true, startsAt: true },
  });
  const now = Date.now();
  res.json({
    slots: slots.map((time) => {
      const start = manilaMoment(date, time);
      const free = tables.filter((t) => !taken.some((b) => b.tableId === t.id && b.startsAt.getTime() === start.getTime()));
      return { time, available: start.getTime() > now && free.length > 0, tablesLeft: free.length };
    }),
    hasTableForParty: tables.length > 0,
  });
});

const bookSchema = z.object({
  vendorId: z.string().min(1),
  date: dateParam,
  time: timeParam,
  partySize: z.number().int().min(1, "At least 1 person.").max(30),
  notes: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
});

bookingsRouter.post("/", requireRole("RESIDENT"), async (req, res) => {
  const input = parseBody(bookSchema, req.body);
  checkDate(input.date);
  const store = await bookableStore(input.vendorId);
  if (!hourlySlots(store.opensAt, store.closesAt).includes(input.time)) throw new HttpError(400, "The store isn't open at that time.");
  const startsAt = manilaMoment(input.date, input.time);
  if (startsAt.getTime() <= Date.now()) throw new HttpError(400, "That time has already passed.");

  // Try the smallest table that fits first; if someone takes it at the same moment,
  // the unique index rejects us and we try the next one.
  const candidates = store.tables.filter((t) => t.seats >= input.partySize).sort((a, b) => a.seats - b.seats);
  if (candidates.length === 0) throw new HttpError(400, `No table here seats ${input.partySize}.`);

  for (const table of candidates) {
    try {
      const booking = await prisma.booking.create({
        data: {
          tableId: table.id,
          residentId: req.session!.userId,
          startsAt,
          partySize: input.partySize,
          notes: input.notes,
          activeSlotKey: `${table.id}|${startsAt.toISOString()}`,
        },
      });
      const when = `${startsAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })} at ${input.time}`;
      await notify(store.ownerId, {
        title: "New table booking",
        body: `${table.label} · ${when} · ${input.partySize} ${input.partySize === 1 ? "person" : "people"}`,
        link: "/vendor/reservations",
      });
      res.status(201).json({ booking: { id: booking.id, table: table.label } });
      return;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new HttpError(409, "That time just got fully booked. Please pick another time.");
});

bookingsRouter.get("/", requireRole("RESIDENT"), async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { residentId: req.session!.userId },
    orderBy: { startsAt: "desc" },
    take: 50,
    include: { table: { select: { label: true, vendor: { select: { id: true, name: true, address: true, imageUrl: true } } } } },
  });
  const now = Date.now();
  res.json({ bookings: bookings.map((b) => ({ ...b, upcoming: b.status === "CONFIRMED" && b.startsAt.getTime() > now })) });
});

bookingsRouter.post("/:id/cancel", requireRole("RESIDENT"), async (req, res) => {
  const id = String(req.params.id);
  const { count } = await prisma.booking.updateMany({
    where: { id, residentId: req.session!.userId, status: "CONFIRMED", startsAt: { gt: new Date() } },
    // Clearing the slot key frees the table for someone else
    data: { status: "CANCELLED", activeSlotKey: null },
  });
  if (count === 0) throw new HttpError(409, "This booking can't be cancelled anymore.");
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id }, include: { table: { select: { label: true, vendor: { select: { ownerId: true } } } } } });
  await notify(booking.table.vendor.ownerId, { title: "A booking was cancelled", body: `${booking.table.label} is free again.`, link: "/vendor/reservations" });
  res.json({ ok: true });
});

// ---------- Vendors: tables and the booking list ----------

export const vendorBookingsRouter = Router();
vendorBookingsRouter.use(requireAuth, requireRole("VENDOR"));

const tableSchema = z.object({
  label: z.string().trim().min(1, "Name the table, like Table 1.").max(30),
  seats: z.number("Enter the number of seats.").int().min(1, "At least 1 seat.").max(30, "Up to 30 seats."),
});

vendorBookingsRouter.get("/tables", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const tables = await prisma.diningTable.findMany({ where: { vendorId, isActive: true }, orderBy: { label: "asc" } });
  res.json({ tables });
});

async function assertLabelFree(vendorId: string, label: string, exceptId?: string) {
  const clash = await prisma.diningTable.findFirst({ where: { vendorId, isActive: true, label: { equals: label, mode: "insensitive" }, NOT: { id: exceptId } } });
  if (clash) throw new HttpError(400, `You already have a table called ${label}.`);
}

vendorBookingsRouter.post("/tables", async (req, res) => {
  const input = parseBody(tableSchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  await assertLabelFree(vendorId, input.label);
  const table = await prisma.diningTable.create({ data: { ...input, vendorId } });
  res.status(201).json({ table });
});

vendorBookingsRouter.patch("/tables/:id", async (req, res) => {
  const input = parseBody(tableSchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  await assertLabelFree(vendorId, input.label, String(req.params.id));
  const { count } = await prisma.diningTable.updateMany({ where: { id: String(req.params.id), vendorId, isActive: true }, data: input });
  if (count === 0) throw new HttpError(404, "Table not found.");
  res.json({ ok: true });
});

vendorBookingsRouter.delete("/tables/:id", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const id = String(req.params.id);
  const upcoming = await prisma.booking.count({ where: { tableId: id, status: "CONFIRMED", startsAt: { gt: new Date() } } });
  if (upcoming > 0) throw new HttpError(409, `This table has ${upcoming} upcoming ${upcoming === 1 ? "booking" : "bookings"}. Cancel them first.`);
  // Hidden rather than deleted, because past bookings point to it
  const { count } = await prisma.diningTable.updateMany({ where: { id, vendorId, isActive: true }, data: { isActive: false } });
  if (count === 0) throw new HttpError(404, "Table not found.");
  res.status(204).end();
});

vendorBookingsRouter.get("/bookings", async (req, res) => {
  const date = dateParam.catch(todayInManila()).parse(req.query.date);
  const vendorId = await myVendorId(req.session!.userId);
  const start = manilaMoment(date, "00:00");
  const bookings = await prisma.booking.findMany({
    where: { table: { vendorId }, startsAt: { gte: start, lt: new Date(start.getTime() + 86400_000) } },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    include: { table: { select: { label: true, seats: true } }, resident: { select: { name: true, phone: true } } },
  });
  // Confirmed bookings per day for the next 7 days, for the date strip
  const today = todayInManila();
  const weekStart = manilaMoment(today, "00:00");
  const week = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
    SELECT to_char((b."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS day, count(*) AS count
    FROM "Booking" b JOIN "DiningTable" t ON t.id = b."tableId"
    WHERE t."vendorId" = ${vendorId} AND b.status = 'CONFIRMED'
      AND b."startsAt" >= ${weekStart} AND b."startsAt" < ${new Date(weekStart.getTime() + 7 * 86400_000)}
    GROUP BY day`;
  const now = Date.now();
  // "started": the table time has come, so the store marks arrived / no-show instead of cancelling
  res.json({
    date,
    now: manilaTime(),
    week: Object.fromEntries(week.map((w) => [w.day, Number(w.count)])),
    bookings: bookings.map((b) => ({ ...b, started: b.startsAt.getTime() <= now })),
  });
});

const bookingStatusSchema = z.object({ status: z.enum(["COMPLETED", "NO_SHOW", "CANCELLED"]) });

vendorBookingsRouter.post("/bookings/:id/status", async (req, res) => {
  const { status } = parseBody(bookingStatusSchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  const id = String(req.params.id);
  const { count } = await prisma.booking.updateMany({
    where: { id, status: "CONFIRMED", table: { vendorId } },
    data: { status, activeSlotKey: null },
  });
  if (count === 0) throw new HttpError(409, "This booking was already updated.");
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id }, include: { table: { select: { vendor: { select: { name: true } } } } } });
  if (status === "CANCELLED") {
    await notify(booking.residentId, {
      title: `${booking.table.vendor.name} cancelled your booking`,
      body: "Sorry! Please book another time.",
      link: "/resident/bookings",
    });
  } else {
    await publish(CHANNELS.user(booking.residentId), { type: "booking.updated", bookingId: id, status });
  }
  res.json({ ok: true });
});
