import type { StoreType } from "./types";

/** Store types in the order they're offered, with the label residents and vendors see. */
export const STORE_TYPE_OPTIONS: { value: StoreType; label: string }[] = [
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "FAST_FOOD", label: "Fast Food" },
  { value: "CARINDERIA", label: "Carinderia" },
  { value: "CAFE", label: "Café" },
  { value: "BAKERY", label: "Bakery" },
  { value: "MILK_TEA_DRINKS", label: "Milk Tea & Drinks" },
  { value: "SNACKS_STREET_FOOD", label: "Snacks & Street Food" },
  { value: "DESSERTS", label: "Desserts" },
  { value: "HOME_KITCHEN", label: "Home Kitchen" },
];

export const STORE_TYPE_LABEL = Object.fromEntries(STORE_TYPE_OPTIONS.map((o) => [o.value, o.label])) as Record<
  StoreType,
  string
>;

/** Mirrors the server: dine-in places start with table reservations switched on. */
const DINE_IN_TYPES = new Set<StoreType>(["RESTAURANT", "FAST_FOOD", "CARINDERIA", "CAFE"]);

export function acceptsReservationsByDefault(type: StoreType) {
  return DINE_IN_TYPES.has(type);
}
