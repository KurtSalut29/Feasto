"use client";

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";

/** Edit name and mobile number. The email is the login, so it stays fixed. */
export function ProfileForm({ name, phone, email }: { name: string; phone: string | null; email: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ name, phone: phone ?? "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setSaved(false);
    const result = await apiRequest("/me/profile", { method: "PATCH", body: values });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setFieldErrors({});
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <TextField
        label="Full name"
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        autoComplete="name"
        error={fieldErrors.name?.[0]}
      />
      <TextField
        label="Mobile number"
        type="tel"
        inputMode="tel"
        value={values.phone}
        onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
        autoComplete="tel"
        error={fieldErrors.phone?.[0]}
      />
      <TextField label="Email" value={email} disabled hint="Your email is your login and can't be changed." />
      <div className="flex items-center justify-end gap-3 pt-1">
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700" role="status">
            <CircleCheck className="size-4" aria-hidden />
            Saved
          </span>
        )}
        <Button type="submit" loading={saving}>
          Save
        </Button>
      </div>
    </form>
  );
}
