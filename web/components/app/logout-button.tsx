"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";

/** "icon" for the dashboard sidebar, "row" for the mobile Account tab. */
export function LogoutButton({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const [pending, setPending] = useState(false);

  async function logOut() {
    setPending(true);
    await apiRequest("/auth/logout", { method: "POST" });
    // Full page load so no signed-in pages stay alive in the background after logout
    window.location.replace("/login");
  }

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={logOut}
        disabled={pending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white text-[15px] font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60"
      >
        <LogOut className="size-5" aria-hidden />
        {pending ? "Logging out…" : "Log out"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={logOut}
      disabled={pending}
      aria-label="Log out"
      title="Log out"
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60"
    >
      <LogOut className="size-[18px]" aria-hidden />
    </button>
  );
}
