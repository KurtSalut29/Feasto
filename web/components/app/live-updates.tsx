"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { toast, type ToastTone } from "@/components/ui/toast";

export type LiveEvent =
  | { type: "notification"; notification: { id: string; title: string; body: string; link: string | null; createdAt: string } }
  | { type: "order.updated"; orderId: string; status: string }
  | { type: "jobs.changed" }
  | { type: "rider.location"; orderId: string; lat: number; lng: number; at: string }
  | { type: "booking.updated"; bookingId: string; status: string }
  | { type: "report.ready"; reportId: string }
  | { type: "session.ended" };

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

/** Green for good news, red for something that went wrong, orange for everything else */
function toneOf(title: string): ToastTone {
  if (/fail|reject|declin|cancel|expired|suspend|disabled|no-show|couldn/i.test(title)) return "error";
  if (/remind|expir|soon|waiting|stuck/i.test(title)) return "warning";
  if (/accept|approv|ready|deliver|received|paid|picked up|confirmed|welcome/i.test(title)) return "success";
  return "info";
}

/**
 * Keeps one live connection (Server-Sent Events) open for the signed-in user.
 * Whenever something changes on the server, the visible page re-fetches its data,
 * and new notifications pop up as Feasto toast messages.
 */
export function LiveUpdates({ children }: { children: ReactNode }) {
  const router = useRouter();
  const listeners = useRef(new Set<Listener>());
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
      if (event.type === "session.ended") {
        // An admin disabled this account: leave right away
        source.close();
        window.location.replace("/logout?reason=disabled");
        return;
      }
      if (event.type === "rider.location") return; // too frequent to refresh the whole page
      if (event.type === "notification") {
        const { title, body, link } = event.notification;
        toast.show({ tone: toneOf(title), title, description: body, action: link ? { label: "View", href: link } : undefined, duration: 6000 });
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
    </LiveContext>
  );
}
