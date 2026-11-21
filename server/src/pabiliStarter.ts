import type { ShopCategory } from "./generated/prisma/enums.js";

/**
 * A starting list of Pabili shops, one or two of each kind, described by where they are rather
 * than by a business name (these aren't real listings). The admin replaces them with the real
 * shops of Naval in Admin › Pabili; residents can also ask for a shop that's missing.
 */
export const STARTER_SHOPS: { name: string; category: ShopCategory; landmark: string; hours: string | null }[] = [
  { name: "Public market: meat and fish", category: "MARKET", landmark: "Naval Public Market, meat and fish section", hours: "5 AM to 6 PM" },
  { name: "Public market: vegetables", category: "MARKET", landmark: "Naval Public Market, vegetable section", hours: "5 AM to 6 PM" },
  { name: "Rice stall at the market", category: "RICE", landmark: "Naval Public Market, beside the dry goods", hours: "6 AM to 6 PM" },
  { name: "Fruit stands at the market", category: "FRUITS", landmark: "Naval Public Market, front entrance", hours: "6 AM to 7 PM" },
  { name: "Bakery near the plaza", category: "BAKERY", landmark: "Across the town plaza", hours: "5 AM to 8 PM" },
  { name: "Botika near the plaza", category: "PHARMACY", landmark: "Along the street facing the town plaza", hours: "7 AM to 9 PM" },
  { name: "Grocery near the market", category: "GROCERY", landmark: "Main road, a few steps from the public market", hours: "8 AM to 8 PM" },
  { name: "Hardware on the national road", category: "HARDWARE", landmark: "National road, going to the port", hours: "8 AM to 5 PM" },
  { name: "School and office supplies", category: "SCHOOL_SUPPLIES", landmark: "Near the public schools", hours: "7 AM to 6 PM" },
  { name: "Water refilling station", category: "WATER", landmark: "Poblacion, beside the chapel", hours: "6 AM to 8 PM" },
  { name: "LPG dealer", category: "LPG", landmark: "National road, near the gas station", hours: "7 AM to 6 PM" },
  { name: "Agrivet and pet supplies", category: "AGRI_PET", landmark: "Near the public market, back side", hours: "7 AM to 5 PM" },
  { name: "Cellphone accessories", category: "GADGETS", landmark: "Naval Public Market, second floor", hours: "8 AM to 7 PM" },
  { name: "Beauty and personal care", category: "PERSONAL_CARE", landmark: "Main road, across the grocery", hours: "8 AM to 7 PM" },
];
