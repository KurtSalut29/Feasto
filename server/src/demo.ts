// Resets Feasto to a clean demo for presentations.
// It DELETES EVERYTHING (accounts, stores, orders, photos, carts) and then creates
// realistic stores with photos and menus, riders, residents, two weeks of past orders,
// ratings and table bookings. The admin account is recreated from ADMIN_EMAIL/ADMIN_PASSWORD.
//
// Run:  docker compose run --rm demo      (see README "Demo data")
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import type { DiningTable, Fulfillment, MenuItem, OrderStatus, PaymentMethod, StoreType, User, Vendor } from "./generated/prisma/client.js";
import { hashPassword } from "./lib/auth.js";
import { priceDelivery } from "./lib/deliveryFee.js";
import { feastoShare } from "./lib/earnings.js";
import { distanceKm } from "./lib/geo.js";
import { prisma } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { daysFromToday } from "./lib/renewals.js";
import { DEFAULT_SETTINGS } from "./lib/settings.js";
import { newRiderCode } from "./lib/verification.js";

const DEMO_PASSWORD = "demo1234";
const PHOTO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "photos");
const DOCUMENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "documents");

// Same "random" data every run, so the demo is predictable
let seed = 20261121;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (p: number) => random() < p;
const minutes = (n: number) => n * 60_000;

// ---------- Content ----------

type Dish = { name: string; price: number; photo: string; category: string; description?: string; stock?: number | null; isAvailable?: boolean };
type StoreSeed = {
  owner: { name: string; email: string };
  name: string;
  storeType: StoreType;
  description: string;
  address: string;
  opensAt: string;
  closesAt: string;
  cover: string;
  tables?: number[];
  popularity: number;
  menu: Dish[];
};

/**
 * Map pins in Naval, Biliran, keyed by the owner's or resident's email. Each sits on the street in
 * its address (street names and positions from OpenStreetMap). Kept apart from the long store
 * list so each entry there stays readable.
 */
const PINS: Record<string, [lat: number, lng: number]> = {
  "nena@feasto.com": [11.55822, 124.39602], // Castin St, near the provincial hospital
  "remy@feasto.com": [11.56087, 124.39556], // Corvera St
  "marco@feasto.com": [11.57006, 124.39463], // Circumferential Rd, Atipolo
  "bea@feasto.com": [11.56424, 124.40139], // Padre Innocentes St, by BiPSU
  "ramon@feasto.com": [11.5594, 124.3925], // Abad St, at the public market
  "kim@feasto.com": [11.56379, 124.39864], // Vicentillo Extension
  "ben@feasto.com": [11.55546, 124.39695], // Santo Niño Rd
  "sofia@feasto.com": [11.56095, 124.39853], // Fatima Village
  "lorna@feasto.com": [11.56106, 124.39264], // Ballesteros St
  "carlos@feasto.com": [11.55882, 124.39232], // near Naval Port
  "tonyo@feasto.com": [11.56379, 124.39515], // Adobo Compound Rd
  "grace@feasto.com": [11.57064, 124.40171], // Calumpang
  "juan@feasto.com": [11.55842, 124.39682],
  "maria@feasto.com": [11.57133, 124.39132],
  "carlo@feasto.com": [11.57146, 124.39867],
  "andrea@feasto.com": [11.56035, 124.39299],
  "miguel@feasto.com": [11.55516, 124.39841],
  "patricia@feasto.com": [11.56677, 124.4015],
};
/** Juan's office at the municipal hall */
const JUAN_OFFICE: [number, number] = [11.56496, 124.4014];
const pin = (email: string) => ({ latitude: PINS[email][0], longitude: PINS[email][1] });

