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
export type StorePage = { stores: StoreSummary[]; total: number; nextOffset: number | null; openCount: number; favoriteCount: number };

export type StoreSections = {
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
  menuItems: MenuItem[];
  reviews: StoreReview[];
};

/** Orders and sales on one day (Philippine date "YYYY-MM-DD"). */
export type SalesDay = { date: string; orders: number; sales: number };

export type CartProblem = "SOLD_OUT" | "UNAVAILABLE" | "NOT_ENOUGH_STOCK" | "STORE_CLOSED" | "STORE_UNAVAILABLE";

export type Cart = {
  groups: {
    store: { id: string; name: string; imageUrl: string | null; isOpen: boolean };
    items: { menuItemId: string; name: string; imageUrl: string | null; price: number; quantity: number; lineTotal: number; problem: CartProblem | null; stock: number | null }[];
    subtotal: number;
    problem: CartProblem | null;
  }[];
  itemCount: number;
  itemsTotal: number;
  deliveryFeePerStore: number;
  hasProblems: boolean;
};

export type Address = Pin & { id: string; label: string; details: string; landmark: string | null; isDefault: boolean };

export type OrderStatus =
  | "AWAITING_PAYMENT"
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
export type PaymentMethod = "COD" | "ONLINE";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

type OrderBase = {
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
  items: { id: string; name: string; unitPrice: string; quantity: number }[];
};

/** An order as the resident sees it. */
export type ResidentOrder = OrderBase & {
  vendor: Pin & { id: string; name: string; address: string; imageUrl: string | null; owner: { phone: string | null } };
  rider: { name: string; phone: string | null; riderProfile: { vehicleModel: string | null; plateNumber: string | null } | null } | null;
  checkout: {
    id: string;
    paymentMethod: PaymentMethod;
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

/** An order as the store sees it. */
/** How far a delivery job has spread among riders. */
export type JobDispatch = "NEW" | "STORE_RIDERS" | "NEAREST" | "WIDER" | "EVERYONE";

export type VendorOrder = OrderBase & {
  dispatch: JobDispatch;
  rider: { name: string; phone: string | null } | null;
  checkout: {
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    deliveryAddress: string | null;
    notes: string | null;
    resident: { name: string; phone: string | null };
  };
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
  table: { label: string; vendor: { id: string; name: string; address: string; imageUrl: string | null } };
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
  deliveryFee: string;
  createdAt: string;
  vendor: Pin & { name: string; address: string };
  items: { quantity: number }[];
  checkout: { deliveryAddress: string | null; deliveryLat: number | null; deliveryLng: number | null };
};

/** One page of open jobs from GET /rider/jobs */
export type JobsPage = { online: boolean; approved: boolean; licenseExpired?: boolean; jobs: RiderJob[]; total: number; nextOffset: number | null };

export type RiderDelivery = {
  id: string;
  status: OrderStatus;
  subtotal: string;
  deliveryFee: string;
  readyAt: string | null;
  vendor: Pin & { name: string; address: string; owner: { phone: string | null } };
  items: { id: string; name: string; quantity: number }[];
  checkout: {
    deliveryAddress: string | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
    notes: string | null;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    resident: { name: string; phone: string | null };
  };
};
