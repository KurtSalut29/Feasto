"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bike,
  LockKeyhole,
  Mail,
  MapPin,
  ShoppingBag,
  Smartphone,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { DocumentPicker, uploadDocument } from "@/components/app/document-upload";
import { LocationPicker } from "@/components/map/location-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordStrength } from "@/components/ui/password-strength";
import { SelectField } from "@/components/ui/select-field";
import { SwitchField } from "@/components/ui/switch-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import type { LatLng } from "@/lib/geo";
import { ROLE_HOME } from "@/lib/roles";
import { acceptsReservationsByDefault, STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { Role, StoreType, User } from "@/lib/types";
import { PERMIT_FIELDS, RIDER_LICENSE_FIELDS, RIDER_PERSONAL_FIELDS, STORE_CODE_FIELD, type VerificationField } from "@/lib/verification-fields";
import { AUTH_BUTTON } from "../auth-ui";

type SignupRole = Exclude<Role, "ADMIN">;
type Step = "account" | "store" | "location" | "permit" | "personal" | "license";

const roleOptions: { value: SignupRole; label: string; Icon: LucideIcon }[] = [
  { value: "RESIDENT", label: "Resident", Icon: ShoppingBag },
  { value: "RIDER", label: "Rider", Icon: Bike },
  { value: "VENDOR", label: "Vendor", Icon: Store },
];

/** The steps of each role's sign-up, short enough that each fits on one screen. */
const STEPS: Record<SignupRole, Step[]> = {
  RESIDENT: ["account"],
  VENDOR: ["account", "store", "location", "permit"],
  RIDER: ["account", "personal", "license"],
};

const STEP_TEXT: Record<Exclude<Step, "account">, { title: string; subtitle: string }> = {
  store: { title: "Your store", subtitle: "What residents will see." },
  location: { title: "Where is your store?", subtitle: "Riders and residents use this pin to find you." },
  permit: { title: "Your business permit", subtitle: "An admin checks this before your store goes live." },
  personal: { title: "About you", subtitle: "Feasto keeps these details private." },
  license: { title: "Your motorcycle and license", subtitle: "Feasto riders all use motorcycles." },
};

/** Which fields each step holds, to return to the right step when the server finds a problem. */
const STEP_FIELDS: Record<Step, string[]> = {
  account: ["name", "email", "phone", "password"],
  store: ["storeName", "storeAddress", "storeType"],
  location: ["latitude", "longitude"],
  permit: PERMIT_FIELDS.map((f) => f.name),
  personal: RIDER_PERSONAL_FIELDS.map((f) => f.name),
  license: [...RIDER_LICENSE_FIELDS, STORE_CODE_FIELD].map((f) => f.name),
};

const emptyValues: Record<string, string> = {
  name: "",
  email: "",
  phone: "",
  password: "",
  storeName: "",
  storeAddress: "",
};

/** "Step 1 of 3" with a progress bar, for riders and vendors. */
function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-1.5 flex items-center justify-center gap-2.5">
      <span aria-hidden className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1 w-6 rounded-full transition-colors ${i < step ? "bg-brand-600" : "bg-line"}`} />
        ))}
      </span>
      <span className="text-xs font-semibold tracking-[0.12em] text-brand-700 uppercase">
        Step {step} of {total}
      </span>
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

/** Quick checks before moving on from the account step. The API still validates everything. */
function checkAccountFields(values: Record<string, string>): FieldErrors {
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
  const [step, setStep] = useState<Step>("account");
  const [values, setValues] = useState(emptyValues);
  const [storeType, setStoreType] = useState<StoreType | "">("");
  const [acceptsReservations, setAcceptsReservations] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const steps = STEPS[role];
  const stepIndex = steps.indexOf(step);
  const isLastStep = stepIndex === steps.length - 1;

  // Editing a field clears its error message
  function clearError(name: string) {
    setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  }

  function update(event: ChangeEvent<HTMLInputElement>) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
    clearError(event.target.name);
  }

  // Picking a store type also sets the usual reservations choice for it; the vendor can still flip it.
  function chooseStoreType(type: StoreType) {
    setStoreType(type);
    setAcceptsReservations(acceptsReservationsByDefault(type));
    clearError("storeType");
  }

  /** What's missing on this step. The API checks the details again when the form is sent. */
  function checkStep(): FieldErrors {
    const blank = (fields: VerificationField[]) =>
      Object.fromEntries(fields.filter((f) => !f.optional && !values[f.name]?.trim()).map((f) => [f.name, [f.missing ?? "Fill this in."]]));
    if (step === "account") return checkAccountFields(values);
    if (step === "store") {
      return {
        ...(values.storeName.trim().length < 2 && { storeName: ["Enter your store's name."] }),
        ...(values.storeAddress.trim().length < 5 && { storeAddress: ["Enter your store's address."] }),
        ...(!storeType && { storeType: ["Choose your store type."] }),
      };
    }
    if (step === "location") return pin ? {} : { latitude: ["Move the map so the pin sits on your store."] };
    const documentMissing = documentFile ? {} : { document: [`Upload a photo or PDF of your ${step === "permit" ? "business permit" : "driver's license"}.`] };
    if (step === "permit") return { ...blank(PERMIT_FIELDS), ...documentMissing };
    if (step === "personal") return blank(RIDER_PERSONAL_FIELDS);
    return { ...blank(RIDER_LICENSE_FIELDS), ...documentMissing };
  }

  function requestBody() {
    const { name, email, phone, password } = values;
    const account = { role, name, email, phone, password };
    const pick = (fields: VerificationField[]) => Object.fromEntries(fields.map((f) => [f.name, values[f.name] ?? ""]));
    if (role === "VENDOR") {
      return {
        ...account,
        storeName: values.storeName,
        storeAddress: values.storeAddress,
        storeType,
        acceptsReservations,
        latitude: pin?.lat,
        longitude: pin?.lng,
        ...pick(PERMIT_FIELDS),
      };
    }
    if (role === "RIDER") return { ...account, ...pick([...RIDER_PERSONAL_FIELDS, ...RIDER_LICENSE_FIELDS, STORE_CODE_FIELD]) };
    return account;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    const errors = checkStep();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!isLastStep) {
      setStep(steps[stepIndex + 1]);
      return;
    }

    setSubmitting(true);
    const result = await apiRequest<{ user: User }>("/auth/register", { method: "POST", body: requestBody() });

    if (!result.ok) {
      // Field problems are shown under each field, so only show the banner for other errors
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      // Go back to the first step with a problem (e.g. email already used)
      const wrong = steps.find((s) => STEP_FIELDS[s].some((field) => result.fieldErrors?.[field]));
      if (wrong) setStep(wrong);
      setSubmitting(false);
      return;
    }
    // The account now exists. If this upload fails, Home asks for the document again.
    const uploaded = documentFile ? await uploadDocument(documentFile).then(() => true, () => false) : true;
    const role = result.data.user.role;
    toast.later(
      role === "RESIDENT"
        ? { tone: "success", title: "Your account is ready!", description: "Welcome to Feasto. Pick a store near you to order." }
        : uploaded
          ? { tone: "success", title: "Account created", description: "Feasto will review your details. We'll let you know when you're approved." }
          : { tone: "warning", title: "Account created, but the document didn't upload", description: "Upload it again from your home page so Feasto can review you." },
    );
    // A full page load (not router.replace) after signing in: Next.js keeps visited pages
    // alive in the background, so this clears the old form, its loading state and the
    // typed password, and makes the next visit to /login or /register check the new session.
    window.location.replace(ROLE_HOME[result.data.user.role]);
  }

  const fieldError = (name: string) => fieldErrors[name]?.[0];

  /** Text boxes for a list of verification details. */
  const fieldBoxes = (fields: VerificationField[], focusFirst = true) =>
    fields.map(({ name, label, type, placeholder, Icon, hint, uppercase, optional }, index) => (
      <TextField
        key={name}
        label={label}
        name={name}
        type={type ?? "text"}
        inputMode={type === "tel" ? "tel" : undefined}
        value={values[name] ?? ""}
        onChange={update}
        placeholder={placeholder}
        icon={Icon}
        hint={hint}
        autoCapitalize={uppercase ? "characters" : undefined}
        required={!optional}
        autoFocus={focusFirst && index === 0}
        error={fieldError(name)}
      />
    ));

  if (step !== "account") {
    return (
      <DetailsStep
        step={stepIndex + 1}
        total={steps.length}
        {...STEP_TEXT[step]}
        error={error}
        submitting={submitting}
        isLast={isLastStep}
        onBack={() => {
          setError(undefined);
          setFieldErrors({});
          setStep(steps[stepIndex - 1]);
        }}
        onSubmit={handleSubmit}
      >
        {step === "store" && (
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
        )}
        {step === "location" && (
          <LocationPicker
            value={pin}
            onChange={(at) => {
              setPin(at);
              clearError("latitude");
            }}
            label="Pin on the map"
            required
            error={fieldError("latitude")}
          />
        )}
        {step === "permit" && (
          <>
            {fieldBoxes(PERMIT_FIELDS)}
            <DocumentPicker
              label="Photo or PDF of your business permit"
              hint="JPG, PNG or PDF, up to 5 MB. All the text must be readable."
              file={documentFile}
              onChange={(file) => {
                setDocumentFile(file);
                clearError("document");
              }}
              error={fieldError("document")}
            />
          </>
        )}
        {step === "personal" && fieldBoxes(RIDER_PERSONAL_FIELDS)}
        {step === "license" && (
          <>
            {fieldBoxes(RIDER_LICENSE_FIELDS)}
            <DocumentPicker
              label="Photo of your driver's license"
              hint="JPG, PNG or PDF, up to 5 MB. All the text must be readable."
              file={documentFile}
              onChange={(file) => {
                setDocumentFile(file);
                clearError("document");
              }}
              error={fieldError("document")}
            />
            {fieldBoxes([STORE_CODE_FIELD], false)}
          </>
        )}
      </DetailsStep>
    );
  }

  return (
    <>
      {steps.length > 1 && <StepIndicator step={1} total={steps.length} />}
      <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Create your account</h1>

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
        <RolePicker
          value={role}
          onChange={(next) => {
            setRole(next);
            setDocumentFile(null);
          }}
        />

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
                ? "Continue to rider details"
                : submitting
                  ? "Creating account…"
                  : "Create account"}
            {steps.length > 1 && <ArrowRight className="size-[18px] transition group-hover:translate-x-0.5" aria-hidden />}
          </Button>
        </div>
      </form>
    </>
  );
}

function DetailsStep({
  step,
  total,
  title,
  subtitle,
  error,
  submitting,
  isLast,
  onBack,
  onSubmit,
  children,
}: {
  step: number;
  total: number;
  title: string;
  subtitle: string;
  error?: string;
  submitting: boolean;
  isLast: boolean;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <>
      <StepIndicator step={step} total={total} />
      <h1 className="text-center text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-balance text-center text-[0.9375rem] text-muted">{subtitle}</p>

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {children}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onBack} aria-label="Back to the previous step">
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
          <Button type="submit" loading={submitting} className={`flex-1 ${AUTH_BUTTON}`}>
            {!isLast ? "Continue" : submitting ? "Creating account…" : "Create account"}
          </Button>
        </div>
      </form>
    </>
  );
}
