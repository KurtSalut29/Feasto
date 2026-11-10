"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordStrength } from "@/components/ui/password-strength";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";

const EMPTY = { currentPassword: "", newPassword: "", confirm: "" };

/** Change the password. The server logs the account out on every other device. */
export function PasswordForm() {
  const [values, setValues] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const set = (field: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setSaved(false);
  };

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

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && (
        <Alert tone="success" title="Password changed">
          Use your new password next time you log in. Any other phone or computer signed in to this account was logged out.
        </Alert>
      )}
      <TextField
        label="Current password"
        type="password"
        value={values.currentPassword}
        onChange={set("currentPassword")}
        autoComplete="current-password"
        error={fieldErrors.currentPassword?.[0]}
      />
      <TextField
        label="New password"
        type="password"
        value={values.newPassword}
        onChange={set("newPassword")}
        autoComplete="new-password"
        placeholder="8+ letters and numbers"
        error={fieldErrors.newPassword?.[0]}
        hint={values.newPassword && <PasswordStrength password={values.newPassword} />}
      />
      <TextField
        label="Confirm new password"
        type="password"
        value={values.confirm}
        onChange={set("confirm")}
        autoComplete="new-password"
        error={fieldErrors.confirm?.[0]}
      />
      <div className="flex justify-end pt-1">
        <Button type="submit" loading={saving} disabled={!values.currentPassword || !values.newPassword || !values.confirm}>
          Change password
        </Button>
      </div>
    </form>
  );
}
