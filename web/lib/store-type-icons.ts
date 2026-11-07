import { Coffee, CookingPot, Croissant, CupSoda, Hamburger, IceCreamCone, Popcorn, Soup, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { StoreType } from "./types";

/** Stands in for a photo: a category or store that has none shows what kind of food it is. */
export const STORE_TYPE_ICON: Record<StoreType, LucideIcon> = {
  RESTAURANT: UtensilsCrossed,
  FAST_FOOD: Hamburger,
  CARINDERIA: Soup,
  CAFE: Coffee,
  BAKERY: Croissant,
  MILK_TEA_DRINKS: CupSoda,
  SNACKS_STREET_FOOD: Popcorn,
  DESSERTS: IceCreamCone,
  HOME_KITCHEN: CookingPot,
};
