"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bike,
  IdCard,
  LockKeyhole,
  Mail,
  MapPin,
  Motorbike,
  RectangleEllipsis,
  ShoppingBag,
  Smartphone,
  Store,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
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
import { AUTH_BUTTON } from "../auth-ui";
import type { Role, StoreType, User, VehicleType } from "@/lib/types";

type SignupRole = Exclude<Role, "ADMIN">;

const roleOptions: { value: SignupRole; label: string; Icon: LucideIcon }[] = [
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

const STRENGTH = [
  { label: "Too weak", bar: "bg-red-500", text: "text-red-600" },
  { label: "Fair", bar: "bg-amber-500", text: "text-amber-700" },
  { label: "Good", bar: "bg-emerald-500", text: "text-emerald-700" },
  { label: "Strong", bar: "bg-emerald-600", text: "text-emerald-700" },
];

/** 4 bars that fill as the password gets stronger. "Too weak" until it meets the rules. */
function PasswordStrength({ password }: { password: string }) {
  const meetsRules = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
  const extras =
    Number(password.length >= 12) +
    Number(/[^A-Za-z0-9]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password)));
  const level = STRENGTH[meetsRules ? 1 + extras : 0];
  const filled = meetsRules ? 2 + extras : 1;
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < filled ? level.bar : "bg-line"}`} />
        ))}
      </div>
      <span aria-live="polite" className={`text-xs font-semibold ${level.text}`}>
        {level.label}
      </span>
    </div>
  );
}

/** "Step 1 of 2" with a two-part progress bar, for riders and vendors. */
function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-1.5 flex items-center justify-center gap-2.5">
      <span aria-hidden className="flex gap-1">
        {[1, 2].map((n) => (
          <span key={n} className={`h-1 w-6 rounded-full transition-colors ${n <= step ? "bg-brand-600" : "bg-line"}`} />
        ))}
      </span>
      <span className="text-xs font-semibold tracking-[0.12em] text-brand-700 uppercase">Step {step} of 2</span>
    </div>
  );
}

/** The three account types as tiles. Built from radio buttons so it works with the keyboard. */
function RolePicker({ value, onChange }: { value: SignupRole; onChange: (role: SignupRole) => void }) {
  return (
    <fieldset>
      <legend className="sr-only">Account type</legend>
      <div className="grid grid-cols-3 gap-2">
        {roleOptions.map(({ value: option, label, Icon }) => (
          <label
            key={option}
            className="group flex h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-white text-sm font-medium text-muted transition hover:border-gray-300 hover:text-ink has-checked:border-brand-500 has-checked:bg-brand-50/70 has-checked:font-semibold has-checked:text-brand-700 has-checked:ring-4 has-checked:ring-brand-500/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500 sm:gap-2"
          >
            <input
              type="radio"
              name="role-choice"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-canvas transition group-has-checked:bg-brand-600 group-has-checked:text-white sm:size-7">
              <Icon className="size-4" aria-hidden />
            </span>
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

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
              icon={Store}
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
              icon={MapPin}
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
                  icon={RectangleEllipsis}
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
                  icon={IdCard}
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
      {hasDetailsStep && <StepIndicator step={1} />}
      <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Create your account</h1>

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
        <RolePicker value={role} onChange={setRole} />

        {error && <Alert tone="error">{error}</Alert>}

        <TextField
          label="Full name"
          name="name"
          value={values.name}
          onChange={update}
          autoComplete="name"
          placeholder="Juan Dela Cruz"
          icon={UserRound}
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
          icon={Mail}
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
          icon={Smartphone}
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
          placeholder="8+ letters and numbers"
          icon={LockKeyhole}
          required
          error={fieldError("password")}
          hint={values.password && <PasswordStrength password={values.password} />}
        />

        <div className="pt-1">
          <Button type="submit" loading={submitting} className={`group w-full ${AUTH_BUTTON}`}>
            {role === "VENDOR"
              ? "Continue to store details"
              : role === "RIDER"
                ? "Continue to vehicle details"
                : submitting
                  ? "Creating account…"
                  : "Create account"}
            {hasDetailsStep && <ArrowRight className="size-[18px] transition group-hover:translate-x-0.5" aria-hidden />}
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
      <StepIndicator step={2} />
      <h1 className="text-center text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-balance text-center text-[15px] text-muted">{subtitle}</p>

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {children}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onBack} aria-label="Back to account details">
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
          <Button type="submit" loading={submitting} className={`flex-1 ${AUTH_BUTTON}`}>
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </div>
      </form>
    </>
  );
}
