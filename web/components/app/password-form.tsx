"use client";

import { Check, CircleCheck, KeyRound, LockKeyhole, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { PasswordStrength } from "@/components/ui/password-strength";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";

const EMPTY = { currentPassword: "", newPassword: "", confirm: "" };

/** The same rules the server checks (server/src/routes/auth.ts newPassword) */
const RULES = [
  { label: "8+ characters", met: (p: string) => p.length >= 8 },
  { label: "A letter", met: (p: string) => /[A-Za-z]/.test(p) },
  { label: "A number", met: (p: string) => /\d/.test(p) },
];

/**
 * Change the password. The server logs the account out on every other device.
 * In a pop-up, pass onCancel/onDone; on a page, pass doneHref for the button after it's changed.
 */
export function PasswordForm({ onCancel, onDone, doneHref }: { onCancel?: () => void; onDone?: () => void; doneHref?: string }) {
  const [values, setValues] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const set = (field: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }));
  };

  const rulesMet = RULES.every((rule) => rule.met(values.newPassword));
  const matches = values.confirm !== "" && values.confirm === values.newPassword;

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (values.confirm !== values.newPassword) {
      setFieldErrors({ confirm: ["The two new passwords don't match."] });
      return;
    }
    setSaving(true);
    const result = await apiRequest("/me/password", {
      method: "PATCH",
      body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setFieldErrors({});
    setValues(EMPTY);
    setSaved(true);
    toast.success("Password changed", "Use the new one the next time you log in. Your other devices were logged out.");
  }

  if (saved) {
    return (
      <div role="status" className="flex flex-col items-center px-2 py-4 text-center motion-safe:animate-[rise-in_0.35s_ease-out]">
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
          <CircleCheck className="size-9 text-emerald-600 motion-safe:animate-[pop_0.4s_cubic-bezier(0.34,1.56,0.64,1)]" aria-hidden />
        </span>
        <h3 className="mt-4 text-lg font-semibold text-ink">Password changed</h3>
        <p className="mt-1 max-w-xs text-sm text-muted">
          Use your new password the next time you log in. Any other phone or computer signed in to this account was logged out.
        </p>
        {onDone ? (
          <Button type="button" onClick={onDone} className="mt-5 w-full sm:w-auto">
            Done
          </Button>
        ) : doneHref ? (
          <ButtonLink href={doneHref} className="mt-5 w-full sm:w-auto">
            Back to account
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}

      <TextField
        label="Current password"
        type="password"
        icon={LockKeyhole}
        value={values.currentPassword}
        onChange={set("currentPassword")}
        autoComplete="current-password"
        placeholder="The one you log in with now"
        error={fieldErrors.currentPassword?.[0]}
      />

      <div className="space-y-4 rounded-2xl bg-canvas/70 p-4 ring-1 ring-line/70">
        <div>
          <TextField
            label="New password"
            type="password"
            icon={KeyRound}
            value={values.newPassword}
            onChange={set("newPassword")}
            autoComplete="new-password"
            placeholder="8+ letters and numbers"
            error={fieldErrors.newPassword?.[0]}
          />
          {/* Each rule ticks green as it is met */}
          <ul aria-label="Your new password needs" className="mt-2.5 flex flex-wrap gap-1.5">
            {RULES.map((rule) => {
              const met = rule.met(values.newPassword);
              return (
                <li
                  key={rule.label}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    met ? "bg-emerald-100 text-emerald-800" : "bg-white text-muted ring-1 ring-line"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex size-3.5 items-center justify-center rounded-full transition-colors ${met ? "bg-emerald-600 text-white" : "bg-line"}`}
                  >
                    {met && <Check className="size-2.5 motion-safe:animate-[pop_0.25s_ease-out]" strokeWidth={3.5} />}
                  </span>
                  {rule.label}
                  <span className="sr-only">{met ? " (done)" : " (not yet)"}</span>
                </li>
              );
            })}
          </ul>
          {values.newPassword && (
            <div className="mt-3">
              <PasswordStrength password={values.newPassword} />
              {rulesMet && <p className="mt-1 text-xs text-muted">Make it longer, or mix in capitals or a symbol, to make it stronger.</p>}
            </div>
          )}
        </div>

        <TextField
          label="Type the new password again"
          type="password"
          icon={ShieldCheck}
          value={values.confirm}
          onChange={set("confirm")}
          autoComplete="new-password"
          error={fieldErrors.confirm?.[0]}
          hint={
            values.confirm &&
            (matches ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <Check className="size-3.5" strokeWidth={3} aria-hidden /> Passwords match
              </span>
            ) : (
              <span className="text-amber-700">Not the same as the new password yet</span>
            ))
          }
        />
      </div>

      <p className="flex gap-2.5 text-[0.8125rem] text-muted">
        <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
        You stay logged in here. Other phones and computers signed in to this account will be logged out.
      </p>

      <div className={`flex flex-col-reverse gap-2 sm:flex-row ${onCancel ? "sm:justify-end" : ""}`}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          loading={saving}
          disabled={!values.currentPassword || !values.newPassword || !values.confirm}
          className={onCancel ? "" : "w-full"}
        >
          Change password
        </Button>
      </div>
    </form>
  );
}
