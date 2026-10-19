"use client";

import { ArrowLeft, Bike, ShoppingBag, Store, type LucideIcon } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import { ROLE_HOME } from "@/lib/roles";
import type { Role, User } from "@/lib/types";

type SignupRole = Exclude<Role, "ADMIN">;

const roleOptions: { role: SignupRole; label: string; Icon: LucideIcon }[] = [
  { role: "RESIDENT", label: "Resident", Icon: ShoppingBag },
  { role: "RIDER", label: "Rider", Icon: Bike },
  { role: "VENDOR", label: "Vendor", Icon: Store },
];

const ACCOUNT_FIELDS = ["name", "email", "phone", "password"] as const;

const emptyValues = { name: "", email: "", phone: "", password: "", storeName: "", storeAddress: "" };

/** Quick checks before a vendor moves on to step 2. The API still validates everything. */
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
  // Vendors fill in their account first, then their store, so each step fits on screen.
  const [step, setStep] = useState<"account" | "store">("account");
  const [values, setValues] = useState(emptyValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const isVendor = role === "VENDOR";

  function update(event: ChangeEvent<HTMLInputElement>) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (isVendor && step === "account") {
      const errors = checkAccountFields(values);
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) setStep("store");
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    const { storeName, storeAddress, ...account } = values;
    const result = await apiRequest<{ user: User }>("/auth/register", {
      method: "POST",
      body: isVendor ? { role, ...account, storeName, storeAddress } : { role, ...account },
    });

    if (!result.ok) {
      // Field problems are shown under each field, so only show the banner for other errors
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      // Send the vendor back to step 1 if the problem is there (e.g. email already used)
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

  if (step === "store") {
    return (
      <>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">Step 2 of 2</p>
        <h1 className="mt-1 text-center text-2xl font-bold tracking-tight text-ink">Your store</h1>
        <p className="mt-1 text-balance text-center text-[15px] text-muted">
          An admin reviews new stores before residents can see them.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
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
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={() => setStep("account")} aria-label="Back to account details">
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

  return (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Create your account</h1>

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
        <fieldset>
          <legend className="sr-only">Account type</legend>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1">
            {roleOptions.map(({ role: value, label, Icon }) => (
              <label
                key={value}
                className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted transition
                  hover:text-ink has-checked:bg-white has-checked:font-semibold has-checked:text-ink has-checked:shadow-sm has-checked:ring-1 has-checked:ring-line
                  has-focus-visible:outline-2 has-focus-visible:outline-brand-500"
              >
                <input
                  type="radio"
                  name="role-choice"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                  className="sr-only"
                />
                <Icon className={`size-4 ${role === value ? "text-brand-600" : ""}`} aria-hidden />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

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
            {isVendor ? "Continue to store details" : submitting ? "Creating account…" : "Create account"}
          </Button>
        </div>
      </form>
    </>
  );
}
