import { z } from "zod";
import { CACHE_KEYS, cached, invalidate } from "./redisCache.js";
import { prisma } from "./db.js";

/** Used until the admin saves their own, and for a freshly reset database. */
export const DEFAULT_SETTINGS = {
  /** Base delivery fee, covering the first `deliveryBaseKm` km by road */
  deliveryFee: 39,
  deliveryBaseKm: 1,
  /** For each km (or part of one) after that */
  deliveryPerKm: 8,
  /** The most added when more orders are waiting than there are free riders (0 = off). All of it is the rider's. */
  busyFeeMax: 20,
  /** Added while it rains (0 = off). All of it is the rider's. */
  rainFee: 10,
  storeRiderSeconds: 60,
  riderWaveSeconds: 30,
  stuckMinutes: 15,
  /** Orders no store accepted, or no rider took, are cancelled by themselves after this (0 = off) */
  autoCancelMinutes: 10,
  /** Accounts one network may create in 10 minutes (where Feasto can tell networks apart) */
  signupsPerNetwork: 20,
  /** Feasto's commission on the food of a delivery order, in percent */
  commissionPercent: 10,
  /** On a pickup order: lower, because no rider is needed */
  pickupCommissionPercent: 5,
  /** Feasto's share of a Pabili fee, in percent. Food deliveries have none: the rider keeps the whole fee. */
  pabiliFeePercent: 10,
  /** A newly approved store pays no commission for this many days */
  freeTrialDays: 30,
  /** The most a rider may spend on one Pabili: they pay at the shop with their own money */
  pabiliBudgetMax: 1000,
  /** An order to one store is big from this many items or pesos: the resident is told it takes longer */
  largeOrderItems: 20,
  largeOrderAmount: 3000,
  /** Cash on delivery is for checkouts up to this; bigger ones are paid online, so a store never cooks ₱5,000 of food for nobody */
  codMaxAmount: 3000,
  /** After this many orders not received at the door, the resident can only pay online */
  noShowStrikes: 2,
  /** How long the rider waits at the door before they may mark it not received */
  doorWaitMinutes: 10,
  /** Admins and store owners must log in with an authenticator app too */
  require2fa: true,
  /** A liquor ban is on (switched in Admin › Pabili): no alcohol through Pabili */
  liquorBan: false,
  /** Riders must use two-step login too (a passkey or an authenticator app) */
  require2faRiders: true,
  /** The admin logs in with three steps: password, a code and a passkey (needs a passkey first) */
  require3faAdmin: false,
  /** Suki points (earned on delivered orders, spent at checkout; Feasto pays them) */
  loyaltyOn: true,
  /** One point for every this many pesos of food paid */
  pointsEarnPer: 20,
  /** What one point takes off, in pesos (₱0.20: 100 points = ₱20, about 1% back) */
  pointValue: 0.2,
  /** The fewest points used at once */
  pointsMinRedeem: 100,
  /** Points for both friends when an invited friend's first order arrives */
  referralPoints: 250,
  /** Points in the resident's birthday week */
  birthdayPoints: 250,
  /** Daloy: an add-on when the riders' own speeds show the road is slow now (nothing without enough data) */
  daloyFeeOn: true,
  daloyPerMinute: 2,
  daloyFeeMax: 30,
  /** A bonus from Feasto when a ride took much longer than estimated on a slow road */
  delayBonusOn: true,
  delayBonusPerMinute: 1,
  delayBonusMax: 20,
  /** Feasto Plus: a month of free deliveries (up to a peso amount each, over a minimum) and members-only vouchers */
  plusOn: true,
  plusPrice: 99,
  plusFreeDeliveries: 8,
  plusDeliveryMax: 50,
  plusMinSpend: 150,
  /** A Pabili paid online first can have a budget up to this */
  pabiliPrepaidMax: 5000,
  /** One rider takes two orders at once when the stores are this close and the doors this close */
  batchingOn: true,
  batchPickupMeters: 300,
  batchDropKm: 1.5,
};