const STORES: StoreSeed[] = [
  {
    owner: { name: "Nena Santos", email: "nena@feasto.com" },
    name: "Aling Nena's Carinderia",
    storeType: "CARINDERIA",
    description: "Lutong bahay since 1998. Fresh ulam every morning, sulit for the whole family.",
    address: "Castin Street, Naval, Biliran",
    opensAt: "06:00",
    closesAt: "20:00",
    cover: "beef-caldereta",
    popularity: 5,
    menu: [
      { name: "Beef Caldereta", price: 120, photo: "beef-caldereta", category: "Ulam", description: "Tender beef in a rich tomato and liver sauce." },
      { name: "Beef Mechado", price: 115, photo: "beef-mechado", category: "Ulam", description: "Braised beef with potatoes and carrots." },
      { name: "Bistek Tagalog", price: 110, photo: "bistek", category: "Ulam", description: "Beef slices in soy sauce, calamansi and onion rings." },
      { name: "Adobong Talong", price: 80, photo: "adobong-talong", category: "Gulay", description: "Eggplant cooked adobo-style." },
      { name: "Tortang Talong", price: 70, photo: "tortang-talong", category: "Gulay", description: "Grilled eggplant omelette." },
      { name: "Ginataang Talong", price: 75, photo: "ginataang-talong", category: "Gulay", description: "Eggplant in creamy coconut milk.", isAvailable: false },
      { name: "Plain Rice", price: 15, photo: "plain-rice", category: "Kanin", description: "One cup of steamed white rice." },
    ],
  },
  {
    owner: { name: "Remedios Aquino", email: "remy@feasto.com" },
    name: "Lola Remy's Kitchen",
    storeType: "RESTAURANT",
    description: "Filipino family favorites in a cozy dining room. Perfect for celebrations.",
    address: "Corvera Street, Naval, Biliran",
    opensAt: "10:00",
    closesAt: "22:00",
    cover: "beef-asado",
    tables: [2, 2, 4, 4, 6, 8],
    popularity: 4,
    menu: [
      { name: "Beef Asado", price: 280, photo: "beef-asado", category: "Mains", description: "Slow-braised beef in a sweet soy and tomato sauce." },
      { name: "Sweet and Sour Pork", price: 240, photo: "sweet-sour-pork", category: "Mains", description: "Crispy pork with bell peppers and pineapple." },
      { name: "Chicken Inasal", price: 210, photo: "chicken-inasal", category: "Mains", description: "Grilled chicken marinated in calamansi and annatto." },
      { name: "Ginataang Hipon", price: 320, photo: "sinigang-hipon", category: "Mains", description: "Shrimp simmered in spiced coconut milk." },
      { name: "Pancit Canton", price: 220, photo: "pancit-canton", category: "Noodles & Rice", description: "Stir-fried egg noodles with shrimp and vegetables. Good for 3." },
      { name: "Shrimp Fried Rice", price: 180, photo: "shrimp-fried-rice", category: "Noodles & Rice", description: "Wok-fried rice with shrimp, egg and spring onions. Good for 2." },
      { name: "Leche Flan", price: 90, photo: "leche-flan", category: "Desserts", description: "Silky caramel custard." },
    ],
  },
  {
    owner: { name: "Marco Villanueva", email: "marco@feasto.com" },
    name: "Burger Barn",
    storeType: "FAST_FOOD",
    description: "Big burgers, crispy chicken and Pinoy-style spaghetti. Fast and hot.",
    address: "Biliran Circumferential Road, Brgy. Atipolo, Naval, Biliran",
    opensAt: "09:00",
    closesAt: "23:00",
    cover: "double-burger",
    popularity: 5,
    menu: [
      { name: "Double Barn Burger", price: 159, photo: "double-burger", category: "Burgers", description: "Two beef patties, cheese, pickles and barn sauce." },
      { name: "Crispy Chicken Burger", price: 139, photo: "chicken-burger", category: "Burgers", description: "Crunchy chicken fillet, lettuce and mayo in a toasted bun." },
      { name: "Chicken Sandwich", price: 119, photo: "chicken-sandwich", category: "Burgers", description: "Grilled chicken, cheese and coleslaw on soft bread." },
      { name: "Fried Chicken (2 pcs)", price: 149, photo: "fried-chicken", category: "Chicken", description: "Crunchy outside, juicy inside. With gravy." },
      { name: "Chicken Wings (6 pcs)", price: 169, photo: "chicken-wings", category: "Chicken", description: "Tossed in spicy buffalo sauce." },
      { name: "Sweet-Style Spaghetti", price: 89, photo: "spaghetti", category: "Sides", description: "Pinoy-style sweet sauce with hotdog slices and cheese." },
      { name: "Seasoned Fries", price: 69, photo: "fries", category: "Sides", description: "Crispy fries tossed in our house seasoning." },
    ],
  },
  {
    owner: { name: "Bea Lim", email: "bea@feasto.com" },
    name: "Kape Kanto",
    storeType: "CAFE",
    description: "Neighborhood coffee bar with all-day breakfast and quiet tables for work.",
    address: "Padre Innocentes Street, Naval, Biliran",
    opensAt: "07:00",
    closesAt: "21:00",
    cover: "spanish-latte",
    tables: [2, 2, 4, 4],
    popularity: 4,
    menu: [
      { name: "Iced Spanish Latte", price: 150, photo: "spanish-latte", category: "Coffee", description: "Espresso with sweetened condensed milk." },
      { name: "Iced Caramel Latte", price: 145, photo: "iced-coffee", category: "Coffee", description: "Espresso, cold milk and caramel over ice. 16 oz." },
      { name: "Iced Americano", price: 110, photo: "mocha-frappe", category: "Coffee", description: "Double espresso over ice, no milk. 16 oz." },
      { name: "Chai Latte", price: 130, photo: "chai-latte", category: "Tea", description: "Spiced black tea with steamed milk. Hot, 12 oz." },
      { name: "Cinnamon Roll", price: 95, photo: "cinnamon-roll", category: "Pastries", stock: 12, description: "Soft roll with cinnamon sugar and cream cheese icing." },
      { name: "Banana Pancakes", price: 180, photo: "banana-pancakes", category: "All-day Breakfast", description: "Three fluffy pancakes with banana slices and syrup." },
      { name: "Salmon Eggs Benedict", price: 260, photo: "eggs-benedict", category: "All-day Breakfast", description: "Smoked salmon and poached eggs on an English muffin, with hollandaise." },
    ],
  },
  {
    owner: { name: "Ramon Cruz", email: "ramon@feasto.com" },
    name: "Panaderia de Naval",
    storeType: "BAKERY",
    description: "Freshly baked pandesal from 5 AM, plus merienda favorites all day.",
    address: "Abad Street, Naval, Biliran",
    opensAt: "05:00",
    closesAt: "19:00",
    cover: "ensaymada",
    popularity: 3,
    menu: [
      { name: "Pandesal (10 pcs)", price: 50, photo: "pandesal", category: "Breads", stock: 40, description: "Classic soft bread rolls, baked every morning." },
      { name: "Monay (6 pcs)", price: 60, photo: "monay", category: "Breads", stock: 25, description: "Dense, slightly sweet bread rolls." },
      { name: "Raisin Bread Loaf", price: 85, photo: "pan-de-coco", category: "Breads", stock: 10, description: "Soft sliced loaf studded with raisins." },
      { name: "Ensaymada", price: 45, photo: "ensaymada", category: "Pastries", description: "Buttery brioche with sugar and cheese.", stock: 30 },
      { name: "Egg Tarts (4 pcs)", price: 120, photo: "egg-tart", category: "Pastries", stock: 0, description: "Flaky crust with a smooth baked egg custard." },
      { name: "Cassava Cake", price: 150, photo: "cassava-cake", category: "Cakes", stock: 8, description: "Grated cassava baked with coconut milk and a custard top. 6 slices." },
      { name: "Butter Cake", price: 180, photo: "butter-cake", category: "Cakes", stock: 6, description: "Moist, buttery loaf cake. Whole loaf." },
    ],
  },
  {
    owner: { name: "Kim Reyes", email: "kim@feasto.com" },
    name: "Tea Time PH",
    storeType: "MILK_TEA_DRINKS",
    description: "Milk tea, shakes and smoothies. Choose your sugar level in the notes.",
    address: "Vicentillo Extension, Naval, Biliran",
    opensAt: "10:00",
    closesAt: "22:00",
    cover: "thai-milk-tea",
    popularity: 4,
    menu: [
      { name: "Thai Milk Tea", price: 99, photo: "thai-milk-tea", category: "Milk Tea", description: "Strong Thai tea with milk and tapioca pearls. 22 oz." },
      { name: "Mango Smoothie", price: 120, photo: "mango-smoothie", category: "Smoothies", description: "Ripe Philippine mangoes blended with ice. 16 oz." },
      { name: "Strawberry Banana Shake", price: 125, photo: "strawberry-banana-shake", category: "Smoothies", description: "Strawberries, banana and milk, blended thick. 16 oz." },
      { name: "Banana Milkshake", price: 110, photo: "banana-milkshake", category: "Shakes", description: "Banana and vanilla ice cream, blended. 16 oz." },
      { name: "Cherry Vanilla Shake", price: 130, photo: "chocolate-shake", category: "Shakes", description: "Vanilla ice cream with cherry syrup and whipped cream. 16 oz." },
    ],
  },
  {
    owner: { name: "Benjie Torres", email: "ben@feasto.com" },
    name: "Kuya Ben's Street Eats",
    storeType: "SNACKS_STREET_FOOD",
    description: "Afternoon street food fix: BBQ sticks, lumpia, siomai and more.",
    address: "Santo Niño Road, Naval, Biliran",
    opensAt: "14:00",
    closesAt: "23:00",
    cover: "chicken-bbq",
    popularity: 3,
    menu: [
      { name: "Chicken BBQ (3 sticks)", price: 90, photo: "chicken-bbq", category: "Grilled", description: "Sweet-glazed chicken skewers, grilled over charcoal." },
      { name: "Lumpiang Shanghai (10 pcs)", price: 90, photo: "lumpiang-shanghai", category: "Fried", description: "Crispy pork spring rolls with sweet chili dip." },
      { name: "Calamares", price: 110, photo: "calamares", category: "Fried", description: "Battered squid rings with spiced vinegar." },
      { name: "Fish Cakes (6 pcs)", price: 60, photo: "fish-cakes", category: "Fried", description: "Fried fish cakes with sweet and spicy sauce." },
      { name: "Pork Siomai (6 pcs)", price: 70, photo: "fried-wonton", category: "Steamed", description: "Steamed pork dumplings with soy-calamansi and chili garlic." },
      { name: "Maruya (Banana Fritters)", price: 40, photo: "maruya", category: "Merienda", description: "Saba banana in batter, fried and rolled in sugar." },
    ],
  },
  {
    owner: { name: "Sofia Mendoza", email: "sofia@feasto.com" },
    name: "Sweet Spot Desserts",
    storeType: "DESSERTS",
    description: "Homemade cakes, flan and chilled treats for every sweet tooth.",
    address: "Fatima Village, Naval, Biliran",
    opensAt: "11:00",
    closesAt: "22:00",
    cover: "mango-float",
    popularity: 3,
    menu: [
      { name: "Mango Float Cup", price: 120, photo: "mango-float", category: "Chilled", stock: 15, description: "Layers of graham, cream and fresh mango. Served cold." },
      { name: "Leche Flan", price: 110, photo: "leche-flan-2", category: "Chilled", description: "Silky caramel custard." },
      { name: "Classic Cheesecake Slice", price: 160, photo: "cheesecake", category: "Cakes", description: "Creamy New York-style cheesecake on a graham crust." },
      { name: "Fudge Brownies (2 pcs)", price: 90, photo: "brownies", category: "Cakes", description: "Dense chocolate brownies with a crackly top." },
      { name: "Churros with Chocolate", price: 120, photo: "churros", category: "Warm", description: "Cinnamon sugar churros with a warm chocolate dip." },
      { name: "Ginataang Saging", price: 80, photo: "ginataang-saging", category: "Warm", description: "Bananas and sago in sweet coconut milk." },
      { name: "Chocolate Truffles (6 pcs)", price: 150, photo: "chocolate-truffles", category: "Gifts", description: "Hand-rolled dark chocolate truffles in a gift box." },
    ],
  },
  {
    owner: { name: "Lorna Bautista", email: "lorna@feasto.com" },
    name: "Tita Lorna's Home Kitchen",
    storeType: "HOME_KITCHEN",
    description: "Small-batch home cooking. Limited servings daily, so order early!",
    address: "Ballesteros Street, Naval, Biliran",
    opensAt: "10:00",
    closesAt: "20:00",
    cover: "arroz-caldo",
    popularity: 2,
    menu: [
      { name: "Chicken Adobo", price: 150, photo: "chicken-adobo", category: "Ulam", stock: 10, description: "Chicken braised in soy, vinegar, garlic and bay leaf." },
      { name: "Filipino Chicken Curry", price: 160, photo: "chicken-curry", category: "Ulam", stock: 8, description: "Chicken and potatoes in a mild coconut curry." },
      { name: "Braised Oxtail", price: 280, photo: "braised-oxtail", category: "Ulam", stock: 5, description: "Fall-off-the-bone oxtail in a rich peanut sauce, with bagoong." },
      { name: "Arroz Caldo", price: 90, photo: "arroz-caldo", category: "Soups", description: "Ginger chicken rice porridge with toasted garlic.", stock: 12 },
      { name: "Pancit Bihon", price: 180, photo: "pancit-bihon", category: "Noodles", stock: 6, description: "Rice noodles with chicken and vegetables. Good for 3." },
    ],
  },
  {
    owner: { name: "Carlos Dizon", email: "carlos@feasto.com" },
    name: "Isla Grill & Seafood",
    storeType: "RESTAURANT",
    description: "Grilled seafood and liempo, island style. Group tables available.",
    address: "Near Naval Port, Naval, Biliran",
    opensAt: "11:00",
    closesAt: "22:00",
    cover: "seafood-paella",
    tables: [4, 4, 6, 6, 10],
    popularity: 3,
    menu: [
      { name: "Grilled Pork Liempo", price: 260, photo: "pork-liempo", category: "Grill", description: "Marinated pork belly grilled until crisp, with soy-vinegar dip." },
      { name: "Garlic Butter Shrimp", price: 340, photo: "garlic-shrimp", category: "Seafood", description: "Shrimp sauteed in garlic butter. Good for 2." },
      { name: "Steamed Lapu-Lapu", price: 420, photo: "steamed-fish", category: "Seafood", description: "Whole grouper steamed with ginger and soy. Good for 3 to 4." },
      { name: "Crab Cakes (4 pcs)", price: 280, photo: "fried-crab", category: "Seafood", description: "Pan-fried crab cakes with a tangy dip." },
      { name: "Salt & Pepper Squid", price: 280, photo: "salt-pepper-squid", category: "Seafood", description: "Crispy squid tossed with garlic, chili and pepper." },
      { name: "Seafood Paella", price: 450, photo: "seafood-paella", category: "Rice", description: "Good for 3 to 4." },
    ],
  },
];

