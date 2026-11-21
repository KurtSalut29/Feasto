/**
 * The rules of Pabili on the web: the same word check the server runs (server/src/lib/pabili.ts),
 * so the resident sees why something can't be bought while typing. The server checks again.
 */

export type ShopCategory =
  | "GROCERY" | "SARI_SARI" | "MARKET" | "RICE" | "BAKERY" | "PHARMACY" | "HARDWARE" | "SCHOOL_SUPPLIES"
  | "WATER" | "LPG" | "AGRI_PET" | "PERSONAL_CARE" | "GADGETS" | "FRUITS" | "OTHER";

export type RestrictRule = "BANNED" | "PRESCRIPTION" | "ALCOHOL" | "TOBACCO" | "CHEMICAL" | "LPG" | "BULKY";
export type Term = { term: string; rule: RestrictRule };

export const UNITS = ["pc", "kg", "g", "L", "mL", "pack", "sachet", "bottle", "can", "box", "dozen", "tray", "bundle", "sack", "gallon", "meter"] as const;
export type Unit = (typeof UNITS)[number];

/** How a unit reads after a number: "1.5 kg", "2 bottles", "1 tali (bundle)" */
export const UNIT_LABEL: Record<Unit, { one: string; many: string }> = {
  pc: { one: "piece", many: "pieces" },
  kg: { one: "kg", many: "kg" },
  g: { one: "g", many: "g" },
  L: { one: "L", many: "L" },
  mL: { one: "mL", many: "mL" },
  pack: { one: "pack", many: "packs" },
  sachet: { one: "sachet", many: "sachets" },
  bottle: { one: "bottle", many: "bottles" },
  can: { one: "can", many: "cans" },
  box: { one: "box", many: "boxes" },
  dozen: { one: "dozen", many: "dozen" },
  tray: { one: "tray", many: "trays" },
  bundle: { one: "tali (bundle)", many: "tali (bundles)" },
  sack: { one: "sack", many: "sacks" },
  gallon: { one: "gallon", many: "gallons" },
  meter: { one: "meter", many: "meters" },
};

export const amountOf = (quantity: number, unit: Unit | undefined) => {
  const n = Number(quantity);
  const u = UNIT_LABEL[unit ?? "pc"];
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, "")} ${n === 1 ? u.one : u.many}`;
};

/** The unit a new line starts with, by the kind of shop */
export const DEFAULT_UNIT: Record<ShopCategory, Unit> = {
  GROCERY: "pc", SARI_SARI: "pc", MARKET: "kg", RICE: "kg", BAKERY: "pc", PHARMACY: "pc", HARDWARE: "pc", SCHOOL_SUPPLIES: "pc",
  WATER: "gallon", LPG: "pc", AGRI_PET: "kg", PERSONAL_CARE: "pc", GADGETS: "pc", FRUITS: "kg", OTHER: "pc",
};

/** What to try first on each kind of shop, so a new line isn't a blank box */
export const EXAMPLE: Record<ShopCategory, string> = {
  GROCERY: "Coke 1.5L", SARI_SARI: "Lucky Me pancit canton", MARKET: "Bangus", RICE: "Dinorado rice", BAKERY: "Pandesal", PHARMACY: "Biogesic 500 mg",
  HARDWARE: "Electrical tape", SCHOOL_SUPPLIES: "Yellow pad", WATER: "Purified water", LPG: "Butane canister", AGRI_PET: "Dog food",
  PERSONAL_CARE: "Shampoo sachet", GADGETS: "USB-C charger", FRUITS: "Mangga", OTHER: "What to buy",
};

export const IF_MISSING = [
  { value: "CALL", label: "Call me first" },
  { value: "ANY", label: "Any brand or size is fine" },
  { value: "REPLACE", label: "Get this instead…" },
  { value: "SKIP", label: "Skip it" },
] as const;
export type IfMissing = (typeof IF_MISSING)[number]["value"];
export const ifMissingLabel = (v: string | undefined) => IF_MISSING.find((o) => o.value === v)?.label ?? "Call me first";

export const NOT_BOUGHT = [
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "NEEDS_PRESCRIPTION", label: "Not sold: needs a prescription" },
  { value: "AGE_CHECK", label: "Not sold: needs an ID" },
  { value: "TOO_BIG", label: "Too big for the motorcycle" },
  { value: "OVER_BUDGET", label: "Over the budget" },
  { value: "OTHER", label: "Couldn't buy it" },
] as const;
export type NotBoughtReason = (typeof NOT_BOUGHT)[number]["value"];
export const notBoughtLabel = (v: string) => NOT_BOUGHT.find((o) => o.value === v)?.label ?? "Couldn't buy it";

/** A line of the list, as kept on the Pabili (older ones have only name, quantity and note) */
export type PabiliItem = {
  name: string;
  quantity: number;
  unit?: Unit;
  note: string | null;
  estimate?: number | null;
  ifMissing?: IfMissing;
  replacement?: string | null;
  prescription?: boolean;
  flags?: RestrictRule[];
  notBought?: { reason: NotBoughtReason; at: string } | null;
};

/** What each rule means for the person typing */
export const RULE_TEXT: Record<Exclude<RestrictRule, "BANNED">, { label: string; text: string }> = {
  PRESCRIPTION: { label: "Needs a prescription", text: "Bought only at a botika, with a photo of your prescription. The pharmacist decides." },
  ALCOHOL: { label: "18+", text: "For 18 and older with a verified ID. The rider checks your ID at the door." },
  TOBACCO: { label: "18+", text: "For 18 and older with a verified ID. The rider checks your ID at the door." },
  CHEMICAL: { label: "Sealed only", text: "Only sealed containers; the rider is told to carry it carefully." },
  LPG: { label: "Gas tank", text: "Only if the rider can carry it safely on the motorcycle. A small butane canister is fine." },
  BULKY: { label: "Heavy or long", text: "It may not fit on a motorcycle. The rider can say no." },
};

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The rules a piece of text trips: whole words only ("gin" isn't in "ginger") */
export function rulesIn(text: string, terms: Term[]): Term[] {
  const t = ` ${plain(text)} `;
  return terms.filter(({ term }) => new RegExp(`(^|[^a-z0-9])${escape(plain(term))}([^a-z0-9]|$)`).test(t));
}

export const BANNED_WHY = "Feasto riders can't buy this: drugs, weapons, firecrackers, fuel, money, load, betting and live animals aren't allowed.";
