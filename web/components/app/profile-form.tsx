"use client";

import { BadgeCheck, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { nameProblem, splitName, SUFFIX_OPTIONS } from "@/lib/identity";
import type { User } from "@/lib/types";
import { toast } from "@/components/ui/toast";

/**
 * Edit the name (in parts, as on a valid ID) and mobile number. The email is the login, so it
 * stays fixed; once the admin verified a resident's ID, the name stays as it is on the ID too.
 */
export function ProfileForm({ user }: { user: Pick<User, "name" | "firstName" | "middleName" | "lastName" | "suffix" | "phone" | "email" | "idStatus"> }) {
  const router = useRouter();
  // Accounts made before names were split start from the full name
  const parts = user.firstName ? { firstName: user.firstName, lastName: user.lastName ?? "" } : splitName(user.name);
  const [values, setValues] = useState({ ...parts, middleName: user.middleName ?? "", suffix: user.suffix ?? "", phone: user.phone ?? "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const locked = user.idStatus === "VERIFIED";
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    const problems: FieldErrors = {};
    for (const [field, what, required] of [["firstName", "first name", true], ["middleName", "middle name", false], ["lastName", "last name", true]] as const) {
      const problem = nameProblem(values[field], what, required);
      if (problem) problems[field] = [problem];
    }
    setFieldErrors(problems);
    if (Object.keys(problems).length) return;
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
    toast.success("Profile saved");
    router.refresh();
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {locked && (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Your name matches your verified ID, so it can&apos;t be changed here.
        </p>
      )}
      <TextField label="First name" value={values.firstName} onChange={set("firstName")} autoComplete="given-name" disabled={locked} required error={fieldErrors.firstName?.[0]} />
      <TextField label="Middle name (optional)" value={values.middleName} onChange={set("middleName")} autoComplete="additional-name" disabled={locked} error={fieldErrors.middleName?.[0]} />
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
        <TextField label="Last name" value={values.lastName} onChange={set("lastName")} autoComplete="family-name" disabled={locked} required error={fieldErrors.lastName?.[0]} />
        <SelectField label="Suffix" placeholder="None" options={SUFFIX_OPTIONS} value={values.suffix} onChange={set("suffix")} disabled={locked} error={fieldErrors.suffix?.[0]} />
      </div>
      <TextField
        label="Mobile number"
        type="tel"
        inputMode="tel"
        value={values.phone}
        onChange={set("phone")}
        autoComplete="tel"
        error={fieldErrors.phone?.[0]}
      />
      <TextField label="Email" value={user.email} disabled hint="Your email is your login and can't be changed." />
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