/** Stores still waiting for the admin, so the Approvals page has something to review. */
const PENDING_STORES = [
  { owner: { name: "Antonio Garcia", email: "tonyo@feasto.com" }, name: "Mang Tonyo's Lechon", storeType: "RESTAURANT" as const, address: "Adobo Compound Road, Naval, Biliran" },
  { owner: { name: "Grace Tan", email: "grace@feasto.com" }, name: "Brew & Bloom Café", storeType: "CAFE" as const, address: "Brgy. Calumpang, Naval, Biliran" },
];

// Pedro, Jessa and Rico are free riders. Mark and Leo ride for Aling Nena's Carinderia.
const RIDERS: { name: string; email: string; vehicleModel: string; plateNumber: string; licenseNumber: string; store?: string; pending?: boolean; licenseExpiresIn?: number }[] = [
  { name: "Pedro Reyes", email: "pedro@feasto.com", vehicleModel: "Honda Click 125", plateNumber: "NBC 1234", licenseNumber: "N01-21-104455" },
  { name: "Jessa Ramos", email: "jessa@feasto.com", vehicleModel: "Yamaha Mio i125", plateNumber: "ADF 5678", licenseNumber: "N02-19-223344", licenseExpiresIn: 15 },
  { name: "Mark Navarro", email: "mark@feasto.com", vehicleModel: "Suzuki Raider 150", plateNumber: "KLM 3456", licenseNumber: "N04-20-331122", store: "nena@feasto.com", licenseExpiresIn: 10 },
  { name: "Leo Castillo", email: "leo@feasto.com", vehicleModel: "Honda TMX 125", plateNumber: "PQR 7890", licenseNumber: "N05-23-778899", store: "nena@feasto.com", pending: true },
  { name: "Rico Fernandez", email: "rico@feasto.com", vehicleModel: "Kawasaki Barako 175", plateNumber: "WQR 9012", licenseNumber: "N03-22-556677", pending: true },
  { name: "Ariel Aquino", email: "ariel@feasto.com", vehicleModel: "Honda XRM 125", plateNumber: "VTX 2468", licenseNumber: "N06-18-990011", licenseExpiresIn: -10 },
];

