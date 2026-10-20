"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";

/** Heart that saves a store to the resident's favorites. Changes instantly, then syncs. */
export function FavoriteButton({ storeId, storeName, isFavorite }: { storeId: string; storeName: string; isFavorite: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(isFavorite);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !saved;
    setSaved(next);
    setBusy(true);
    const result = await apiRequest(`/stores/${storeId}/favorite`, { method: next ? "PUT" : "DELETE" });
    setBusy(false);
    if (!result.ok) setSaved(!next);
    else router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${storeName} from favorites` : `Save ${storeName} to favorites`}
      className="flex size-10 items-center justify-center rounded-full bg-white/95 shadow-sm backdrop-blur transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-brand-500 active:scale-95"
    >
      <Heart
        className={`size-5 transition ${saved ? "fill-brand-600 text-brand-600" : "text-ink"}`}
        strokeWidth={saved ? 2 : 1.75}
        aria-hidden
      />
    </button>
  );
}
