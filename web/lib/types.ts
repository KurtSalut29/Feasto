export type Role = "RESIDENT" | "RIDER" | "VENDOR" | "ADMIN";

/** Review state of a vendor's store or a rider's account. */
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export type StoreType =
  | "RESTAURANT"
  | "FAST_FOOD"
  | "CARINDERIA"
  | "CAFE"
  | "BAKERY"
  | "MILK_TEA_DRINKS"
  | "SNACKS_STREET_FOOD"
  | "DESSERTS"
  | "HOME_KITCHEN";

/** The signed-in user, as returned by GET /api/auth/me. */
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  vendor: {
    id: string;
    name: string;
    storeType: StoreType;
    acceptsReservations: boolean;
    address: string;
    description: string | null;
    opensAt: string;
    closesAt: string;
    imageUrl: string | null;
    isTemporarilyClosed: boolean;
    status: ApprovalStatus;
    reviewNote: string | null;
    permitExpiresAt: string | null;
  } | null;
  riderProfile: {
    vehicleModel: string | null;
    plateNumber: string | null;
    licenseExpiresAt: string | null;
    status: ApprovalStatus;
    reviewNote: string | null;
    isOnline: boolean;
    /** The store this rider works for; null for a free rider */
    vendor: { name: string } | null;
  } | null;
};

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  /** Prices arrive from the API as strings like "120.00" */
  price: string;
  imageUrl: string | null;
  stock: number | null;
  isAvailable: boolean;
  /** How many residents have received; only on a store's menu */
  soldCount?: number;
};

/** A pin on the map as the API sends it; both null until someone sets it. */
export type Pin = { latitude: number | null; longitude: number | null };

/** A store in the resident's browse list. */
export type StoreSummary = Pin & {
  id: string;
  name: string;
  storeType: StoreType;
  description: string | null;
  address: string;
  imageUrl: string | null;
  opensAt: string;
  closesAt: string;
  acceptsReservations: boolean;
  isTemporarilyClosed: boolean;
  isOpen: boolean;
  dishCount: number;
  categories: string[];
  matchedDishes: string[];
  /** Average stars rounded to one decimal; null before the first rating */
  rating: number | null;
  ratingCount: number;
  isFavorite: boolean;
  /** Kilometres from the resident's default address (or the given spot), when both have a pin */
  distanceKm: number | null;
};

/** One page of stores from GET /stores */
export type StorePage = {
  stores: StoreSummary[];
  total: number;
  nextOffset: number | null;
  openCount: number;
  /** How many stores of each kind match, whichever kind is chosen */
  typeCounts: Partial<Record<StoreType, number>>;
  favoriteCount: number;
};

/** One kind of store on the resident's Home. */
export type StoreCategory = { type: StoreType; count: number; imageUrl: string | null };

export type StoreSections = {
  categories: StoreCategory[];
  orderAgain: StoreSummary[];
  nearby: StoreSummary[];
  topRated: StoreSummary[];
  saved: StoreSummary[];
  total: number;
  openCount: number;
  savedCount: number;
  hasStartingPoint: boolean;
};

export type StoreReview = { id: string; rating: number; comment: string | null; createdAt: string; author: string };

export type StoreDetail = Omit<StoreSummary, "dishCount" | "categories" | "matchedDishes" | "distanceKm"> & {
  canBook: boolean;
  maxPartySize: number;
  /** The ways to pay the store takes */
  acceptsCash: boolean;
  onlinePayments: OnlinePayment[];
  /** Delivery from this store to the resident's address now (the base fee without an address) */
  deliveryFee: number;
  delivery: (DeliveryQuote & { addressLabel: string }) | null;
  /** How many residents gave 1 to 5 stars */
  ratingBreakdown: Record<"1" | "2" | "3" | "4" | "5", number>;
  menuItems: MenuItem[];
  reviews: StoreReview[];
};

/** Orders and sales on one day (Philippine date "YYYY-MM-DD"). */
export type SalesDay = { date: string; orders: number; sales: number };