const RESIDENTS = [
  { name: "Juan Dela Cruz", email: "juan@feasto.com", address: "Purok 3, Castin Street, Naval, Biliran", landmark: "Blue gate beside the sari-sari store" },
  { name: "Maria Clara Santos", email: "maria@feasto.com", address: "Brgy. Atipolo, Naval, Biliran", landmark: "Near the barangay hall" },
  { name: "Carlo Mendoza", email: "carlo@feasto.com", address: "Brgy. Calumpang, Naval, Biliran" },
  { name: "Andrea Lopez", email: "andrea@feasto.com", address: "Brgy. Santissimo Rosario, Naval, Biliran", landmark: "Unit 3B" },
  { name: "Miguel Rivera", email: "miguel@feasto.com", address: "Brgy. Santo Niño, Naval, Biliran" },
  { name: "Patricia Gomez", email: "patricia@feasto.com", address: "Near the Provincial Capitol, Brgy. Calumpang, Naval, Biliran" },
];

const COMMENTS: Record<number, string[]> = {
  5: ["Sobrang sarap! Will order again.", "Mainit pa pagdating. Perfect!", "Best in the barangay, no contest.", "Generous servings and very fast.", "Lasang lutong bahay talaga.", "Rider was super polite too."],
  4: ["Masarap, medyo natagalan lang.", "Good food, fair price.", "Solid! Sana may extra sauce.", "Really good, packaging could be better."],
  3: ["Okay lang, a bit salty today.", "Food was fine but arrived lukewarm."],
  2: ["Smaller portion than last time."],
  1: ["Wrong item delivered."],
};

// ---------- Helpers ----------

const PH_OFFSET = 8 * 3600_000;
/** A Date for the given Manila day offset (0 = today) and Manila "HH:MM". */
function manilaAt(daysAgo: number, time: string) {
  const day = new Date(Date.now() + PH_OFFSET - daysAgo * 86400_000).toISOString().slice(0, 10);
  return new Date(`${day}T${time}:00+08:00`);
}
/** A Philippine mobile number like 0917 482 3019. */
const phone = () => `09${pick(["17", "18", "19", "20", "27", "45", "56", "66", "77", "95"])}${String(between(1000000, 9999999))}`;
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

