"use client";

import { BellOff, BellRing, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { type PushState, pushState, turnOffPush, turnOnPush } from "@/lib/push";

/** Where the card shows, which decides what it says */
type Place = "settings" | "order" | "jobs" | "orders";

const PROMPT: Record<Exclude<Place, "settings">, { title: string; text: string }> = {
  order: { title: "Know when it's on the way", text: "Get updates and messages from the store and your rider on this phone, even with Feasto closed." },
  jobs: { title: "Don't miss a job", text: "Get new delivery jobs and messages on this phone, even with Feasto closed." },
  orders: { title: "Hear about every new order", text: "Get new orders and messages on this device, even with Feasto closed." },
};

const dismissedKey = (place: Place) => `feasto:push-prompt:${place}`;

/**
 * Turns on notifications that reach this phone while Feasto is closed. On the Notifications page
 * it's the setting (on, off, blocked); on an order, the jobs list or the store's orders it's a
 * one-time prompt that leaves once they're on or the person says "Not now".
 */
export function PushCard({ place, className = "" }: { place: Place; className?: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void pushState().then((s) => {
      if (cancelled) return;
      setState(s);
      try {
        if (place !== "settings" && localStorage.getItem(dismissedKey(place))) setHidden(true);
      } catch {
        // No storage: the prompt simply shows
      }
    });
    return () => {
      cancelled = true;
    };
  }, [place]);

  async function turnOn() {
    setBusy(true);
    try {
      const next = await turnOnPush();
      setState(next);
      if (next === "on") toast.success("Notifications are on", "Feasto will tell you on this device, even when it's closed.");
      if (next === "blocked") toast.error("Notifications are blocked", "Allow them for Feasto in your browser's site settings.");
    } catch (e) {
      toast.error("Couldn't turn them on", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    await turnOffPush().catch(() => {});
    setState("off");
    setBusy(false);
  }

  function notNow() {
    setHidden(true);
    try {
      localStorage.setItem(dismissedKey(place), "1");
    } catch {
      // Hidden for this visit
    }
  }

  if (!state || state === "unsupported" || hidden) return null;
  const prompt = place !== "settings";
  // A prompt is only for someone who could turn them on now (or on an iPhone, after installing)
  if (prompt && state !== "off" && state !== "install-first") return null;

  const title = prompt ? PROMPT[place].title : "Notifications on this device";
  const text =
    state === "install-first"
      ? "On iPhone, first add Feasto to your Home Screen: tap Share, then “Add to Home Screen”. Open Feasto from there to turn these on."
      : state === "blocked"
        ? "Notifications are blocked for Feasto. Allow them in your browser's site settings, then come back."
        : state === "on"
          ? "On. Order updates, new jobs and messages reach this device even when Feasto is closed."
          : prompt
            ? PROMPT[place].text
            : "Get order updates, new jobs and messages on this device, even when Feasto is closed.";
  const Icon = state === "blocked" ? BellOff : state === "install-first" ? Share : BellRing;

  return (
    <section
      aria-label={title}
      className={`relative flex items-start gap-3 rounded-2xl px-4 py-3.5 ${prompt ? "bg-brand-50 ring-1 ring-brand-100" : "border border-line bg-white"} ${className}`}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${state === "on" ? "bg-emerald-50 text-emerald-600" : "bg-white text-brand-600 ring-1 ring-brand-100"}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{text}</p>
        {(state === "off" || state === "on") && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {state === "off" ? (
              <button
                type="button"
                onClick={turnOn}
                disabled={busy}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60 motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <BellRing className="size-4" aria-hidden />
                {busy ? "Turning on…" : "Turn on notifications"}
              </button>
            ) : (
              <button
                type="button"
                onClick={turnOff}
                disabled={busy}
                className="inline-flex h-9 items-center rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-canvas disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                Turn off on this device
              </button>
            )}
          </div>
        )}
      </div>
      {prompt && (
        <button
          type="button"
          onClick={notNow}
          aria-label="Not now"
          title="Not now"
          className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </section>
  );
}
