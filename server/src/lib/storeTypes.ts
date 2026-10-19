import type { StoreType } from "../generated/prisma/enums.js";

export const STORE_TYPES = [
  "RESTAURANT",
  "FAST_FOOD",
  "CARINDERIA",
  "CAFE",
  "BAKERY",
  "MILK_TEA_DRINKS",
  "SNACKS_STREET_FOOD",
  "DESSERTS",
  "HOME_KITCHEN",
] as const satisfies readonly StoreType[];

/** Store types that usually have seats, so table reservations start switched on. */
const DINE_IN_TYPES = new Set<StoreType>(["RESTAURANT", "FAST_FOOD", "CARINDERIA", "CAFE"]);

export function acceptsReservationsByDefault(type: StoreType) {
  return DINE_IN_TYPES.has(type);
}
