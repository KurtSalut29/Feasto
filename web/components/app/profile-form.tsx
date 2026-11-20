"use client";

import { BadgeCheck, Bike, CircleCheck, Clock, IdCard, Lock, Mail, Phone, ShieldAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { nameProblem, splitName, SUFFIX_OPTIONS } from "@/lib/identity";
import type { User } from "@/lib/types";
import { toast } from "@/components/ui/toast";

type ProfileUser = Pick<User, "name" | "firstName" | "middleName" | "lastName" | "suffix" | "phone" | "email" | "idStatus" | "role" | "riderProfile">;

const ROLE_NAME: Partial<Record<User["role"], string>> = { RESIDENT: "Resident", RIDER: "Rider" };

/** "09171234567" → "0917 123 4567" */
const spacedPhone = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : phone;
};

/** A titled part of the form */
function Section({ title, text, Icon, children }: { title: string; text: string; Icon: typeof UserRound; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100" aria-hidden>
          <Icon className="size-[18px]" />
        </span>
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          <p className="text-sm text-muted">{text}</p>
        </div>
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

/**
 * Edit the name (in parts, as on a valid ID) and mobile number, beside a card showing the account
 * as others see it. The email is the login, so it stays fixed; once the admin verified a resident's
 * ID, the name stays as it is on the ID too.
 */
export function ProfileForm({ user }: { user: ProfileUser }) {
  const router = useRouter();
  // Accounts made before names were split start from the full name
  const parts = user.firstName ? { firstName: user.firstName, lastName: user.lastName ?? "" } : splitName(user.name);
  const [values, setValues] = useState({ ...parts, middleName: user.middleName ?? "", suffix: user.suffix ?? "", phone: user.phone ?? "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const locked = user.idStatus === "VERIFIED";
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  // The card follows what's typed, so the change is seen before it's saved
  const fullName = [values.firstName, values.middleName, values.lastName, values.suffix].map((p) => p.trim()).filter(Boolean).join(" ") || user.name;
  const initials = `${values.firstName.trim()[0] ?? ""}${values.lastName.trim()[0] ?? ""}`.toUpperCase() || "?";
  const resident = user.role === "RESIDENT";
  const vehicle = [user.riderProfile?.vehicleModel, user.riderProfile?.plateNumber].filter(Boolean).join(" · ");

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

  const id =
    user.idStatus === "VERIFIED"
      ? { Icon: BadgeCheck, text: "Valid ID verified", tone: "text-emerald-700" }
      : user.idStatus === "PENDING"
        ? { Icon: Clock, text: "Valid ID being checked", tone: "text-sky-700" }
        : user.idStatus === "REJECTED"
          ? { Icon: ShieldAlert, text: "Valid ID not accepted", tone: "text-red-700" }
          : { Icon: IdCard, text: "No valid ID yet", tone: "text-amber-700" };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[21rem_minmax(0,1fr)]">
      {/* The account at a glance */}
      <aside aria-label="Your account" className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:sticky lg:top-24">
        <div className="relative h-24 overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700">
          <span className="absolute -top-10 -right-8 size-36 rounded-full border-[22px] border-white/10" aria-hidden />
          <span className="absolute -bottom-16 left-10 size-32 rounded-full bg-white/10" aria-hidden />
        </div>
        <div className="-mt-11 px-5 pb-5">
          <span className="relative flex size-[5.5rem] items-center justify-center rounded-full bg-white text-[1.75rem] font-bold tracking-tight text-brand-700 shadow-[0_8px_24px_-10px_rgba(16,24,40,0.45)] ring-4 ring-white" aria-hidden>
            <span className="flex size-full items-center justify-center rounded-full bg-brand-50">{initials}</span>
          </span>
          <p className="mt-3 text-lg leading-snug font-bold tracking-tight [overflow-wrap:anywhere] text-ink">{fullName}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">{ROLE_NAME[user.role] ?? user.role}</span>
            {resident && (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${id.tone}`}>
                <id.Icon className="size-3.5" aria-hidden />
                {id.text}
              </span>
            )}
          </p>
          <ul className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
            <li className="flex items-center gap-2.5 text-ink">
              <Mail className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">{user.email}</span>
            </li>
            <li className="flex items-center gap-2.5 text-ink">
              <Phone className="size-4 shrink-0 text-muted" aria-hidden />
              {values.phone.trim() ? spacedPhone(values.phone.trim()) : <span className="text-muted">No mobile number</span>}
            </li>
            {vehicle && (
              <li className="flex items-center gap-2.5 text-ink">
                <Bike className="size-4 shrink-0 text-muted" aria-hidden />
                {vehicle}
              </li>
            )}
          </ul>
          {resident && !user.idStatus && (
            <Link href="/resident#valid-id" className="mt-4 block rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-brand-500">
              <span className="font-semibold">Add your valid ID</span> to use Pabili and pay in cash.
            </Link>
          )}
        </div>
      </aside>

      <form onSubmit={save} noValidate className="min-w-0 space-y-5">
        {error && <Alert tone="error">{error}</Alert>}

        <Section Icon={UserRound} title="Your name" text={resident ? "As it is on your valid ID, so stores and riders know who to look for." : "As it is on your license, so stores and residents know who to look for."}>
          {locked && (
            <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              Your name matches your verified ID, so it can&apos;t be changed here.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="First name" value={values.firstName} onChange={set("firstName")} autoComplete="given-name" disabled={locked} required error={fieldErrors.firstName?.[0]} />
            <TextField label="Middle name (optional)" value={values.middleName} onChange={set("middleName")} autoComplete="additional-name" disabled={locked} error={fieldErrors.middleName?.[0]} />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
            <TextField label="Last name" value={values.lastName} onChange={set("lastName")} autoComplete="family-name" disabled={locked} required error={fieldErrors.lastName?.[0]} />
            <SelectField label="Suffix" placeholder="None" options={SUFFIX_OPTIONS} value={values.suffix} onChange={set("suffix")} disabled={locked} error={fieldErrors.suffix?.[0]} />
          </div>
        </Section>

        <Section Icon={Phone} title="How Feasto reaches you" text={`${resident ? "Riders and stores call this number about your orders" : "Residents and stores call this number about your deliveries"}. Your email is how you log in.`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Mobile number" type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} autoComplete="tel" placeholder="09171234567" error={fieldErrors.phone?.[0]} />
            <TextField label="Email" value={user.email} disabled hint="Your login, so it can't be changed." />
          </div>
        </Section>

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700" role="status">
              <CircleCheck className="size-4" aria-hidden />
              Saved
            </span>
          )}
          <Button type="submit" loading={saving} className="px-8">
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
