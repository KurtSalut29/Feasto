"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";

/**
 * Feasto's toast messages: short notes that say what just happened ("Order placed", "Couldn't
 * save your store") without covering the page. They drop in at the top centre on every screen,
 * as a dark pill that stands out on Feasto's white pages. Each one leaves by itself after a few seconds
 * (the thin bar shows the time left, and stops while the pointer is on it), can be closed with
 * the ×, or swiped sideways.
 *
 *   toast.success("Order placed", "Aling Nena's got it. We'll tell you when it's accepted.")
 *   toast.error("Couldn't add to cart", result.error)
 *   toast.later(...)  // shown after a full page load, e.g. right after logging in
 */

export type ToastTone = "success" | "error" | "warning" | "info";
type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** How long it stays, in milliseconds */
  duration?: number;
  /** A link to where the thing happened, e.g. "View order" */
  action?: { label: string; href: string };
};
type ToastItem = Required<Pick<ToastInput, "title" | "tone" | "duration">> &
  Pick<ToastInput, "description" | "action"> & { id: number; leaving: boolean; key: number };

const MAX_SHOWN = 3;
const LEAVE_MS = 220;
const STORAGE_KEY = "feasto:toasts";
/** Errors stay longer, since they ask the person to do something */
const DEFAULT_MS: Record<ToastTone, number> = { success: 4000, info: 4500, warning: 6000, error: 7000 };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: ToastItem[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function dismiss(id: number) {
  if (!items.some((t) => t.id === id && !t.leaving)) return;
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, LEAVE_MS);
}

function show(input: ToastInput) {
  const tone = input.tone ?? "info";
  const same = items.find((t) => !t.leaving && t.title === input.title && t.description === input.description);
  if (same) {
    // The same message again (e.g. a double click): restart it instead of stacking a copy
    items = items.map((t) => (t === same ? { ...t, key: t.key + 1 } : t));
    emit();
    return same.id;
  }
  const id = nextId++;
  items = [{ id, key: 0, leaving: false, title: input.title, description: input.description, action: input.action, tone, duration: input.duration ?? DEFAULT_MS[tone] }, ...items];
  emit();
  // Only the newest few stay on screen
  items.filter((t) => !t.leaving).slice(MAX_SHOWN).forEach((t) => dismiss(t.id));
  return id;
}

type Extra = Omit<ToastInput, "title" | "description" | "tone">;

export const toast = {
  show,
  dismiss,
  success: (title: string, description?: string, extra?: Extra) => show({ ...extra, title, description, tone: "success" }),
  error: (title: string, description?: string, extra?: Extra) => show({ ...extra, title, description, tone: "error" }),
  warning: (title: string, description?: string, extra?: Extra) => show({ ...extra, title, description, tone: "warning" }),
  info: (title: string, description?: string, extra?: Extra) => show({ ...extra, title, description, tone: "info" }),
  /** Keeps the message for the next page load (a full reload or redirect), then shows it there. */
  later(input: ToastInput) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as ToastInput[];
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...saved, input].slice(-MAX_SHOWN)));
    } catch {
      show(input);
    }
  },
};

/** A bright icon on the dark pill says the kind at a glance; the bar below counts down in the same colour */
const TONES: Record<ToastTone, { Icon: LucideIcon; icon: string; bar: string }> = {
  success: { Icon: CircleCheck, icon: "bg-emerald-500 text-white", bar: "bg-emerald-400" },
  error: { Icon: CircleAlert, icon: "bg-red-500 text-white", bar: "bg-red-400" },
  warning: { Icon: TriangleAlert, icon: "bg-amber-400 text-ink", bar: "bg-amber-300" },
  info: { Icon: Info, icon: "bg-brand-500 text-white", bar: "bg-brand-500" },
};

/** Put once in the root layout. */
export function Toaster() {
  const list = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => EMPTY,
  );

  // Messages saved before a full page load
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as ToastInput[];
      sessionStorage.removeItem(STORAGE_KEY);
      saved.forEach(show);
    } catch {
      // Storage blocked: nothing was saved
    }
  }, []);

  return (
    <section
      aria-label="Notifications"
      aria-live="polite"
      // Top centre on every screen, just under the top bar, where the eye already is
      className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[100] mx-auto flex max-w-[440px] flex-col items-stretch gap-2 [--toast-from:-16px] print:hidden"
    >
      {list.map((t) => (
        <ToastCard key={`${t.id}-${t.key}`} toast={t} />
      ))}
    </section>
  );
}

function ToastCard({ toast: t }: { toast: ToastItem }) {
  const { Icon, icon, bar } = TONES[t.tone];
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    start.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (start.current !== null) setDragX(e.clientX - start.current);
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(dragX) > 80) dismiss(t.id);
    else setDragX(0);
  };

  return (
    // The outer grid shrinks to nothing as the toast leaves, so the others slide into place
    <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${t.leaving ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
      <div className="min-h-0">
        <div
          role={t.tone === "error" ? "alert" : "status"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={dragX ? { transform: `translateX(${dragX}px)`, opacity: Math.max(0.2, 1 - Math.abs(dragX) / 220) } : undefined}
          className={`group pointer-events-auto relative flex touch-pan-y items-start gap-3 overflow-hidden rounded-[22px] bg-ink py-3 pr-2.5 pl-3 text-white shadow-[0_22px_44px_-14px_rgba(31,45,61,0.6),0_4px_10px_rgba(31,45,61,0.18)] ring-1 ring-white/10 select-none ${
            dragging ? "" : "transition-[transform,opacity] duration-200"
          } ${t.leaving ? "animate-toast-out" : "animate-toast-in"} motion-reduce:animate-none`}
        >
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.06)] ${icon}`} aria-hidden>
            <Icon className="size-[18px]" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm leading-snug font-semibold text-white">{t.title}</p>
            {t.description && <p className="mt-0.5 text-[13px] leading-snug text-white/70">{t.description}</p>}
            {t.action && (
              <Link
                href={t.action.href}
                onClick={() => dismiss(t.id)}
                className="mt-2 inline-flex h-7 items-center rounded-full bg-white/10 px-3 text-[13px] font-semibold text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                {t.action.label}
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Close message"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <X className="size-4" aria-hidden />
          </button>
          {/* Time left; pauses while the pointer or focus is on the message */}
          <span
            aria-hidden
            onAnimationEnd={() => dismiss(t.id)}
            style={{ animationDuration: `${t.duration}ms` }}
            className={`absolute bottom-0 left-0 h-[3px] w-full origin-left animate-toast-timer opacity-90 group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused] ${bar}`}
          />
        </div>
      </div>
    </div>
  );
}
