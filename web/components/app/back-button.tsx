"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// Pages seen in this visit to Feasto. Back only uses the browser's history when the page
// before was a Feasto page; opened from a shared link, it goes to the parent page instead.
let pagesSeen = 0;
let lastPath: string | null = null;

/** Counts page changes; mounted once in the top bar, so it sees every page. */
export function useCountPages() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== lastPath) {
      pagesSeen += 1;
      lastPath = pathname;
    }
  }, [pathname]);
}

/**
 * The top bar's back arrow on every page below the main tabs. `always` skips the history,
 * for pages whose previous page no longer makes sense (an order's page after checkout).
 */
export function BackButton({ fallback, always }: { fallback: string; always?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (pagesSeen > 1 && !always ? router.back() : router.push(fallback))}
      className="-ml-2 flex size-10 items-center justify-center rounded-full text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <ArrowLeft className="size-[22px]" aria-hidden />
    </button>
  );
}
