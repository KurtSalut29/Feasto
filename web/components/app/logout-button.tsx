"use client";

import { CircleCheck, LogOut } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/browser-api";
import { lessMotion } from "@/lib/display";
import { rememberCircleAt } from "@/lib/page-entrance";
import { forgetPushForLogout } from "@/lib/push";
import { toast } from "@/components/ui/toast";

/**
 * Log out button that asks for confirmation first.
 * "icon" for the dashboard sidebar, "row" for the mobile Account tab.
 */
export function LogoutButton({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {variant === "row" ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white text-[0.9375rem] font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <LogOut className="size-5" aria-hidden />
          Log out
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Log out"
          title="Log out"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <LogOut className="size-[18px]" aria-hidden />
        </button>
      )}
      <LogoutConfirm open={confirming} onClose={() => setConfirming(false)} />
    </>
  );
}

/** How long the goodbye shows before the app closes */
const GOODBYE_MS = 900;

/** Pop-up with the Feasto logo asking "Log out of Feasto?". */
function LogoutConfirm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  /** The goodbye check mark: the app closes in a circle towards it */
  const checkRef = useRef<HTMLSpanElement>(null);
  const [pending, setPending] = useState(false);
  /** Logged out: a goodbye shows for a moment before the app closes */
  const [done, setDone] = useState(false);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function logOut() {
    setPending(true);
    // This browser stops getting this account's notifications (it gets them again after the next log-in)
    await forgetPushForLogout();
    await apiRequest("/auth/logout", { method: "POST" });
    toast.later({ tone: "success", title: "You're logged out", description: "See you again soon!" });
    setDone(true);
    await new Promise((resolve) => setTimeout(resolve, lessMotion() ? 0 : GOODBYE_MS));
    // Full page load so no signed-in pages stay alive in the background after logout.
    // The app then closes in a circle towards the check mark, showing the login screen (leave-app, globals.css).
    rememberCircleAt(checkRef.current);
    window.location.replace("/login");
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onClose={onClose}
      onCancel={(e) => {
        // Esc does nothing once logging out has started
        if (pending) e.preventDefault();
      }}
      onClick={(e) => {
        // Clicking the dimmed backdrop closes it
        if (e.target === ref.current && !pending) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-line/80 bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
    >
      {open && done && (
        <div role="status" className="px-6 pt-8 pb-7 text-center">
          <span ref={checkRef} className="fx-pop-in mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <CircleCheck className="fx-draw size-7" aria-hidden />
          </span>
          <h2 className="mt-5 text-xl font-semibold text-ink">You&apos;re logged out</h2>
          <p className="mt-1.5 text-sm text-muted">See you again soon!</p>
        </div>
      )}
      {open && !done && (
        <div className="px-6 pt-8 pb-6 text-center transition duration-200 ease-out starting:scale-95 starting:opacity-0">
          <Image src="/Logo/feasto-logo.png" alt="Feasto" width={149} height={44} className="mx-auto h-11 w-[149px] object-contain" />
          <h2 id={titleId} className="mt-7 text-xl font-semibold text-ink">
            Log out of Feasto?
          </h2>
          <p id={textId} className="mx-auto mt-2 max-w-[17rem] text-sm text-muted">
            You&apos;ll need your email and password to log back in.
          </p>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending} autoFocus>
              Cancel
            </Button>
            <Button type="button" onClick={logOut} loading={pending}>
              Log out
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