function weightedRating() {
  const r = random();
  return r < 0.6 ? 5 : r < 0.9 ? 4 : r < 0.97 ? 3 : r < 0.99 ? 2 : 1;
}

// ---------- Reset ----------

async function wipe() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "DocumentRenewal", "ActivityLog", "PlatformSettings", "JobOffer", "Review", "Favorite", "Notification", "OutboxEvent", "Booking", "DiningTable", "OrderItem", "Order", "Checkout", "MenuItem", "Address", "RiderProfile", "Vendor", "User" CASCADE`,
  );
  // Carts, caches, login lockouts, disabled-account list, rider positions and old reports
  await redis.flushdb();
  await mkdir(config.uploadDir, { recursive: true });
  for (const file of await readdir(config.uploadDir)) await rm(path.join(config.uploadDir, file), { force: true });
  await mkdir(config.documentDir, { recursive: true });
  for (const file of await readdir(config.documentDir)) await rm(path.join(config.documentDir, file), { force: true });
}

/** A copy of a made-up sample document (marked SAMPLE), never a real permit or license. */
async function sampleDocument(kind: "permit" | "license") {
  const name = `${randomBytes(16).toString("hex")}.png`;
  await copyFile(path.join(DOCUMENT_DIR, `sample-${kind}.png`), path.join(config.documentDir, name));
  return name;
}

/** The made-up business details every demo store is verified with. */
const permitOf = async (storeName: string, index: number) => ({
  businessName: `${storeName} Food Services`,
  businessPhone: phone(),
  permitNumber: `NVL-2026-${String(1001 + index)}`,
  permitExpiresAt: new Date("2027-12-31"),
  permitFile: await sampleDocument("permit"),
  riderCode: newRiderCode(),
});

async function photo(slug: string) {
  const name = `demo-${slug}.jpg`;
  await copyFile(path.join(PHOTO_DIR, `${slug}.jpg`), path.join(config.uploadDir, name));
  return `/uploads/${name}`;
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD first.");

  console.log("Wiping all data…");
  await wipe();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const accountsSince = manilaAt(30, "09:00");
  const admin = await prisma.user.create({
    data: { email: adminEmail, name: "Feasto Admin", role: "ADMIN", passwordHash: await hashPassword(adminPassword), createdAt: accountsSince },
  });

  // ----- Stores with menus and tables -----
  console.log("Creating stores…");
  const stores: { seed: StoreSeed; owner: User; vendor: Vendor; items: MenuItem[]; tables: DiningTable[] }[] = [];
  for (const [index, s] of STORES.entries()) {
    const imageUrl = await photo(s.cover);
    const owner = await prisma.user.create({
      data: {
        email: s.owner.email,
        name: s.owner.name,
        phone: phone(),
        role: "VENDOR",
        passwordHash,
        createdAt: new Date(accountsSince.getTime() + index * 86400_000),
        vendor: {
          create: {
            name: s.name,
            storeType: s.storeType,
            acceptsReservations: Boolean(s.tables),
            description: s.description,
            address: s.address,
            ...pin(s.owner.email),
            imageUrl,
            ...(await permitOf(s.name, index)),
            status: "APPROVED",
            reviewedAt: new Date(accountsSince.getTime() + index * 86400_000 + 3600_000),
            opensAt: s.opensAt,
            closesAt: s.closesAt,
            createdAt: new Date(accountsSince.getTime() + index * 86400_000),
          },
        },
      },
      include: { vendor: true },
    });
    const vendor = owner.vendor!;
    const items: MenuItem[] = [];
    for (const dish of s.menu) {
      items.push(
        await prisma.menuItem.create({
          data: {
            vendorId: vendor.id,
            name: dish.name,
            category: dish.category,
            description: dish.description ?? null,
            price: dish.price,
            imageUrl: await photo(dish.photo),
            stock: dish.stock ?? null,
            isAvailable: dish.isAvailable ?? true,
          },
        }),
      );
    }
    const tables: DiningTable[] = [];
    for (const [i, seats] of (s.tables ?? []).entries()) {
      tables.push(await prisma.diningTable.create({ data: { vendorId: vendor.id, label: `Table ${i + 1}`, seats } }));
    }
    stores.push({ seed: s, owner, vendor, items, tables });
  }

  for (const [index, s] of PENDING_STORES.entries()) {
    await prisma.user.create({
      data: {
        email: s.owner.email,
        name: s.owner.name,
        phone: phone(),
        role: "VENDOR",
        passwordHash,
        createdAt: manilaAt(1 - index, "08:30"),
        vendor: {
          create: {
            name: s.name,
            storeType: s.storeType,
            acceptsReservations: s.storeType === "RESTAURANT" || s.storeType === "CAFE",
            address: s.address,
            ...pin(s.owner.email),
            ...(await permitOf(s.name, 100 + index)),
            opensAt: "09:00",
            closesAt: "21:00",
            createdAt: manilaAt(1 - index, "08:30"),
          },
        },
      },
    });
  }

  // ----- Riders and residents -----
  console.log("Creating riders and residents…");
  const riders: User[] = [];
  for (const [index, r] of RIDERS.entries()) {
    riders.push(
      await prisma.user.create({
        data: {
          email: r.email,
          name: r.name,
          phone: phone(),
          role: "RIDER",
          passwordHash,
          createdAt: r.pending ? manilaAt(0, "07:45") : new Date(accountsSince.getTime() + index * 43200_000),
          riderProfile: {
            create: {
              vendorId: r.store ? (await prisma.vendor.findFirstOrThrow({ where: { owner: { email: r.store } }, select: { id: true } })).id : null,
              vehicleModel: r.vehicleModel,
              plateNumber: r.plateNumber,
              licenseNumber: r.licenseNumber,
              licenseExpiresAt: r.licenseExpiresIn === undefined ? new Date("2028-06-30") : daysFromToday(r.licenseExpiresIn),
              licenseFile: await sampleDocument("license"),
              birthDate: new Date(`${1988 + index}-03-15`),
              address: "Brgy. Santissimo Rosario, Naval, Biliran",
              emergencyName: "Maria Santos",
              emergencyPhone: phone(),
              status: r.pending ? "PENDING" : "APPROVED",
              reviewedAt: r.pending ? null : accountsSince,
              isOnline: !r.pending && index < 2,
            },
          },
        },
      }),
    );
  }
  const activeRiders = riders.filter((_, i) => !RIDERS[i].pending);

  const residents: { user: User; address: string; latitude: number; longitude: number }[] = [];
  for (const [index, r] of RESIDENTS.entries()) {
    const user = await prisma.user.create({
      data: {
        email: r.email,
        name: r.name,
        phone: phone(),
        role: "RESIDENT",
        passwordHash,
        createdAt: new Date(accountsSince.getTime() + index * 20000_000),
        addresses: {
          create: [
            { label: "Home", details: r.address, landmark: r.landmark ?? null, isDefault: true, ...pin(r.email) },
            ...(index === 0
              ? [
                  {
                    label: "Office",
                    details: "2F, Naval Municipal Hall, Vicentillo Extension, Naval, Biliran",
                    landmark: "Ask at the information desk",
                    latitude: JUAN_OFFICE[0],
                    longitude: JUAN_OFFICE[1],
                  },
                ]
              : []),
          ],
        },
      },
    });
    residents.push({ user, address: r.address, ...pin(r.email) });
  }
  const juan = residents[0];

  // ----- Two weeks of orders -----
  console.log("Creating orders, ratings and bookings…");
  const weights = stores.flatMap((store) => Array<typeof store>(store.seed.popularity).fill(store));
  const ratingTotals = new Map<string, { sum: number; count: number }>();
  const nowManilaMinutes = toMinutes(new Date(Date.now() + PH_OFFSET).toISOString().slice(11, 16));
  let orderCount = 0;

  async function createOrder(opts: {
    store: (typeof stores)[number];
    resident: (typeof residents)[number];
    createdAt: Date;
    status: OrderStatus;
    fulfillment?: Fulfillment;
    paymentMethod?: PaymentMethod;
    rider?: (typeof riders)[number] | null;
    review?: boolean;
  }) {
    const { store, resident, createdAt } = opts;
    const fulfillment = opts.fulfillment ?? (chance(0.7) ? "DELIVERY" : "PICKUP");
    // Pickup orders end as COMPLETED (collected), deliveries as DELIVERED
    const status: OrderStatus = opts.status === "DELIVERED" && fulfillment === "PICKUP" ? "COMPLETED" : opts.status;
    const paymentMethod = opts.paymentMethod ?? (chance(0.65) ? "COD" : "ONLINE");
    const available = store.items.filter((i) => i.isAvailable && i.stock !== 0);
    const lines = [...new Set(Array.from({ length: between(1, 3) }, () => pick(available)))].map((item) => ({
      item,
      quantity: between(1, Number(item.price) < 60 ? 3 : 2),
    }));
    const subtotal = lines.reduce((n, l) => n + Number(l.item.price) * l.quantity, 0);
    // Priced like a real checkout: by the distance from the store (road ≈ 1.3× the straight line) and the hour
    const km =
      store.vendor.latitude != null && store.vendor.longitude != null
        ? Math.round(distanceKm({ lat: store.vendor.latitude, lng: store.vendor.longitude }, { lat: resident.latitude, lng: resident.longitude }) * 1.3 * 10) / 10
        : null;
    const deliveryFee = fulfillment === "DELIVERY" ? priceDelivery(km, DEFAULT_SETTINGS, createdAt).fee : 0;
    const deliveryKm = fulfillment === "DELIVERY" ? km : null;
    const finished = ["DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"].includes(status);
    const failed = status === "REJECTED" || status === "CANCELLED";
    const reached = (step: OrderStatus[]) => step.includes(status);
    const rider = fulfillment === "DELIVERY" && reached(["PICKED_UP", "DELIVERED"]) ? (opts.rider ?? pick(activeRiders.filter((r) => [undefined, store.owner.email].includes(RIDERS[riders.indexOf(r)].store)))) : (opts.rider ?? null);
    const at = (m: number) => new Date(createdAt.getTime() + minutes(m));

    const checkout = await prisma.checkout.create({
      data: {
        residentId: resident.user.id,
        fulfillment,
        paymentMethod,
        total: subtotal + deliveryFee,
        paymentStatus: paymentMethod === "ONLINE" ? (failed ? "REFUNDED" : "PAID") : status === "DELIVERED" || status === "COMPLETED" ? "PAID" : "PENDING",
        idempotencyKey: `demo-${++orderCount}`,
        deliveryAddress: fulfillment === "DELIVERY" ? resident.address : null,
        deliveryLat: fulfillment === "DELIVERY" ? resident.latitude : null,
        deliveryLng: fulfillment === "DELIVERY" ? resident.longitude : null,
        notes: chance(0.15) ? pick(["Less spicy please.", "Pakidagdagan ng sauce.", "No onions.", "Please call when outside."]) : null,
        createdAt,
      },
    });
    const order = await prisma.order.create({
      data: {
        checkoutId: checkout.id,
        vendorId: store.vendor.id,
        riderId: rider?.id ?? null,
        status,
        fulfillment,
        // Jobs already waiting when the demo starts are open to every free rider
        ...(["ACCEPTED", "PREPARING", "READY"].includes(status) && !rider && { dispatch: "EVERYONE" as const }),
        subtotal,
        deliveryFee,
        deliveryKm,
        ...feastoShare({ fulfillment, subtotal, deliveryFee, commissionFreeUntil: null }, DEFAULT_SETTINGS, createdAt),
        rejectReason: status === "REJECTED" ? pick(["Sold out for today.", "Kitchen is closing early."]) : status === "CANCELLED" ? "Cancelled by the resident" : null,
        acceptedAt: !failed && status !== "PLACED" ? at(3) : null,
        readyAt: reached(["READY", "PICKED_UP", "DELIVERED", "COMPLETED"]) ? at(between(15, 25)) : null,
        pickedUpAt: reached(["PICKED_UP", "DELIVERED"]) ? at(between(27, 32)) : null,
        finishedAt: finished ? at(failed ? between(2, 6) : between(38, 55)) : null,
        createdAt,
        placedAt: createdAt,
        items: { create: lines.map((l) => ({ menuItemId: l.item.id, name: l.item.name, unitPrice: l.item.price, quantity: l.quantity })) },
      },
    });

    if (opts.review && (status === "DELIVERED" || status === "COMPLETED")) {
      const rating = weightedRating();
      await prisma.review.create({
        data: {
          orderId: order.id,
          vendorId: store.vendor.id,
          residentId: resident.user.id,
          rating,
          comment: chance(0.6) ? pick(COMMENTS[rating]) : null,
          createdAt: at(between(70, 300)),
        },
      });
      const totals = ratingTotals.get(store.vendor.id) ?? { sum: 0, count: 0 };
      ratingTotals.set(store.vendor.id, { sum: totals.sum + rating, count: totals.count + 1 });
    }
    return order;
  }

  for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
    const weekday = new Date(Date.now() + PH_OFFSET - daysAgo * 86400_000).getUTCDay();
    const busy = weekday === 0 || weekday === 5 || weekday === 6;
    let count = between(busy ? 9 : 5, busy ? 15 : 10);
    if (daysAgo === 0) count = Math.max(2, Math.round((count * Math.max(0, nowManilaMinutes - 6 * 60)) / (16 * 60)));
    for (let n = 0; n < count; n++) {
      const store = pick(weights);
      const open = toMinutes(store.seed.opensAt);
      const close = daysAgo === 0 ? Math.min(toMinutes(store.seed.closesAt), nowManilaMinutes - 70) : toMinutes(store.seed.closesAt);
      if (close <= open + 30) continue;
      const createdAt = manilaAt(daysAgo, toTime(between(open + 10, close - 20)));
      const roll = random();
      const status: OrderStatus = roll < 0.06 ? "CANCELLED" : roll < 0.1 ? "REJECTED" : "DELIVERED";
      await createOrder({ store, resident: pick(residents), createdAt, status, review: chance(0.68) });
    }
  }

  // ----- Live orders right now -----
  const byName = (name: string) => stores.find((s) => s.seed.name === name)!;
  const ago = (m: number) => new Date(Date.now() - minutes(m));
  // Orders and jobs nobody has taken are cancelled by themselves after the admin's auto-cancel time
  // (10 minutes by default), so these start fresh: the store and the riders have about 9 minutes.
  const startFresh = (order: { id: string }, status: OrderStatus) =>
    prisma.order.update({
      where: { id: order.id },
      data: status === "PLACED" ? { createdAt: ago(1) } : { acceptedAt: ago(1), ...(status === "READY" && { readyAt: ago(0.5) }) },
    });
  const live: [Parameters<typeof createOrder>[0], OrderStatus][] = [
    [{ store: byName("Aling Nena's Carinderia"), resident: residents[1], createdAt: ago(4), status: "PLACED", fulfillment: "DELIVERY" }, "PLACED"],
    [{ store: byName("Aling Nena's Carinderia"), resident: residents[2], createdAt: ago(2), status: "PLACED", fulfillment: "PICKUP" }, "PLACED"],
    [{ store: byName("Aling Nena's Carinderia"), resident: residents[4], createdAt: ago(12), status: "PREPARING", fulfillment: "DELIVERY" }, "PREPARING"],
    [{ store: byName("Lola Remy's Kitchen"), resident: residents[3], createdAt: ago(26), status: "READY", fulfillment: "DELIVERY" }, "READY"],
    [{ store: byName("Isla Grill & Seafood"), resident: residents[5], createdAt: ago(31), status: "READY", fulfillment: "DELIVERY" }, "READY"],
  ];
  for (const [opts, status] of live) await startFresh(await createOrder(opts), status);

  // Juan's Burger Barn order already has a rider (Jessa) heading to the store, so live tracking
  // shows right away. With a rider it's never cancelled by itself.
  const jessa = riders[RIDERS.findIndex((r) => r.email === "jessa@feasto.com")]!;
  const barn = byName("Burger Barn");
  const tracked = await createOrder({ store: barn, resident: juan, createdAt: ago(9), status: "PREPARING", fulfillment: "DELIVERY", paymentMethod: "ONLINE", rider: jessa });
  if (barn.vendor.latitude != null && barn.vendor.longitude != null) {
    const at = { lat: barn.vendor.latitude + 0.0021, lng: barn.vendor.longitude - 0.0016, at: new Date().toISOString() };
    await redis.set(`rider-location:${tracked.id}`, JSON.stringify(at), "EX", 3600);
  }
  // Juan's past orders that are easy to find, rated and unrated
  await createOrder({ store: byName("Kape Kanto"), resident: juan, createdAt: manilaAt(1, "08:40"), status: "DELIVERED", fulfillment: "DELIVERY", review: false });
  await createOrder({ store: byName("Sweet Spot Desserts"), resident: juan, createdAt: manilaAt(2, "15:10"), status: "COMPLETED", fulfillment: "PICKUP", review: true });

  for (const [vendorId, totals] of ratingTotals) {
    await prisma.vendor.update({ where: { id: vendorId }, data: { ratingSum: totals.sum, ratingCount: totals.count } });
  }

  // ----- Table bookings -----
  const bookingStores = stores.filter((s) => s.tables.length > 0);
  const usedSlots = new Set<string>();
  async function book(
    store: (typeof stores)[number],
    daysAgo: number,
    time: string,
    status: "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED",
    // Juan (the main demo resident) only gets the bookings given to him on purpose
    resident = pick(residents.slice(1)),
  ) {
    const partySize = between(2, 5);
    const startsAt = manilaAt(daysAgo, time);
    const table = store.tables.find((t) => t.seats >= partySize && !usedSlots.has(`${t.id}|${startsAt.toISOString()}`));
    if (!table) return;
    const key = `${table.id}|${startsAt.toISOString()}`;
    usedSlots.add(key);
    await prisma.booking.create({
      data: {
        tableId: table.id,
        residentId: resident.user.id,
        startsAt,
        partySize,
        notes: chance(0.3) ? pick(["Birthday celebration 🎂", "Window seat if possible.", "May kasamang senior citizen.", "We might be 10 minutes late."]) : null,
        status,
        activeSlotKey: status === "CONFIRMED" ? key : null,
        createdAt: new Date(startsAt.getTime() - between(1, 3) * 86400_000),
      },
    });
  }
  for (const store of bookingStores) {
    for (let daysAgo = 6; daysAgo >= 1; daysAgo--) {
      for (let n = between(1, 3); n > 0; n--) await book(store, daysAgo, pick(["12:00", "13:00", "18:00", "19:00", "20:00"]), chance(0.85) ? "COMPLETED" : "NO_SHOW");
    }
    for (let daysAhead = 0; daysAhead <= 3; daysAhead++) {
      for (let n = between(1, 3); n > 0; n--) await book(store, -daysAhead, pick(["18:00", "19:00", "20:00"]), "CONFIRMED");
    }
  }
  await book(byName("Lola Remy's Kitchen"), -2, "19:00", "CONFIRMED", juan);

  // ----- Favorites and a few notifications -----
  for (const name of ["Burger Barn", "Kape Kanto", "Aling Nena's Carinderia"]) {
    await prisma.favorite.create({ data: { userId: juan.user.id, vendorId: byName(name).vendor.id } });
  }
  await prisma.notification.createMany({
    data: [
      { userId: juan.user.id, title: "Burger Barn is preparing your order", body: "We'll let you know when it's on the way.", link: "/resident/orders", createdAt: ago(6) },
      { userId: juan.user.id, title: "Table booked at Lola Remy's Kitchen", body: "See you there!", link: "/resident/bookings", createdAt: ago(60 * 20) },
      { userId: byName("Aling Nena's Carinderia").owner.id, title: "New order", body: "2 new orders are waiting for you.", link: "/vendor/orders", createdAt: ago(2) },
    ],
  });

  // ----- Documents for the admin's monitor, and an activity log with some history -----
  console.log("Creating document renewals and the activity log…");
  const storeNamed = (name: string) => byName(name).vendor.id;
  await prisma.vendor.update({ where: { id: storeNamed("Tea Time PH") }, data: { permitExpiresAt: daysFromToday(20) } });
  await prisma.vendor.update({ where: { id: storeNamed("Kuya Ben's Street Eats") }, data: { permitExpiresAt: daysFromToday(-12) } });
  await prisma.vendor.update({ where: { id: storeNamed("Kape Kanto") }, data: { permitExpiresAt: daysFromToday(-3) } });
  // Kape Kanto already sent its renewal for the admin to check; Mark's goes to Aling Nena's
  await prisma.documentRenewal.create({
    data: {
      vendorId: storeNamed("Kape Kanto"),
      number: "NVL-2027-1004",
      expiresAt: daysFromToday(362),
      file: await sampleDocument("permit"),
      status: "PENDING",
      submittedAt: ago(90),
    },
  });
  const mark = await prisma.riderProfile.findFirstOrThrow({ where: { user: { email: "mark@feasto.com" } }, select: { id: true } });
  await prisma.documentRenewal.create({
    data: { riderId: mark.id, number: "N04-20-331122", expiresAt: daysFromToday(1825), file: await sampleDocument("license"), status: "PENDING", submittedAt: ago(45) },
  });

  const adminActor = { actorId: admin.id, actorName: admin.name };
  const nena = byName("Aling Nena's Carinderia").owner;
  await prisma.activityLog.createMany({
    data: [
      ...stores.map(({ seed, vendor }) => ({ ...adminActor, category: "APPROVALS" as const, action: "Approved store", target: seed.name, createdAt: vendor.reviewedAt! })),
      ...RIDERS.flatMap((r) =>
        r.pending
          ? []
          : [
              {
                ...(r.store ? { actorId: nena.id, actorName: nena.name } : adminActor),
                category: "APPROVALS" as const,
                action: "Approved rider",
                target: r.name,
                createdAt: accountsSince,
              },
            ],
      ),
      { actorId: null, actorName: "Feasto (automatic)", category: "DOCUMENTS" as const, action: "Took rider offline: license expired", target: "Ariel Aquino", createdAt: ago(60 * 24 * 9) },
      { actorId: null, actorName: "Kape Kanto", category: "DOCUMENTS" as const, action: "Submitted renewed business permit", target: "Kape Kanto", createdAt: ago(90) },
    ],
  });

  const totals = await prisma.order.count();
  console.log(`\nDone: ${stores.length} stores (+${PENDING_STORES.length} pending), ${riders.length} riders, ${residents.length} residents, ${totals} orders.`);
  console.log(`All demo accounts use the password "${DEMO_PASSWORD}". Admin: ${adminEmail}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
  redis.disconnect();
}