export type CartProblem = "SOLD_OUT" | "UNAVAILABLE" | "NOT_ENOUGH_STOCK" | "STORE_CLOSED" | "STORE_UNAVAILABLE";

/** One store's delivery fee to an address, and how it was worked out (server/src/lib/deliveryFee.ts) */
export type DeliveryQuote = {
  fee: number;
  /** Road distance in km; null when the store or the address has no map pin */
  km: number | null;
  byRoad: boolean;
  base: number;
  baseKm: number;
  extraKm: number;
  perKm: number;
  distanceFee: number;
  peakFee: number;
  /** "Lunch rush" or "Dinner rush" while it applies */
  peak: string | null;
};

export type Cart = {
  groups: {
    store: { id: string; name: string; imageUrl: string | null; address: string; opensAt: string; closesAt: string; isOpen: boolean; acceptsCash: boolean; onlinePayments: OnlinePayment[] };
    items: { menuItemId: string; name: string; imageUrl: string | null; price: number; quantity: number; lineTotal: number; problem: CartProblem | null; stock: number | null; /** For the store, this dish only */ note?: string | null }[];
    subtotal: number;
    problem: CartProblem | null;
    /** This store's delivery to the address below; null when the resident has no address yet */
    delivery: DeliveryQuote | null;
  }[];
  itemCount: number;
  itemsTotal: number;
  /** The address the fees were priced for, and all stores' fees together */
  delivery: { addressId: string | null; addressLabel: string | null; total: number; baseFee: number; pricedFor?: string | null };
  hasProblems: boolean;
  /** Nothing's wrong except that a store is closed right now, so it can still be ordered for later */
  canSchedule: boolean;
};

export type Address = Pin & { id: string; label: string; details: string; landmark: string | null; isDefault: boolean };

export type OrderStatus =
  | "AWAITING_PAYMENT"
  | "SCHEDULED"
  | "PLACED"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "PICKED_UP"
  | "DELIVERED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type Fulfillment = "DELIVERY" | "PICKUP";
export type OnlinePayment = "GCASH" | "MAYA" | "GRABPAY" | "SHOPEEPAY" | "COINS" | "VISA" | "MASTERCARD" | "JCB" | "AMEX";

export type PaymentMethod = "COD" | "ONLINE";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

type OrderBase = {
  /** Ordered for later: when it's to be delivered (or ready for pickup). Null for as soon as possible. */
  scheduledFor?: string | null;
  /** When it reached the store to accept */
  placedAt?: string;
  /** Road distance that set the delivery fee, when ordered */
  deliveryKm?: string | null;
  id: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  subtotal: string;
  deliveryFee: string;
  rejectReason: string | null;
  /** Photo the rider took when handing over a delivery */
  deliveryPhotoUrl: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  /** `note` is the resident's note for that one dish */
  items: { id: string; name: string; unitPrice: string; quantity: number; note?: string | null }[];
};

/** An order as the resident sees it. */
export type ResidentOrder = OrderBase & {
  vendor: Pin & { id: string; name: string; address: string; imageUrl: string | null; owner: { phone: string | null } };
  rider: {
    name: string;
    phone: string | null;
    riderProfile: { vehicleModel: string | null; plateNumber: string | null; ratingSum?: number; ratingCount?: number } | null;
  } | null;
  /** What the resident tipped the rider, after delivery ("0.00" for none) */
  tip?: string;
  tipMethod?: OnlinePayment | null;
  /** The resident's rating of the rider, once they've given one */
  riderRating?: RiderRatingGiven | null;
  checkout: {
    id: string;
    paymentMethod: PaymentMethod;
    onlineMethod?: OnlinePayment | null;
    paymentStatus: PaymentStatus;
    deliveryAddress: string | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
    notes: string | null;
    total: string;
    createdAt: string;
  };
  /** The resident's rating, once they've given one */
  review: { rating: number; comment: string | null; createdAt: string } | null;
};

/** The light version of a resident's orders that every page can afford (GET /orders/summary) */
export type OrdersSummary = {
  active: { id: string; status: OrderStatus; fulfillment: Fulfillment; scheduledFor: string | null; vendor: { name: string }; rider: { name: string } | null }[];
  count: number;
  toRate: number;
};

