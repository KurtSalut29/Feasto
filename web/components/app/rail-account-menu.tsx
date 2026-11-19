"use client";

import { KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { initials } from "@/lib/format";
import { ChangePasswordDialog } from "./change-password-dialog";
import { LogoutConfirm } from "./logout-button";

/**
 * The signed-in person when the sidebar is folded: just their initials. Tapping them opens a small
 * menu beside the rail with their name, Change password and Log out, instead of stacking three
 * buttons in a rail that has no room for them.
 *
 * The menu is a native popover (it sits above the page and closes on Escape or a tap outside). The
 * two pop-ups live outside it, because a closed popover hides everything inside it.
 */
export function RailAccountMenu({ name, email, passwordHref }: { name: string; email: string; passwordHref?: string }) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<"password" | "logout" | null>(null);
  const choose = (which: "password" | "logout") => {
    menu.current?.hidePopover();
    setOpen(which);
  };
  const row =
    "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500";

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={`${name}: account menu`}
        title={name}
        className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white transition hover:ring-4 hover:ring-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {initials(name)}
      </button>
      {/* Beside the rail's bottom: the rail is 4.75rem wide and 1rem from the left */}
      <div
        ref={menu}
        id={id}
        popover="auto"
        className="fixed inset-auto bottom-4 left-[6.5rem] m-0 w-64 rounded-2xl border border-line bg-white p-2 text-ink shadow-[0_16px_48px_-16px_rgba(31,45,61,0.35)] motion-safe:open:animate-[fade-in_0.15s_ease-out]"
      >
        <div className="flex items-center gap-3 px-2 pt-1.5 pb-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white" aria-hidden>
            {initials(name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block truncate text-xs text-muted">{email}</span>
          </span>
        </div>
        <div className="space-y-0.5 border-t border-line pt-2">
          {passwordHref ? (
            <Link href={passwordHref} onClick={() => menu.current?.hidePopover()} className={`${row} text-ink hover:bg-canvas`}>
              <KeyRound className="size-[18px] text-muted" aria-hidden />
              Change password
            </Link>
          ) : (
            <button type="button" onClick={() => choose("password")} className={`${row} text-ink hover:bg-canvas`}>
              <KeyRound className="size-[18px] text-muted" aria-hidden />
              Change password
            </button>
          )}
          <button type="button" onClick={() => choose("logout")} className={`${row} text-red-600 hover:bg-red-50`}>
            <LogOut className="size-[18px]" aria-hidden />
            Log out
          </button>
        </div>
      </div>
      {!passwordHref && <ChangePasswordDialog open={open === "password"} onClose={() => setOpen(null)} email={email} />}
      <LogoutConfirm open={open === "logout"} onClose={() => setOpen(null)} />
    </>
  );
}
