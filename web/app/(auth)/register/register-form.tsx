"use client";

import { ArrowLeft, Bike, Motorbike, ShoppingBag, Store, Zap } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select-field";
import { SwitchField } from "@/components/ui/switch-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import { ROLE_HOME } from "@/lib/roles";
import { acceptsReservationsByDefault, STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { Role, StoreType, User, VehicleType } from "@/lib/types";

type SignupRole = Exclude<Role, "ADMIN">;

const roleOptions: SegmentOption<SignupRole>[] = [
  { value: "RESIDENT", label: "Resident", Icon: ShoppingBag },
  { value: "RIDER", label: "Rider", Icon: Bike },
  { value: "VENDOR", label: "Vendor", Icon: Store },
];

const vehicleOptions: SegmentOption<VehicleType>[] = [
  { value: "MOTORCYCLE", label: "Motorcycle", Icon: Motorbike },
  { value: "BICYCLE", label: "Bicycle", Icon: Bike },
  { value: "E_BIKE", label: "E-bike", Icon: Zap },
];

const ACCOUNT_FIELDS = ["name", "email", "phone", "password"] as const;

const emptyValues = {
  name: "",
  email: "",
  phone: "",
  password: "",
  storeName: "",
  storeAddress: "",
  plateNumber: "",
  licenseNumber: "",
};

/** Quick checks before moving on to step 2. The API still validates everything. */
function checkAccountFields(values: typeof emptyValues): FieldErrors {
  const errors: FieldErrors = {};
  if (values.name.trim().length < 2) errors.name = ["Enter your full name."];
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = ["Enter a valid email address."];
  if (!/^(\+639|09)\d{9}$/.test(values.phone.trim())) errors.phone = ["Enter a mobile number like 09171234567."];
  if (values.password.length < 8) errors.password = ["Use at least 8 characters."];
  else if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password))
    errors.password = ["Include at least one letter and one number."];
  return errors;
}

