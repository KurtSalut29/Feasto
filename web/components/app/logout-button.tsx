"use client";

import { LogOut } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";

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
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white text-[15px] font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-brand-500"
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

/** Pop-up with the Feasto logo asking "Log out of Feasto?". */
function LogoutConfirm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
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
    await apiRequest("/auth/logout", { method: "POST" });
    // Full page load so no signed-in pages stay alive in the background after logout
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
      {open && (
        <div className="px-6 pt-8 pb-6 text-center transition duration-200 ease-out starting:scale-95 starting:opacity-0">
          <Image src="/Logo/feasto-logo.png" alt="Feasto" width={149} height={44} className="mx-auto h-11 w-auto" />
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