export type Settings = typeof DEFAULT_SETTINGS;

const whole = (min: number, max: number, unit: string) => {
  const message = `Enter ${min} to ${max} ${unit}.`;
  return z.number(message).int(message).min(min, message).max(max, message);
};

const peso = (max: number) => {
  const message = `Enter ₱0 to ₱${max}.`;
  return z
    .number(message)
    .min(0, message)
    .max(max, message)
    .refine((value) => Number.isInteger(Math.round(value * 1e6) / 1e4), "Use at most two decimal places.");
};

const percent = (max: number) => {
  const message = `Enter 0 to ${max}%.`;
  return z
    .number(message)
    .min(0, message)
    .max(max, message)
    .refine((value) => Number.isInteger(Math.round(value * 1e4) / 1e3), "Use at most one decimal place, e.g. 7.5.");
};

export const settingsSchema = z.object({
  deliveryFee: peso(500),
  deliveryBaseKm: z
    .number("Enter 0 to 20 km.")
    .min(0, "Enter 0 to 20 km.")
    .max(20, "Enter 0 to 20 km.")
    .refine((value) => Number.isInteger(Math.round(value * 1e4) / 1e3), "Use at most one decimal place, e.g. 2.5."),
  deliveryPerKm: peso(100),
  busyFeeMax: peso(100),
  rainFee: peso(100),
  storeRiderSeconds: whole(10, 600, "seconds"),
  riderWaveSeconds: whole(10, 300, "seconds"),
  stuckMinutes: whole(1, 240, "minutes"),
  autoCancelMinutes: z
    .number("Enter 0 to turn it off, or 3 to 120 minutes.")
    .int("Enter 0 to turn it off, or 3 to 120 minutes.")
    .refine((v) => v === 0 || (v >= 3 && v <= 120), "Enter 0 to turn it off, or 3 to 120 minutes."),
  signupsPerNetwork: whole(5, 1000, "sign-ups"),
  commissionPercent: percent(30),
  pickupCommissionPercent: percent(30),
  pabiliFeePercent: percent(30),
  freeTrialDays: whole(0, 365, "days"),
  pabiliBudgetMax: z
    .number("Enter ₱100 to ₱20,000.")
    .int("Enter whole pesos, like 1500.")
    .min(100, "Enter ₱100 to ₱20,000.")
    .max(20000, "Enter ₱100 to ₱20,000."),
  largeOrderItems: whole(5, 500, "items"),
  largeOrderAmount: whole(500, 100000, "pesos"),
  codMaxAmount: whole(500, 100000, "pesos"),
  noShowStrikes: whole(1, 10, "orders"),
  doorWaitMinutes: whole(3, 30, "minutes"),
  require2fa: z.boolean(),
  require2faRiders: z.boolean(),
  require3faAdmin: z.boolean(),
  loyaltyOn: z.boolean(),
  pointsEarnPer: z.number("Enter ₱1 to ₱1,000.").min(1, "Enter ₱1 to ₱1,000.").max(1000, "Enter ₱1 to ₱1,000."),
  pointValue: z.number("Enter ₱0.01 to ₱5.").min(0.01, "Enter ₱0.01 to ₱5.").max(5, "Enter ₱0.01 to ₱5.").refine((v) => Number.isInteger(Math.round(v * 1e6) / 1e4), "Use at most two decimal places."),
  pointsMinRedeem: whole(1, 10000, "points"),
  referralPoints: whole(0, 10000, "points"),
  birthdayPoints: whole(0, 10000, "points"),
  daloyFeeOn: z.boolean(),
  daloyPerMinute: peso(20),
  daloyFeeMax: peso(200),
  delayBonusOn: z.boolean(),
  delayBonusPerMinute: peso(20),
  delayBonusMax: peso(200),
  plusOn: z.boolean(),
  plusPrice: peso(2000).refine((v) => v >= 1, "Enter ₱1 to ₱2000."),
  plusFreeDeliveries: whole(0, 100, "deliveries"),
  plusDeliveryMax: peso(500),
  plusMinSpend: peso(5000),
  pabiliPrepaidMax: z.number("Enter ₱100 to ₱50,000.").int("Enter whole pesos, like 5000.").min(100, "Enter ₱100 to ₱50,000.").max(50000, "Enter ₱100 to ₱50,000."),
  batchingOn: z.boolean(),
  batchPickupMeters: whole(50, 3000, "metres"),
  batchDropKm: z
    .number("Enter 0.2 to 10 km.")
    .min(0.2, "Enter 0.2 to 10 km.")
    .max(10, "Enter 0.2 to 10 km.")
    .refine((value) => Number.isInteger(Math.round(value * 1e4) / 1e3), "Use at most one decimal place, e.g. 1.5."),
});

