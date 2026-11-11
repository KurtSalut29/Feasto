"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { toast, type ToastTone } from "@/components/ui/toast";
import { isChatOpen } from "@/lib/chat-open";
import { resyncPush } from "@/lib/push";

export type LiveEvent =
  | { type: "notification"; notification: { id: string; title: string; body: string; link: string | null; createdAt: string } }
  | { type: "order.updated"; orderId: string; status: string }
  | { type: "jobs.changed" }
  | { type: "rider.location"; orderId: string; lat: number; lng: number; at: string }
  | { type: "booking.updated"; bookingId: string; status: string }
  | { type: "report.ready"; reportId: string }
  | {
      type: "chat.message";
      orderId: string;
      code: string;
      /** Where this person opens the order's chat */
      link: string;
      message: ChatMessage;
    }
  | { type: "session.ended" };

export type ChatMessage = { id: string; body: string; part: "RESIDENT" | "VENDOR" | "RIDER"; name: string; mine: boolean; createdAt: string };

const PART_LABEL = { RESIDENT: "Customer", VENDOR: "Store", RIDER: "Rider" } as const;

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
 * Keeps one live connection (Server-Sent Events, or long polling where streams can't pass) open for the signed-in user.
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

  // Notifications on this phone follow whoever is signed in now
  useEffect(() => {
    void resyncPush().catch(() => {});
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    // Several events often arrive together; refresh once for all of them
    const refreshSoon = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 250);
    };

    let stopped = false;
    let source: EventSource | undefined;
    let poll: AbortController | undefined;
    const stop = () => {
      stopped = true;
      source?.close();
      poll?.abort();
    };

    const handle = (event: LiveEvent) => {
      listeners.current.forEach((listener) => listener(event));
      if (event.type === "session.ended") {
        // An admin disabled this account: leave right away
        stop();
        window.location.replace("/logout?reason=disabled");
        return;
      }
      if (event.type === "rider.location") return; // too frequent to refresh the whole page
      if (event.type === "chat.message") {
        // The open chat shows it by itself; anywhere else it pops up with a way to answer
        if (!isChatOpen(event.orderId)) {
          const { name, part, body } = event.message;
          toast.show({
            tone: "info",
            title: `${name} · ${PART_LABEL[part]}`,
            description: body.length > 120 ? `${body.slice(0, 117)}…` : body,
            action: { label: "Reply", href: `${event.link}${event.link.includes("?") ? "&" : "?"}chat=${event.orderId}` },
            duration: 7000,
          });
        }
        return; // a message doesn't change the page around it
      }
      if (event.type === "notification") {
        const { title, body, link } = event.notification;
        toast.show({ tone: toneOf(title), title, description: body, action: link ? { label: "View", href: link } : undefined, duration: 6000 });
      }
      refreshSoon();
    };

    // Asks the server again and again; each answer waits until something happens (or 20 s pass)
    const startPolling = async () => {
      source?.close();
      source = undefined;
      while (!stopped) {
        poll = new AbortController();
        try {
          const response = await fetch("/api/me/events/poll", { signal: poll.signal, cache: "no-store" });
          if (response.status === 401) return; // signed out
          if (!response.ok) throw new Error(String(response.status));
          const { events } = (await response.json()) as { events: LiveEvent[] };
          events.forEach(handle);
        } catch {
          if (stopped) return;
          await new Promise((resolve) => setTimeout(resolve, 3000)); // the server is restarting
        }
      }
    };

    // A Cloudflare quick tunnel holds streamed answers back, so live updates there use polling
    let streamCheck: ReturnType<typeof setTimeout> | undefined;
    if (window.location.hostname.endsWith(".trycloudflare.com")) {
      void startPolling();
    } else {
      // EventSource reconnects by itself if the connection drops (e.g. an API copy restarts)
      source = new EventSource("/api/me/events");
      let connected = false;
      source.onmessage = (message) => {
        const event = JSON.parse(message.data) as LiveEvent | { type: "connected" };
        if (event.type === "connected") {
          connected = true;
          return;
        }
        handle(event);
      };
      // Something between here and the server never lets the stream through: poll instead
      streamCheck = setTimeout(() => {
        if (!connected && !stopped) void startPolling();
      }, 10_000);
    }

    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(streamCheck);
      stop();
    };
  }, [router]);

  return (
    <LiveContext value={subscribe}>
      {children}
    </LiveContext>
  );
}
