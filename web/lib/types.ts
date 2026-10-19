export type Role = "RESIDENT" | "RIDER" | "VENDOR" | "ADMIN";

/** Review state of a vendor's store or a rider's account. */
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

export type VehicleType = "MOTORCYCLE" | "BICYCLE" | "E_BIKE";

/** The signed-in user, as returned by GET /api/auth/me. */
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  vendor: { id: string; name: string; status: ApprovalStatus; reviewNote: string | null } | null;
  riderProfile: {
    vehicleType: VehicleType;
    plateNumber: string | null;
    status: ApprovalStatus;
    reviewNote: string | null;
    isOnline: boolean;
  } | null;
};