/**
 * The admin's settings. Every checkout and worker reads these, so they're kept in Redis, and
 * saving clears that copy for every API copy and worker at once.
 */
export function getSettings(): Promise<Settings> {
  return cached(CACHE_KEYS.settings, 60, async () => {
    const row = await prisma.platformSettings.findUnique({ where: { id: 1 } });
    if (!row) return DEFAULT_SETTINGS;
    const { deliveryFee, deliveryBaseKm, deliveryPerKm, busyFeeMax, rainFee, storeRiderSeconds, riderWaveSeconds, stuckMinutes, autoCancelMinutes, signupsPerNetwork, freeTrialDays, pabiliBudgetMax, largeOrderItems, largeOrderAmount, codMaxAmount, noShowStrikes, doorWaitMinutes, require2fa } = row;
    return {
      deliveryFee: Number(deliveryFee),
      deliveryBaseKm: Number(deliveryBaseKm),
      deliveryPerKm: Number(deliveryPerKm),
      busyFeeMax: Number(busyFeeMax),
      rainFee: Number(rainFee),
      storeRiderSeconds,
      riderWaveSeconds,
      stuckMinutes,
      autoCancelMinutes,
      signupsPerNetwork,
      commissionPercent: Number(row.commissionPercent),
      pickupCommissionPercent: Number(row.pickupCommissionPercent),
      pabiliFeePercent: Number(row.pabiliFeePercent),
      freeTrialDays,
      pabiliBudgetMax,
      largeOrderItems,
      largeOrderAmount,
      codMaxAmount,
      noShowStrikes,
      doorWaitMinutes,
      require2fa,
      liquorBan: row.liquorBan,
      require2faRiders: row.require2faRiders,
      require3faAdmin: row.require3faAdmin,
      loyaltyOn: row.loyaltyOn,
      pointsEarnPer: Number(row.pointsEarnPer),
      pointValue: Number(row.pointValue),
      pointsMinRedeem: row.pointsMinRedeem,
      referralPoints: row.referralPoints,
      birthdayPoints: row.birthdayPoints,
      daloyFeeOn: row.daloyFeeOn,
      daloyPerMinute: Number(row.daloyPerMinute),
      daloyFeeMax: Number(row.daloyFeeMax),
      delayBonusOn: row.delayBonusOn,
      delayBonusPerMinute: Number(row.delayBonusPerMinute),
      delayBonusMax: Number(row.delayBonusMax),
      plusOn: row.plusOn,
      plusPrice: Number(row.plusPrice),
      plusFreeDeliveries: row.plusFreeDeliveries,
      plusDeliveryMax: Number(row.plusDeliveryMax),
      plusMinSpend: Number(row.plusMinSpend),
      pabiliPrepaidMax: row.pabiliPrepaidMax,
      batchingOn: row.batchingOn,
      batchPickupMeters: row.batchPickupMeters,
      batchDropKm: Number(row.batchDropKm),
    };
  });
}

export const clearSettingsCache = () => invalidate(CACHE_KEYS.settings);
