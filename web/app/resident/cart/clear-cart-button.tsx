"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/browser-api";

export function ClearCartButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await apiRequest("/cart", { method: "DELETE" });
        setBusy(false);
        router.refresh();
      }}
      className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:bg-canvas hover:text-red-600"
    >
      Clear
    </button>
  );
}