export function RegisterForm() {
  const [role, setRole] = useState<SignupRole>("RESIDENT");
  // Vendors and riders fill in their account first, then their store or vehicle,
  // so each step fits on one screen.
  const [step, setStep] = useState<"account" | "details">("account");
  const [values, setValues] = useState(emptyValues);
  const [vehicleType, setVehicleType] = useState<VehicleType | "">("");
  const [storeType, setStoreType] = useState<StoreType | "">("");
  const [acceptsReservations, setAcceptsReservations] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const hasDetailsStep = role === "VENDOR" || role === "RIDER";

  // Editing a field clears its error message
  function clearError(name: string) {
    setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  }

  function update(event: ChangeEvent<HTMLInputElement>) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
    clearError(event.target.name);
  }

  function chooseVehicle(type: VehicleType) {
    setVehicleType(type);
    clearError("vehicleType");
  }

  // Picking a store type also sets the usual reservations choice for it; the vendor can still flip it.
  function chooseStoreType(type: StoreType) {
    setStoreType(type);
    setAcceptsReservations(acceptsReservationsByDefault(type));
    clearError("storeType");
  }

  function requestBody() {
    const { name, email, phone, password, storeName, storeAddress, plateNumber, licenseNumber } = values;
    const account = { role, name, email, phone, password };
    if (role === "VENDOR") return { ...account, storeName, storeAddress, storeType, acceptsReservations };
    if (role === "RIDER") return { ...account, vehicleType, plateNumber, licenseNumber };
    return account;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (hasDetailsStep && step === "account") {
      const errors = checkAccountFields(values);
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) setStep("details");
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const result = await apiRequest<{ user: User }>("/auth/register", { method: "POST", body: requestBody() });

    if (!result.ok) {
      // Field problems are shown under each field, so only show the banner for other errors
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      // Go back to step 1 if the problem is there (e.g. email already used)
      if (ACCOUNT_FIELDS.some((field) => result.fieldErrors?.[field])) setStep("account");
      setSubmitting(false);
      return;
    }
    // A full page load (not router.replace) after signing in: Next.js keeps visited pages
    // alive in the background, so this clears the old form, its loading state and the
    // typed password, and makes the next visit to /login or /register check the new session.
    window.location.replace(ROLE_HOME[result.data.user.role]);
  }

  const fieldError = (name: string) => fieldErrors[name]?.[0];

  if (step === "details") {
    return (
      <DetailsStep
        title={role === "VENDOR" ? "Your store" : "Your vehicle"}
        subtitle={
          role === "VENDOR"
            ? "An admin reviews new stores first."
            : "An admin checks your details first."
        }
        error={error}
        submitting={submitting}
        onBack={() => setStep("account")}
        onSubmit={handleSubmit}
      >
        {role === "VENDOR" ? (
          <>
            <TextField
              label="Store name"
              name="storeName"
              value={values.storeName}
              onChange={update}
              placeholder="Aling Nena's Carinderia"
              required
              autoFocus
              error={fieldError("storeName")}
            />
            <TextField
              label="Store address"
              name="storeAddress"
              value={values.storeAddress}
              onChange={update}
              autoComplete="street-address"
              placeholder="Street, barangay, city"
              required
              error={fieldError("storeAddress")}
            />
            <SelectField
              label="Store type"
              name="storeType"
              placeholder="Choose the closest match"
              options={STORE_TYPE_OPTIONS}
              value={storeType}
              onChange={(event) => chooseStoreType(event.target.value as StoreType)}
              required
              error={fieldError("storeType")}
            />
            <SwitchField
              label="Accepts table reservations"
              description="Residents can book a table here."
              checked={acceptsReservations}
              onChange={setAcceptsReservations}
            />
          </>
        ) : (
          <>
            <SegmentedControl
              name="vehicleType"
              legend="Vehicle type"
              options={vehicleOptions}
              value={vehicleType}
              onChange={chooseVehicle}
              error={fieldError("vehicleType")}
            />
            {vehicleType === "MOTORCYCLE" && (
              <>
                <TextField
                  label="Plate number"
                  name="plateNumber"
                  value={values.plateNumber}
                  onChange={update}
                  placeholder="ABC 1234"
                  autoCapitalize="characters"
                  required
                  error={fieldError("plateNumber")}
                />
                <TextField
                  label="Driver's license number"
                  name="licenseNumber"
                  value={values.licenseNumber}
                  onChange={update}
                  placeholder="N01-23-456789"
                  autoCapitalize="characters"
                  required
                  error={fieldError("licenseNumber")}
                />
              </>
            )}
            {(vehicleType === "BICYCLE" || vehicleType === "E_BIKE") && (
              <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">
                No plate or license needed for {vehicleType === "BICYCLE" ? "bicycles" : "e-bikes"}.
              </p>
            )}
          </>
        )}
      </DetailsStep>
    );
  }

  return (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Create your account</h1>

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
        <SegmentedControl name="role-choice" legend="Account type" options={roleOptions} value={role} onChange={setRole} />

        {error && <Alert tone="error">{error}</Alert>}

        <TextField
          label="Full name"
          name="name"
          value={values.name}
          onChange={update}
          autoComplete="name"
          placeholder="Juan Dela Cruz"
          required
          error={fieldError("name")}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          value={values.email}
          onChange={update}
          autoComplete="email"
          placeholder="you@example.com"
          required
          error={fieldError("email")}
        />
        <TextField
          label="Mobile number"
          name="phone"
          type="tel"
          value={values.phone}
          onChange={update}
          autoComplete="tel"
          inputMode="tel"
          placeholder="09171234567"
          required
          error={fieldError("phone")}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          value={values.password}
          onChange={update}
          autoComplete="new-password"
          placeholder="8+ characters, letters and numbers"
          required
          error={fieldError("password")}
        />

        <div className="pt-1">
          <Button type="submit" loading={submitting} className="w-full">
            {role === "VENDOR"
              ? "Continue to store details"
              : role === "RIDER"
                ? "Continue to vehicle details"
                : submitting
                  ? "Creating account…"
                  : "Create account"}
          </Button>
        </div>
      </form>
    </>
  );
}

function DetailsStep({
  title,
  subtitle,
  error,
  submitting,
  onBack,
  onSubmit,
  children,
}: {
  title: string;
  subtitle: string;
  error?: string;
  submitting: boolean;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <>
      <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Step 2 of 2</p>
      <h1 className="mt-1 text-center text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-balance text-center text-[15px] text-muted">{subtitle}</p>

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {children}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onBack} aria-label="Back to account details">
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
          <Button type="submit" loading={submitting} className="flex-1">
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </div>
      </form>
    </>
  );
}
