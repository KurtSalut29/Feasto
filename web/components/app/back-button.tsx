"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Where Back goes. The browser's own history is a poor guide: switching a category, searching or
 * jumping to "Hours & map" all add entries, so its Back can land on the same page, and
 * Store → Cart → "Add more" → Store would bounce between the two forever. So Feasto keeps its own
 * trail of the pages (paths) behind each history entry, and Back goes to the page before the
 * first time you reached this one since the last main tab, by moving that many steps back in
 * the browser's history (so the page comes back as you left it). With no such page (a link opened from a message, or after
 * a reload), Back opens the page above this one instead.
 */
type Trail = { paths: string[]; index: number };

const KEY = "feasto:trail";
const MARK = "__feastoStep";
let trail: Trail | null = null;

function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    // Private mode or storage off: the trail just won't survive a reload
  }
}

const pathOf = (url: string | URL | null | undefined) => (url ? new URL(String(url), location.href).pathname : location.pathname);

/** The step of the entry the browser is on now. Read from the entry itself, because Next.js may
 * replace it while handling Back/Forward, before our own popstate listener has run. */
function currentStep() {
  const step = (history.state as Record<string, unknown> | null)?.[MARK];
  return typeof step === "number" && trail && step < trail.paths.length ? step : trail!.index;
}

/** Starts following history once per page load: every push, replace and back/forward. */
function follow() {
  if (trail) return;
  const step = (history.state as Record<string, unknown> | null)?.[MARK];
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Trail | null;
    // After a reload the entry still carries its step, so the saved trail still lines up
    if (saved && typeof step === "number" && saved.paths[step] === location.pathname) trail = { paths: saved.paths, index: step };
  } catch {
    // Unreadable: start over
  }
  trail ??= { paths: [location.pathname], index: 0 };

  const push = history.pushState;
  const replace = history.replaceState;
  history.pushState = function (state, unused, url) {
    const t = trail!;
    t.index = currentStep();
    t.paths = [...t.paths.slice(0, t.index + 1), pathOf(url)];
    t.index = t.paths.length - 1;
    save();
    return push.call(this, { ...(state ?? {}), [MARK]: t.index }, unused, url);
  };
  history.replaceState = function (state, unused, url) {
    const t = trail!;
    t.index = currentStep();
    t.paths[t.index] = pathOf(url);
    save();
    return replace.call(this, { ...(state ?? {}), [MARK]: t.index }, unused, url);
  };
  addEventListener("popstate", () => {
    if (!trail) return;
    trail.index = currentStep();
    save();
  });
  // Mark the entry we started on
  history.replaceState(history.state, "");
}

/** Mounted once in the top bar, so the trail starts on the first page. */
export function useCountPages() {
  const pathname = usePathname();
  useEffect(() => {
    follow();
  }, [pathname]);
}

/**
 * How many steps back the browser should go, or null when there's no Feasto page to return to.
 * `isMain` tells the main tab pages, where an earlier visit stops counting: Store → Cart →
 * Add more → Store goes back to before the first Store, but Store → Home → Store goes back Home.
 * `skip` names pages that no longer make sense to return to (the emptied cart after an order).
 */
export function stepsBack(isMain: (path: string) => boolean, skip: (path: string) => boolean = () => false) {
  if (!trail) return null;
  const index = currentStep();
  const { paths } = trail;
  const here = paths[index];
  let first = index;
  for (let i = index - 1; i >= 0; i--) {
    if (paths[i] === here) first = i;
    else if (isMain(paths[i])) break;
  }
  let target = first - 1;
  while (target >= 0 && paths[target] === here) target--;
  if (target < 0 || skip(paths[target])) return null;
  return index - target;
}

/** The top bar's back arrow on every page below the main tabs. */
export function BackButton({ fallback, isMain, skip }: { fallback: string; isMain: (path: string) => boolean; skip?: (path: string) => boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => {
        const steps = stepsBack(isMain, skip);
        if (steps) history.go(-steps);
        else router.push(fallback);
      }}
      className="-ml-2 flex size-10 items-center justify-center rounded-full text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <ArrowLeft className="size-[22px]" aria-hidden />
    </button>
  );
}
