"use client";

import { Share, Smartphone, SquarePlus, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { Row, RowGroup } from "@/components/app/profile-parts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * Installing Feasto as a phone app (a PWA). Android Chrome fires "beforeinstallprompt" when the
 * app can be installed; we keep that event and show our own Install button instead of the
 * browser's small bar. iPhones have no such event, so there we explain Share → Add to Home Screen.
 */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type InstallState = "installed" | "prompt" | "ios" | "unavailable";

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Listen from the moment this file loads: the event can fire before any button is on screen
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    changed();
  });
}

function installState(): InstallState {
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  if (deferredPrompt) return "prompt";
  // iPadOS reports itself as a Mac, so also check for a touch screen
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "unavailable";
}

const useInstallState = () => useSyncExternalStore(subscribe, installState, () => "unavailable" as InstallState);

/** Registers the service worker (public/sw.js) once per page load. Rendered in the root layout. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Phones only allow it over HTTPS (or localhost); elsewhere the site still works as a normal website
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

/** Opens the install prompt, or the iPhone instructions. */
function useInstall() {
  const state = useInstallState();
  // Which iPhone browser's steps are open; read from the browser only when the button is tapped
  const [steps, setSteps] = useState<IosBrowser | null>(null);

  async function install() {
    if (state === "ios") return setSteps(iosBrowser());
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null; // a prompt can only be used once
    changed();
  }

  return { state, install, steps: <IosSteps browser={steps} onClose={() => setSteps(null)} /> };
}

const DISMISSED_KEY = "feasto:install-banner-dismissed";
const dismissedListeners = new Set<() => void>();
function bannerDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A slim card at the top of the resident and rider pages until the app is installed or the card is
 * closed. Not on the Account tab, which has its own install row, nor over the full map.
 * Reading the URL happens inside <Suspense> so pages with an id in the URL can still prerender.
 */
export function InstallBanner() {
  return (
    <Suspense fallback={null}>
      <InstallBannerOutsideAccount />
    </Suspense>
  );
}

function InstallBannerOutsideAccount() {
  const path = usePathname();
  return path.endsWith("/account") || path.endsWith("/map") ? null : <InstallCard />;
}

function InstallCard() {
  const { state, install, steps } = useInstall();
  const dismissed = useSyncExternalStore(
    (listener) => {
      dismissedListeners.add(listener);
      return () => {
        dismissedListeners.delete(listener);
      };
    },
    bannerDismissed,
    () => true,
  );

  if (dismissed || (state !== "prompt" && state !== "ios")) return steps;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode: the banner simply comes back next time
    }
    dismissedListeners.forEach((listener) => listener());
  }

  return (
    <>
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-3">
        <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Get the Feasto app</p>
          <p className="text-xs text-muted">Opens full screen from your home screen.</p>
        </div>
        <Button className="h-9 shrink-0 px-4 text-sm" onClick={install}>
          Install
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {steps}
    </>
  );
}

/** "Install the Feasto app" row for the Account tab. Always there while the app can be installed. */
export function InstallAppRow() {
  const { state, install, steps } = useInstall();
  if (state !== "prompt" && state !== "ios") return steps;
  return (
    <>
      <RowGroup title="App">
        <Row Icon={Smartphone} label="Install the Feasto app" value="Home screen" onClick={install} />
      </RowGroup>
      {steps}
    </>
  );
}

type IosBrowser = "safari" | "chrome" | "other";

/** Chrome, Edge and Firefox on iPhone name themselves in the user agent; Safari doesn't. */
function iosBrowser(): IosBrowser {
  const agent = navigator.userAgent;
  if (/CriOS/.test(agent)) return "chrome";
  if (/FxiOS|EdgiOS|OPiOS/.test(agent)) return "other";
  return "safari";
}

const SHARE_STEP: Record<IosBrowser, string> = {
  safari: "in Safari's toolbar. On newer iPhones, tap ⋯ first.",
  chrome: "at the right of the address bar.",
  other: "in your browser's menu.",
};

/** iPhones can't show an install prompt, so we show the taps for the browser in use instead. */
function IosSteps({ browser, onClose }: { browser: IosBrowser | null; onClose: () => void }) {
  return (
    <Dialog open={browser !== null} onClose={onClose} title="Add Feasto to your home screen" description="It takes three taps.">
      <ol className="space-y-3 text-[15px] text-ink">
        <li className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-brand-600">
            <Share className="size-[18px]" aria-hidden />
          </span>
          <span>
            Tap <b>Share</b> {SHARE_STEP[browser ?? "safari"]}
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-brand-600">
            <SquarePlus className="size-[18px]" aria-hidden />
          </span>
          <span>
            Scroll down and choose <b>Add to Home Screen</b>.
          </span>
        </li>
        <li className="flex items-center gap-3">
          <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-xl" />
          <span>
            Keep <b>Open as Web App</b> on if you see it, then tap <b>Add</b>.
          </span>
        </li>
      </ol>
      <Button className="mt-5 w-full" onClick={onClose}>
        Got it
      </Button>
    </Dialog>
  );
}
