"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bike,
  IdCard,
  MailCheck,
  LockKeyhole,
  Mail,
  MapPin,
  ShoppingBag,
  Smartphone,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { addTransitionType, startTransition, useEffect, useState, ViewTransition, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { DocumentPicker, uploadDocument } from "@/components/app/document-upload";
import { LocationPicker } from "@/components/map/location-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { passwordProblem, PasswordRules, PasswordStrength } from "@/components/ui/password-strength";
import { SelectField } from "@/components/ui/select-field";
import { SwitchField } from "@/components/ui/switch-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import type { LatLng } from "@/lib/geo";
import { rememberCircleAt } from "@/lib/page-entrance";
import { ID_TYPE_OPTIONS, nameProblem, SUFFIX_OPTIONS } from "@/lib/identity";
import { ROLE_HOME } from "@/lib/roles";
import { acceptsReservationsByDefault, STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { Role, StoreType, User } from "@/lib/types";
import { PERMIT_FIELDS, RIDER_LICENSE_FIELDS, RIDER_PERSONAL_FIELDS, STORE_CODE_FIELD, type VerificationField } from "@/lib/verification-fields";
import { AUTH_BUTTON } from "../auth-ui";
import { LegalDialog, type Doc } from "../legal-links";

type SignupRole = Exclude<Role, "ADMIN">;
type Step = "account" | "verify" | "identity" | "store" | "location" | "permit" | "personal" | "license";

const roleOptions: { value: SignupRole; label: string; Icon: LucideIcon; about: string }[] = [
  { value: "RESIDENT", label: "Resident", Icon: ShoppingBag, about: "Order food from stores around Naval" },
  { value: "RIDER", label: "Rider", Icon: Bike, about: "Deliver orders, earn per trip" },
  { value: "VENDOR", label: "Vendor", Icon: Store, about: "Sell your food on Feasto" },
];

/** A step forward slides the card's content one way, Back the other (CSS in globals.css) */
const SWAP = { "auth-forward": "auth-forward", "auth-back": "auth-back", default: "auth-fade" };

/** The steps of each role's sign-up, short enough that each fits on one screen. */
const STEPS: Record<SignupRole, Step[]> = {
  // Right after the account step, everyone types the code Feasto emailed them
  RESIDENT: ["account", "verify", "identity"],
  VENDOR: ["account", "verify", "store", "location", "permit"],
  RIDER: ["account", "verify", "personal", "license"],
};

const STEP_TEXT: Record<Exclude<Step, "account">, { title: string; subtitle: string }> = {
  verify: { title: "Check your email", subtitle: "We sent a 6-digit code to make sure this email is yours." },
  identity: { title: "Your valid ID", subtitle: "So stores and riders know who they're serving. Only Feasto's admin sees it." },
  store: { title: "Your store", subtitle: "What residents will see." },
  location: { title: "Where is your store?", subtitle: "Riders and residents use this pin to find you." },
  permit: { title: "Your business permit", subtitle: "An admin checks this before your store goes live." },
  personal: { title: "About you", subtitle: "Feasto keeps these details private." },
  license: { title: "Your motorcycle and license", subtitle: "Feasto riders all use motorcycles." },
};

/** Which fields each step holds, to return to the right step when the server finds a problem. */
const STEP_FIELDS: Record<Step, string[]> = {
  account: ["firstName", "middleName", "lastName", "suffix", "email", "phone", "password"],
  verify: ["emailCode"],
  identity: ["idType"],
  store: ["storeName", "storeAddress", "storeType"],
  location: ["latitude", "longitude"],
  permit: PERMIT_FIELDS.map((f) => f.name),
  personal: RIDER_PERSONAL_FIELDS.map((f) => f.name),
  license: [...RIDER_LICENSE_FIELDS, STORE_CODE_FIELD].map((f) => f.name),
};

const emptyValues: Record<string, string> = {
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  idType: "",
  emailCode: "",
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

/**
 * The three account types on one orange track. The chosen one sits on an orange pill that slides
 * over when another is picked, and a line under it says what that account is for. Built from
 * radio buttons, so it works with the keyboard (arrow keys move between them).
 */
function RolePicker({ value, onChange }: { value: SignupRole; onChange: (role: SignupRole) => void }) {
  const chosen = Math.max(0, roleOptions.findIndex((o) => o.value === value));
  const current = roleOptions[chosen];
  const steps = STEPS[value].length;
  return (
    <fieldset>
      <legend className="sr-only">Account type</legend>
      <div className="relative grid grid-cols-3 rounded-2xl bg-[#fff4ec] p-1.5 ring-1 ring-brand-100 ring-inset">
        {/* The orange pill under the chosen type: slides from one to the next */}
        <span
          aria-hidden
          className="fx-role-pill pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/3)] rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 shadow-[0_10px_20px_-10px_rgba(210,70,0,0.9),inset_0_1px_0_rgba(255,255,255,0.25)]"
          style={{ transform: `translateX(${chosen * 100}%)` }}
        />
        {roleOptions.map(({ value: option, label, Icon }) => (
          <label
            key={option}
            className="group relative flex h-[62px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-[0.8125rem] font-semibold text-muted transition-colors duration-300 hover:text-ink has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500"
          >
            <input
              type="radio"
              name="role-choice"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {/* The chosen type's icon gives a little hop when it's picked */}
            <Icon key={value === option ? "on" : "off"} className={`size-5 ${value === option ? "fx-role-hop" : "text-brand-600/80"}`} aria-hidden />
            {label}
          </label>
        ))}
      </div>
      {/* What this account is for, and how many steps its sign-up takes */}
      <p key={value} aria-live="polite" className="fx-role-about mt-2.5 text-center text-sm text-muted">
        {current.about}
        {steps > 1 && <span className="font-semibold text-brand-700"> · {steps} quick steps</span>}
      </p>
    </fieldset>
  );
}

/** Quick checks before moving on from the account step. The API still validates everything. */
function checkAccountFields(values: Record<string, string>): FieldErrors {
  const errors: FieldErrors = {};
  const parts = [
    ["firstName", "first name", true],
    ["middleName", "middle name", false],
    ["lastName", "last name", true],
  ] as const;
  for (const [field, what, required] of parts) {
    const problem = nameProblem(values[field], what, required);
    if (problem) errors[field] = [problem];
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) errors.email = ["Enter a valid email address, like juan@gmail.com."];
  if (!/^09\d{9}$/.test(values.phone.trim())) errors.phone = ["Enter the 11-digit mobile number, like 09171234567."];
  const weak = passwordProblem(values.password);
  if (weak) errors.password = [weak];
  else {
    // The password shouldn't hold the person's own name or email
    const own = [values.firstName, values.lastName, values.email.split("@")[0]].map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((w) => w.length >= 4);
    if (own.some((w) => values.password.toLowerCase().includes(w))) errors.password = ["Don't use your name or email in your password."];
  }
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
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  /** A likely fix for a mistyped email ("gmial.com"), from the server's check */
  const [emailFix, setEmailFix] = useState<string | null>(null);
  /** The email a code was sent to, and the one whose code was typed right */
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [verified, setVerified] = useState<string | null>(null);
  /** Seconds until another code can be asked for */
  const [resendIn, setResendIn] = useState(0);
  /** Whether Feasto can email codes at all (sign-ups are closed until the admin sets it up) */
  const [mailReady, setMailReady] = useState(true);
  useEffect(() => {
    void apiRequest<{ ready: boolean }>("/auth/email-code").then((r) => r.ok && setMailReady(r.data.ready));
  }, []);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const steps = STEPS[role];
  const stepIndex = steps.indexOf(step);
  const isLastStep = stepIndex === steps.length - 1;

  /** Moves to another step: the card's content slides that way while the card changes size */
  function goTo(next: Step, direction: "auth-forward" | "auth-back") {
    startTransition(() => {
      addTransitionType(direction);
      setStep(next);
    });
  }

  // Editing a field clears its error message
  function clearError(name: string) {
    setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  }

  function update(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    // The code is 6 digits; anything else typed or pasted is dropped
    const value = event.target.name === "emailCode" ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value;
    setValues((current) => ({ ...current, [event.target.name]: value }));
    clearError(event.target.name);
    if (event.target.name === "email") setEmailFix(null);
  }

  /** Emails a code; false (with the reason under the email box) when it can't */
  async function sendCode(email: string) {
    setSubmitting(true);
    const result = await apiRequest<{ minutes: number; resendSeconds: number }>("/auth/email-code", { method: "POST", body: { email } });
    setSubmitting(false);
    if (!result.ok) {
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      else setError(result.error);
      if (result.fieldErrors?.email && step !== "account") goTo("account", "auth-back");
      return false;
    }
    setCodeSentTo(email);
    setVerified(null);
    setValues((current) => ({ ...current, emailCode: "" }));
    setResendIn(result.data.resendSeconds);
    return true;
  }

  /** On leaving the email box: a typo, a throwaway inbox, a domain that takes no mail, or an email already used */
  async function checkEmail() {
    const typed = values.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(typed)) return;
    const result = await apiRequest<{ ok: boolean; error?: string; suggestion?: string }>("/auth/check-email", { method: "POST", body: { email: typed } });
    if (!result.ok || result.data.ok) return;
    setFieldErrors((current) => ({ ...current, email: [result.data.error!] }));
    setEmailFix(result.data.suggestion ?? null);
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
    if (step === "verify") return /^\d{6}$/.test(values.emailCode) ? {} : { emailCode: ["Type the 6 digits from the email."] };
    if (step === "store") {
      return {
        ...(values.storeName.trim().length < 2 && { storeName: ["Enter your store's name."] }),
        ...(values.storeAddress.trim().length < 5 && { storeAddress: ["Enter your store's address."] }),
        ...(!storeType && { storeType: ["Choose your store type."] }),
      };
    }
    if (step === "location") return pin ? {} : { latitude: ["Move the map so the pin sits on your store."] };
    const documentMissing = documentFile
      ? {}
      : { document: [step === "identity" ? "Take or upload a photo of your valid ID." : `Upload a photo or PDF of your ${step === "permit" ? "business permit" : "driver's license"}.`] };
    if (step === "identity") return { ...(!values.idType && { idType: ["Choose the kind of ID."] }), ...documentMissing };
    if (step === "permit") return { ...blank(PERMIT_FIELDS), ...documentMissing };
    if (step === "personal") return blank(RIDER_PERSONAL_FIELDS);
    return { ...blank(RIDER_LICENSE_FIELDS), ...documentMissing };
  }

  function requestBody() {
    const { firstName, middleName, lastName, suffix, email, phone, password } = values;
    const account = { role, firstName, middleName, lastName, suffix, email, phone, password, acceptTerms: agreed };
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
    return { ...account, idType: values.idType };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(undefined);

    const errors = checkStep();
    if (isLastStep && !agreed) errors.acceptTerms = [TERMS_MISSING];
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!isLastStep) {
      const email = values.email.trim().toLowerCase();
      if (step === "account") {
        // Already confirmed this email: straight past the code
        if (verified === email) return goTo(steps[stepIndex + 2], "auth-forward");
        if (codeSentTo !== email || resendIn === 0) {
          if (!(await sendCode(email))) return;
        }
        return goTo("verify", "auth-forward");
      }
      if (step === "verify") {
        setSubmitting(true);
        const result = await apiRequest("/auth/email-code/verify", { method: "POST", body: { email, code: values.emailCode } });
        setSubmitting(false);
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? { emailCode: [result.error] });
          return;
        }
        setVerified(email);
      }
      goTo(steps[stepIndex + 1], "auth-forward");
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
      if (wrong === "verify") setVerified(null);
      if (wrong) setStep(wrong);
      setSubmitting(false);
      return;
    }
    // The account now exists. If this upload fails, Home asks for the document again.
    const uploaded = documentFile ? await uploadDocument(documentFile).then(() => true, () => false) : true;
    const role = result.data.user.role;
    toast.later(
      role === "RESIDENT"
        ? uploaded
          ? { tone: "success", title: "Your account is ready!", description: "Welcome to Feasto. The admin will check your ID soon." }
          : { tone: "warning", title: "Account created, but your ID didn't upload", description: "Upload it again from your home page." }
        : uploaded
          ? { tone: "success", title: "Account created", description: "Feasto will review your details. We'll let you know when you're approved." }
          : { tone: "warning", title: "Account created, but the document didn't upload", description: "Upload it again from your home page so Feasto can review you." },
    );
    // A full page load (not router.replace) after signing in: Next.js keeps visited pages
    // alive in the background, so this clears the old form, its loading state and the
    // typed password, and makes the next visit to /login or /register check the new session.
    // The app opens in a circle from the Create account button (enter-app, globals.css).
    rememberCircleAt(formElement.querySelector('button[type="submit"]'));
    window.location.replace(ROLE_HOME[result.data.user.role]);
  }

  const fieldError = (name: string) => fieldErrors[name]?.[0];

  /** Agreeing to the Terms and Privacy Policy, just above Create account */
  const terms = (
    <TermsAgreement
      checked={agreed}
      onChange={(value) => {
        setAgreed(value);
        if (value) clearError("acceptTerms");
      }}
      error={fieldError("acceptTerms")}
    />
  );

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
      <ViewTransition key={step} enter={SWAP} exit={SWAP} default="none">
      <div>
      <DetailsStep
        step={stepIndex + 1}
        total={steps.length}
        {...STEP_TEXT[step]}
        error={error}
        submitting={submitting}
        isLast={isLastStep}
        beforeSubmit={isLastStep ? terms : null}
        onBack={() => {
          setError(undefined);
          setFieldErrors({});
          const previous = steps[stepIndex - 1];
          goTo(previous === "verify" && verified === values.email.trim().toLowerCase() ? "account" : previous, "auth-back");
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
        {step === "verify" && (
          <>
            <p className="flex items-start gap-2.5 rounded-xl bg-canvas px-3 py-2.5 text-sm text-muted">
              <MailCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <span>
                Sent to <span className="font-semibold break-all text-ink">{values.email.trim()}</span>. Check your inbox and Spam folder. It works for 10 minutes.
              </span>
            </p>
            <TextField
              label="6-digit code"
              name="emailCode"
              value={values.emailCode}
              onChange={update}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              autoFocus
              required
              className="[&_input]:text-center [&_input]:text-xl [&_input]:font-semibold [&_input]:tracking-[0.4em]"
              error={fieldError("emailCode")}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                disabled={resendIn > 0 || submitting}
                onClick={() => void sendCode(values.email.trim().toLowerCase())}
                className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 disabled:text-muted disabled:no-underline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
              </button>
              <button
                type="button"
                onClick={() => goTo("account", "auth-back")}
                className="font-semibold text-muted underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                Change email
              </button>
            </div>
          </>
        )}
        {step === "identity" && (
          <>
            <SelectField
              label="Kind of ID"
              name="idType"
              placeholder="Choose your ID"
              options={ID_TYPE_OPTIONS}
              value={values.idType}
              onChange={update}
              required
              autoFocus
              error={fieldError("idType")}
            />
            <DocumentPicker
              label="Photo of your ID"
              hint="The front, with your name and photo readable. JPG, PNG or PDF, up to 5 MB."
              file={documentFile}
              camera
              onChange={(file) => {
                setDocumentFile(file);
                clearError("document");
              }}
              error={fieldError("document")}
            />
            <p className="flex items-start gap-2 rounded-xl bg-canvas px-3 py-2.5 text-sm text-muted">
              <IdCard className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <span>
                The name on the ID must match <span className="font-semibold text-ink">{[values.firstName, values.middleName, values.lastName, values.suffix].filter((x) => x.trim()).join(" ")}</span>. You can order right away while the admin checks it.
              </span>
            </p>
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
      </div>
      </ViewTransition>
    );
  }

  return (
    <ViewTransition key="account" enter={SWAP} exit={SWAP} default="none">
    <div>
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
        {!mailReady && <Alert tone="pending">Sign-ups are closed for now: Feasto can&apos;t email the confirmation code yet. Please try again later.</Alert>}

        {/* The name in parts, exactly as on a valid ID */}
        <fieldset className="space-y-3">
          <legend className="sr-only">Your name, as on your ID</legend>
          <TextField
            label="First name"
            name="firstName"
            value={values.firstName}
            onChange={update}
            autoComplete="given-name"
            placeholder="Juan"
            icon={UserRound}
            required
            error={fieldError("firstName")}
          />
          <TextField
            label="Middle name (optional)"
            name="middleName"
            value={values.middleName}
            onChange={update}
            autoComplete="additional-name"
            placeholder="Santos"
            error={fieldError("middleName")}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
            <TextField
              label="Last name"
              name="lastName"
              value={values.lastName}
              onChange={update}
              autoComplete="family-name"
              placeholder="Dela Cruz"
              required
              error={fieldError("lastName")}
            />
            <SelectField label="Suffix" name="suffix" placeholder="None" options={SUFFIX_OPTIONS} value={values.suffix} onChange={update} error={fieldError("suffix")} />
          </div>
        </fieldset>
        <TextField
          label="Email"
          name="email"
          type="email"
          value={values.email}
          onChange={update}
          autoComplete="email"
          placeholder="juan@gmail.com"
          icon={Mail}
          required
          onBlur={() => void checkEmail()}
          error={fieldError("email")}
        />
        {emailFix && (
          <button
            type="button"
            onClick={() => {
              setValues((current) => ({ ...current, email: emailFix }));
              setEmailFix(null);
              clearError("email");
            }}
            className="-mt-1 text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            Use {emailFix}
          </button>
        )}
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
          placeholder="Like Kape@Umaga24"
          icon={LockKeyhole}
          required
          error={fieldError("password")}
          hint={values.password && <PasswordStrength password={values.password} />}
        />
        <div className="-mt-1">
          <PasswordRules password={values.password} />
        </div>

        {isLastStep && terms}

        <div className="pt-1">
          <Button type="submit" loading={submitting} className={`group w-full ${AUTH_BUTTON}`}>
            {/* Fades in afresh when the account type changes */}
            <span key={role} className="fx-role-about">
              {submitting ? "Sending the code…" : "Continue"}
            </span>
            {steps.length > 1 && <ArrowRight className="size-[18px] transition group-hover:translate-x-0.5" aria-hidden />}
          </Button>
        </div>
      </form>
    </div>
    </ViewTransition>
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
  beforeSubmit,
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
  beforeSubmit: ReactNode;
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
        {beforeSubmit}
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

const TERMS_MISSING = "Agree to the Terms of Service and Privacy Policy to create your account.";

/** The box to tick before an account is made. The names open the full text in a pop-up, so nothing typed is lost. */
function TermsAgreement({ checked, onChange, error }: { checked: boolean; onChange: (checked: boolean) => void; error?: string }) {
  const link = "font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500";
  // The pop-up sits outside the sentence, so it isn't part of the box's name
  const [reading, setReading] = useState<Doc | null>(null);
  return (
    <div>
      <div className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 ${error ? "border-red-300 bg-red-50/60" : "border-line bg-canvas/60"}`}>
        <input
          id="accept-terms"
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-label="I agree to Feasto's Terms of Service and Privacy Policy"
          aria-invalid={!!error}
          aria-describedby={error ? "accept-terms-error" : undefined}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        />
        {/* The label covers the words only, so tapping a policy's name opens it instead of ticking the box */}
        <p className="text-sm leading-snug text-ink">
          <label htmlFor="accept-terms" className="cursor-pointer">
            I agree to Feasto&apos;s{" "}
          </label>
          <button type="button" onClick={() => setReading("terms")} className={link}>
            Terms of Service
          </button>{" "}
          <label htmlFor="accept-terms" className="cursor-pointer">
            and{" "}
          </label>
          <button type="button" onClick={() => setReading("privacy")} className={link}>
            Privacy Policy
          </button>
          <label htmlFor="accept-terms" className="cursor-pointer">
            .
          </label>
        </p>
      </div>
      <LegalDialog doc={reading} onClose={() => setReading(null)} />
      {error && (
        <p id="accept-terms-error" role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
