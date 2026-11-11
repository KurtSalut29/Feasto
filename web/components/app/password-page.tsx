import { KeyRound, LockKeyhole, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { PasswordForm } from "@/components/app/password-form";
import { MobileHeading } from "@/components/app/mobile-shell";

const TIPS = [
  { Icon: ShieldCheck, text: "Use one you don't use on other apps or sites." },
  { Icon: LockKeyhole, text: "Feasto will never ask for your password by text, chat or call." },
  { Icon: MonitorSmartphone, text: "Changing it logs out every other phone or computer using this account." },
];

/** The change-password page for residents and riders (vendor and admin use the pop-up). */
export function PasswordPage({ email, backHref }: { email: string; backHref: string }) {
  return (
    <div className="md:max-w-3xl">
      <MobileHeading title="Change password" />
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_260px] md:gap-6">
        <section aria-label="New password" className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {/* Who this is for, so nobody changes the wrong account on a shared phone */}
          <div className="relative flex items-center gap-3.5 overflow-hidden bg-gradient-to-br from-brand-500 to-brand-700 px-5 py-4 text-white">
            <KeyRound aria-hidden className="pointer-events-none absolute -right-3 -bottom-5 size-24 rotate-[-20deg] text-white/10" />
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <LockKeyhole className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">Keep your account safe</p>
              <p className="text-sm [overflow-wrap:anywhere] text-white/80">Signed in as {email}</p>
            </div>
          </div>
          <div className="p-5">
            <PasswordForm doneHref={backHref} />
          </div>
        </section>

        <aside aria-label="Good to know" className="rounded-3xl bg-brand-50/60 p-5 ring-1 ring-brand-100">
          <h2 className="text-sm font-semibold text-ink">Good to know</h2>
          <ul className="mt-3 space-y-3 text-sm text-muted">
            {TIPS.map(({ Icon, text }) => (
              <li key={text} className="flex gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
