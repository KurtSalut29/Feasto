"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";

export type LiveEvent =
  | { type: "notification"; notification: { id: string; title: string; body: string; link: string | null; createdAt: string } }
  | { type: "order.updated"; orderId: string; status: string }
  | { type: "jobs.changed" }
  | { type: "rider.location"; orderId: string; lat: number; lng: number; at: string }
  | { type: "booking.updated"; bookingId: string; status: string }
  | { type: "report.ready"; reportId: string };

type Listener = (event: LiveEvent) => void;
const LiveContext = createContext<((listener: Listener) => () => void) | null>(null);

/** Subscribe a component to live events (e.g. the rider's position on a map). */
export function useLiveEvent(listener: Listener) {
  const subscribe = use(LiveContext);
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => subscribe?.((event) => latest.current(event)), [subscribe]);
}

type Toast = { id: string; title: string; body: string; link: string | null };

/**
 * Keeps one live connection (Server-Sent Events) open for the signed-in user.
 * Whenever something changes on the server, the visible page re-fetches its data,
 * and new notifications pop up as toasts.
 */
export function LiveUpdates({ children }: { children: ReactNode }) {
  const router = useRouter();
  const listeners = useRef(new Set<Listener>());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [subscribe] = useState(() => (listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  });

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    // Several events often arrive together; refresh once for all of them
    const refreshSoon = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 250);
    };

    // EventSource reconnects by itself if the connection drops (e.g. an API copy restarts)
    const source = new EventSource("/api/me/events");
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as LiveEvent;
      listeners.current.forEach((listener) => listener(event));
      if (event.type === "rider.location") return; // too frequent to refresh the whole page
      if (event.type === "notification") {
        const { id, title, body, link } = event.notification;
        // One at a time: on a phone, stacked toasts would cover the page
        setToasts([{ id, title, body, link }]);
        setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000);
      }
      refreshSoon();
    };
    return () => {
      clearTimeout(refreshTimer);
      source.close();
    };
  }, [router]);

  return (
    <LiveContext value={subscribe}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-lg"
          >
            <span className="mt-1 size-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{toast.title}</p>
              <p className="mt-0.5 text-sm text-muted">{toast.body}</p>
              {toast.link && (
                <Link href={toast.link} className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline">
                  View
                </Link>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
              className="rounded-lg p-1 text-muted hover:bg-canvas"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </LiveContext>
  );
}