/** A resident's rating of their rider */
export type RiderRatingGiven = { rating: number; tags: string[]; comment: string | null; createdAt: string };

/** An order as the store sees it. */
/** How far a delivery job has spread among riders. */
export type JobDispatch = "NEW" | "STORE_RIDERS" | "NEAREST" | "WIDER" | "EVERYONE";

/** When a waiting order will be cancelled by itself, and why (no store reply, or no rider) */
export type AutoCancel = { at: string; why: "NO_STORE_REPLY" | "NO_RIDER" } | null;

export type VendorOrder = Omit<OrderBase, "items"> & {
  /** Feasto's commission on the food, copied at checkout: the percent and the amount */
  commissionRate?: string;
  commission?: string;
  autoCancel?: AutoCancel;
  dispatch: JobDispatch;
  /** Each dish, with its menu photo */
  items: (OrderBase["items"][number] & { menuItem?: { imageUrl: string | null } | null })[];
  rider: { name: string; phone: string | null; riderProfile?: { vehicleModel: string | null; plateNumber: string | null } | null } | null;
  /** Where the rider is now, while they're on this order */
  riderLocation?: { lat: number; lng: number; at: string } | null;
  checkout: {
    paymentMethod: PaymentMethod;
    onlineMethod?: OnlinePayment | null;
    paymentStatus: PaymentStatus;
    deliveryAddress: string | null;
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    notes: string | null;
    resident: { name: string; phone: string | null };
  };
};

/** One order in full, for the store's order page and printed slip */
export type VendorOrderDetail = VendorOrder & {
  vendor: Pin & { name: string; address: string; imageUrl: string | null; owner: { phone: string | null } };
};

export type BookingStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export type ResidentBooking = {
  id: string;
  startsAt: string;
  partySize: number;
  notes: string | null;
  status: BookingStatus;
  /** Confirmed and still in the future (decided by the server) */
  upcoming: boolean;
  table: { label: string; vendor: Pin & { id: string; name: string; address: string; imageUrl: string | null } };
};

export type VendorBooking = {
  id: string;
  startsAt: string;
  partySize: number;
  notes: string | null;
  status: BookingStatus;
  table: { label: string; seats: number };
  resident: { name: string; phone: string | null };
  /** The booked time has come (decided by the server) */
  started: boolean;
};

export type DiningTable = { id: string; label: string; seats: number };

export type RiderJob = {
  id: string;
  status: OrderStatus;
  subtotal: string;
  deliveryFee: string;
  /** Feasto's share of the fee; the rider keeps the rest */
  riderCut?: string;
  createdAt: string;
  /** Ordered for later: when the resident wants it at their door */
  scheduledFor?: string | null;
  vendor: Pin & { name: string; address: string; imageUrl: string | null };
  items: { name: string; quantity: number; unitPrice: string }[];
  checkout: {
    deliveryAddress: string | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
    paymentMethod: PaymentMethod;
    onlineMethod?: OnlinePayment | null;
    paymentStatus: PaymentStatus;
  };
};

/** One page of open jobs from GET /rider/jobs */
export type JobsPage = { online: boolean; approved: boolean; licenseExpired?: boolean; jobs: RiderJob[]; total: number; nextOffset: number | null };

export type RiderDelivery = {
  id: string;
  status: OrderStatus;
  /** Ordered for later: when the resident wants it at their door */
  scheduledFor?: string | null;
  subtotal: string;
  deliveryFee: string;
  /** Feasto's share of the fee; the rider keeps the rest */
  riderCut?: string;
  readyAt: string | null;
  vendor: Pin & { name: string; address: string; imageUrl: string | null; owner: { phone: string | null } };
  items: { id: string; name: string; quantity: number; unitPrice: string }[];
  checkout: {
    deliveryAddress: string | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
    notes: string | null;
    paymentMethod: PaymentMethod;
    onlineMethod?: OnlinePayment | null;
    paymentStatus: PaymentStatus;
    resident: { name: string; phone: string | null };
  };
};
