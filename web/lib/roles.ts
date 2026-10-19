import type { Role } from "./types";

export const SESSION_COOKIE = "feasto_session";

/** Where each role lands after logging in. */
export const ROLE_HOME: Record<Role, string> = {
  RESIDENT: "/resident",
  RIDER: "/rider",
  VENDOR: "/vendor",
  ADMIN: "/admin",
};

export const ROLE_LABEL: Record<Role, string> = {
  RESIDENT: "Resident",
  RIDER: "Rider",
  VENDOR: "Vendor",
  ADMIN: "Admin",
};
