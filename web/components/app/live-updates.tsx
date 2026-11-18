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
  | { type: "session.ended" }
  /** A store or the admin saved something others may be looking at */
  | { type: "data.changed"; by: "VENDOR" | "ADMIN" };

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

/** Sent on the window whenever the page's data is loaded again, for parts that fetch their own (useApiData) */
export const REFRESH_EVENT = "feasto:refresh";

/** The page's data is reloaded at least this often while it's on screen, in case an update was missed */
const BACKGROUND_REFRESH_MS = 60_000;

/** True while the person is typing in a field: a reload then waits until they're done */
function typing() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|range|color|file)$/.test((el as HTMLInputElement).type);
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
 *
 * The page also keeps itself fresh with nothing to press and nothing shown: when a store or the
 * admin saves a change, when the person comes back to the tab or the phone reconnects, and once a
 * minute while it's on screen. Reloading keeps what's typed, opened or scrolled, and waits while
 * someone is typing.
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
    let lastRefresh = Date.now();
    /** Something changed while the tab was hidden: reload when it's back */
    let stale = false;
    const refreshNow = () => {
      if (document.visibilityState === "hidden") {
        stale = true;
        return;
      }
      if (typing()) {
        refreshTimer = setTimeout(refreshNow, 3000);
        return;
      }
      stale = false;
      lastRefresh = Date.now();
      router.refresh();
      window.dispatchEvent(new Event(REFRESH_EVENT));
    };
    // Several events often arrive together; refresh once for all of them
    const refreshSoon = (delay = 250) => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshNow, delay);
    };
    // Coming back to the tab, the app, or the internet: catch up if anything may have been missed
    const catchUp = () => {
      if (document.visibilityState === "visible" && (stale || Date.now() - lastRefresh > 15_000)) refreshSoon();
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("focus", catchUp);
    window.addEventListener("online", catchUp);
    const background = setInterval(() => {
      if (Date.now() - lastRefresh >= BACKGROUND_REFRESH_MS - 1000) refreshNow();
    }, BACKGROUND_REFRESH_MS);

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
      if (event.type === "data.changed") {
        // Every open page hears this at once: spread the reloads over a moment so they don't all land together
        refreshSoon(300 + Math.random() * 1700);
        return;
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
          // Connected again after a drop (an API copy restarted, the WiFi blinked): load what was missed
          if (connected) refreshSoon();
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
      clearInterval(background);
      document.removeEventListener("visibilitychange", catchUp);
      window.removeEventListener("focus", catchUp);
      window.removeEventListener("online", catchUp);
      stop();
    };
  }, [router]);

  return (
    <LiveContext value={subscribe}>
      {children}
    </LiveContext>
  );
}
