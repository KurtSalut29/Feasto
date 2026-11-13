"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PasswordForm } from "@/components/app/password-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { initials } from "@/lib/format";

/** Opens the change-password pop-up (vendor and admin). "icon" is the key in the sidebar; "button" is for the settings card. */
export function ChangePasswordButton({ email, variant = "button", className = "" }: { email: string; variant?: "icon" | "button"; className?: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Change password"
          title="Change password"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <KeyRound className="size-[18px]" aria-hidden />
        </button>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)} className={className}>
          <KeyRound className="size-[18px]" aria-hidden />
          Change password
        </Button>
      )}
      <Dialog open={open} onClose={close} title="Change password" description={`For ${email}`}>
        <PasswordForm onCancel={close} onDone={close} />
      </Dialog>
    </>
  );
}

/** "Your account" card in Store settings and admin Settings: who is signed in, and the password button. */
export function AccountSecurityCard({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  return (
    <section aria-labelledby="account-security" className="@container overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <ShieldCheck className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="account-security" className="font-semibold text-ink">
            Your account
          </h2>
          <p className="mt-0.5 text-sm text-muted">Log-in details for this {roleLabel} account.</p>
        </div>
      </header>
      {/* Side by side only when the card is wide (it is narrow in the Store settings side column) */}
      <div className="flex flex-col gap-4 p-5 @md:flex-row @md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{name}</p>
            <p className="truncate text-sm text-muted">{email}</p>
          </div>
        </div>
        <ChangePasswordButton email={email} className="w-full @md:w-auto" />
      </div>
    </section>
  );
}
