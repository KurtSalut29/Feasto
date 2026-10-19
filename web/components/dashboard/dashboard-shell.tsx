import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ROLE_HOME, ROLE_LABEL } from "@/lib/roles";
import type { User } from "@/lib/types";
import { LogoutButton } from "./logout-button";

function Header({ user }: { user?: User }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={user ? ROLE_HOME[user.role] : "/"}
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Image src="/Logo/feasto-logo.png" alt="Feasto" width={108} height={32} className="h-8 w-auto" priority />
        </Link>

        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-ink">{user.name}</p>
              <p className="text-xs text-muted">{user.email}</p>
            </div>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              {ROLE_LABEL[user.role]}
            </span>
            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}

export function DashboardShell({ user, children }: { user: User; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

/** Shown while the signed-in user is loading. */
export function DashboardSkeleton() {
  return (
    <div className="min-h-dvh bg-canvas">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10" aria-busy="true">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-gray-200" />
        <div className="mt-3 h-5 w-80 max-w-full animate-pulse rounded-lg bg-gray-200" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
      </main>
    </div>
  );
}

export function Greeting({ user, subtitle }: { user: User; subtitle: string }) {
  const firstName = user.name.split(" ")[0];
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">Hello, {firstName}</h1>
      <p className="mt-1.5 text-muted">{subtitle}</p>
    </div>
  );
}

/** A dashboard card for a feature that is still being built. */
export function UpcomingCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-gray-400">Coming soon</p>
    </div>
  );
}
