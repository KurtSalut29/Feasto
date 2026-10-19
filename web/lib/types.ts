export type Role = "RESIDENT" | "RIDER" | "VENDOR" | "ADMIN";

export type VendorStatus = "PENDING" | "APPROVED" | "SUSPENDED";

/** The signed-in user, as returned by GET /api/auth/me. */
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  vendor: { id: string; name: string; status: VendorStatus } | null;
};
