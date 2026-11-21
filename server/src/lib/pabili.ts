import type { RestrictRule, ShopCategory } from "../generated/prisma/enums.js";
import { prisma } from "./db.js";
import { cached, invalidate } from "./redisCache.js";

/**
 * The rules of the new Pabili, shared by the routes: the kinds of shops, the units things are
 * bought in, and what may not be bought (or only with a prescription, or by an adult). The web
 * runs the same check as the resident types (lib/pabili.ts there), so they see the reason
 * before sending; this one is the one that counts.
 */

export const SHOP_CATEGORIES = [
  "GROCERY", "SARI_SARI", "MARKET", "RICE", "BAKERY", "PHARMACY", "HARDWARE", "SCHOOL_SUPPLIES",
  "WATER", "LPG", "AGRI_PET", "PERSONAL_CARE", "GADGETS", "FRUITS", "OTHER",
] as const satisfies readonly ShopCategory[];

export const CATEGORY_LABEL: Record<ShopCategory, string> = {
  GROCERY: "Grocery and supermarket",
  SARI_SARI: "Sari-sari store",
  MARKET: "Palengke (meat, fish, vegetables)",
  RICE: "Bigasan",
  BAKERY: "Bakery",
  PHARMACY: "Botika",
  HARDWARE: "Hardware",
  SCHOOL_SUPPLIES: "School and office supplies",
  WATER: "Water refilling",
  LPG: "LPG",
  AGRI_PET: "Feeds, agri and pet supplies",
  PERSONAL_CARE: "Personal care and cosmetics",
  GADGETS: "Gadget accessories",
  FRUITS: "Fruits",
  OTHER: "Other shop",
};

/** What a thing is counted in. Half a kilo is 0.5 kg. */
export const UNITS = ["pc", "kg", "g", "L", "mL", "pack", "sachet", "bottle", "can", "box", "dozen", "tray", "bundle", "sack", "gallon", "meter"] as const;
export type Unit = (typeof UNITS)[number];

/** What the rider does when an item isn't there */
export const IF_MISSING = ["CALL", "SKIP", "ANY", "REPLACE"] as const;

/** Why the rider couldn't buy an item */
export const NOT_BOUGHT = ["OUT_OF_STOCK", "NEEDS_PRESCRIPTION", "AGE_CHECK", "TOO_BIG", "OVER_BUDGET", "OTHER"] as const;
export const NOT_BOUGHT_LABEL: Record<(typeof NOT_BOUGHT)[number], string> = {
  OUT_OF_STOCK: "out of stock",
  NEEDS_PRESCRIPTION: "the botika needs a prescription",
  AGE_CHECK: "the shop wouldn't sell it without an ID",
  TOO_BIG: "too big for the motorcycle",
  OVER_BUDGET: "over the budget",
  OTHER: "couldn't be bought",
};

export type PabiliItem = {
  name: string;
  quantity: number;
  unit?: Unit;
  note: string | null;
  /** The resident's guess at the price of this line */
  estimate?: number | null;
  ifMissing?: (typeof IF_MISSING)[number];
  replacement?: string | null;
  /** Marked by the resident: medicine that needs a prescription */
  prescription?: boolean;
  /** Set by the rider at the shop */
  notBought?: { reason: (typeof NOT_BOUGHT)[number]; at: string } | null;
};

export type Term = { term: string; rule: RestrictRule };

/** Lowercase, without accents, so "Ginebra" and "ginebrá" are the same */
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The rules a piece of text trips: whole words only ("gin" isn't in "ginger") */
export function rulesIn(text: string, terms: Term[]): Term[] {
  const t = ` ${plain(text)} `;
  return terms.filter(({ term }) => new RegExp(`(^|[^a-z0-9])${escape(plain(term))}([^a-z0-9]|$)`).test(t));
}

/** The word list, kept for a minute (the admin's changes clear it) */
export const restrictedTerms = () =>
  cached("cache:pabili-terms", 60, async () => (await prisma.restrictedTerm.findMany({ select: { term: true, rule: true }, orderBy: { term: "asc" } })) as Term[]);
export const forgetTerms = () => invalidate("cache:pabili-terms");

export type Screening = {
  /** Things that can't be sent at all, with why: per item index (-1 for the notes) */
  blocked: { index: number; message: string }[];
  needsPrescription: boolean;
  /** Alcohol or cigarettes: 18 and older, verified ID */
  adult: boolean;
  alcohol: boolean;
  /** For the rider: CHEMICAL, LPG, BULKY */
  handling: ("CHEMICAL" | "LPG" | "BULKY")[];
  /** Per item: the rules it trips (for the list's badges) */
  flags: RestrictRule[][];
};

const BANNED_WHY = "Feasto riders can't buy this: drugs, weapons, firecrackers, fuel, money, load, betting and live animals aren't allowed.";

/** Checks a list: what's not allowed, and what needs a prescription, an adult or care */
export function screen(items: Pick<PabiliItem, "name" | "note" | "prescription" | "replacement">[], notes: string | null, terms: Term[], options: { liquorBan: boolean }): Screening {
  const result: Screening = { blocked: [], needsPrescription: false, adult: false, alcohol: false, handling: [], flags: [] };
  const handling = new Set<Screening["handling"][number]>();
  const check = (text: string, index: number) => {
    const rules = [...new Set(rulesIn(text, terms).map((t) => t.rule))];
    for (const rule of rules) {
      if (rule === "BANNED") {
        const word = rulesIn(text, terms).find((t) => t.rule === "BANNED")!.term;
        result.blocked.push({ index, message: `“${word}”: ${BANNED_WHY}` });
      } else if (rule === "PRESCRIPTION") result.needsPrescription = true;
      else if (rule === "ALCOHOL" || rule === "TOBACCO") {
        result.adult = true;
        if (rule === "ALCOHOL") {
          result.alcohol = true;
          if (options.liquorBan) result.blocked.push({ index, message: "There's a liquor ban now, so Pabili can't buy alcohol until it's lifted." });
        }
      } else handling.add(rule);
    }
    return rules;
  };
  items.forEach((item, index) => {
    const rules = check([item.name, item.note ?? "", item.replacement ?? ""].join(" "), index);
    if (item.prescription && !rules.includes("PRESCRIPTION")) {
      rules.push("PRESCRIPTION");
      result.needsPrescription = true;
    }
    result.flags.push(rules);
  });
  if (notes) check(notes, -1);
  result.handling = [...handling];
  return result;
}

/** Whole years old on a date (birthdays count from the day itself) */
export function ageOn(birth: Date, on = new Date()) {
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const m = on.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

/** The estimates added up, or null when none were given */
export const estimateOf = (items: Pick<PabiliItem, "estimate" | "notBought">[]) => {
  const priced = items.filter((i) => !i.notBought && typeof i.estimate === "number" && i.estimate > 0);
  return priced.length ? Math.round(priced.reduce((sum, i) => sum + Number(i.estimate), 0) * 100) / 100 : null;
};

/** A receipt well above the estimates: more than a quarter and ₱20 over. Said plainly, or null. */
export function priceFlagFor(receipt: number, estimate: number | null) {
  if (!estimate || receipt <= estimate * 1.25 + 20) return null;
  const over = receipt - estimate;
  return `The receipt is ₱${over.toFixed(2)} (${Math.round((over / estimate) * 100)}%) more than your estimates for what was bought (₱${estimate.toFixed(2)}). Check the receipt photo.`;
}
