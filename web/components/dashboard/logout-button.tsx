"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function logOut() {
    setPending(true);
    await apiRequest("/auth/logout", { method: "POST" });
    // Full page load so no signed-in pages stay alive in the background after logout
    window.location.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={logOut}
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-medium text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden />
      <span className="hidden sm:inline">{pending ? "Logging out…" : "Log out"}</span>
    </button>
  );
}
