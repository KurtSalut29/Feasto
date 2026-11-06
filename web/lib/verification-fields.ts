import { Bike, Building2, CalendarDays, FileBadge, Hash, HeartPulse, House, IdCard, Phone, RectangleEllipsis, type LucideIcon } from "lucide-react";

/** One box in the store's or rider's verification details, used at sign-up and when correcting them. */
export type VerificationField = {
  name: string;
  label: string;
  type?: "text" | "date" | "tel";
  placeholder?: string;
  Icon: LucideIcon;
  hint?: string;
  uppercase?: boolean;
  optional?: boolean;
  /** Shown when it's left blank */
  missing?: string;
};

export const PERMIT_FIELDS: VerificationField[] = [
  { name: "businessName", label: "Registered business name", placeholder: "As written on your permit", Icon: Building2, missing: "Enter the business name on the permit." },
  { name: "businessPhone", label: "Store contact number", type: "tel", placeholder: "09171234567", Icon: Phone, missing: "Enter the store's contact number." },
  { name: "permitNumber", label: "Business permit number", placeholder: "NVL-2026-1234", Icon: FileBadge, uppercase: true, missing: "Enter the permit number." },
  { name: "permitExpiresAt", label: "Permit expiry date", type: "date", Icon: CalendarDays, missing: "Enter the permit's expiry date." },
];

export const RIDER_PERSONAL_FIELDS: VerificationField[] = [
  { name: "birthDate", label: "Birth date", type: "date", Icon: CalendarDays, hint: "You must be at least 18.", missing: "Enter your birth date." },
  { name: "address", label: "Home address", placeholder: "Street, barangay, city", Icon: House, missing: "Enter your home address." },
  { name: "emergencyName", label: "Emergency contact name", placeholder: "Maria Dela Cruz", Icon: HeartPulse, missing: "Enter who to call in an emergency." },
  { name: "emergencyPhone", label: "Emergency contact number", type: "tel", placeholder: "09171234567", Icon: Phone, missing: "Enter their mobile number." },
];

export const RIDER_LICENSE_FIELDS: VerificationField[] = [
  { name: "vehicleModel", label: "Motorcycle make and model", placeholder: "Honda Click 125", Icon: Bike, missing: "Enter your motorcycle's make and model." },
  { name: "plateNumber", label: "Plate number", placeholder: "ABC 1234", Icon: RectangleEllipsis, uppercase: true, missing: "Enter your plate number." },
  { name: "licenseNumber", label: "Driver's license number", placeholder: "N01-23-456789", Icon: IdCard, uppercase: true, missing: "Enter your driver's license number." },
  { name: "licenseExpiresAt", label: "License expiry date", type: "date", Icon: CalendarDays, missing: "Enter your license's expiry date." },
];

export const STORE_CODE_FIELD: VerificationField = {
  name: "storeCode",
  label: "Store code (optional)",
  placeholder: "ABCD-2345",
  Icon: Hash,
  uppercase: true,
  optional: true,
  hint: "Riding for a store? Enter its code and the store approves you. Leave blank to be a free rider, approved by Feasto.",
};

/** What the page knows about an application, from GET /documents/verification. */
export type Verification = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  reviewNote: string | null;
  document: "image" | "pdf" | null;
  storeName?: string | null;
  fields: Record<string, string>;
};
