"use client";

import { Bell, BellOff, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/browser-api";
import { useLiveEvent } from "./live-updates";
import { groupByDay, NOTIFICATIONS_READ, NotificationItem, type AppNotification } from "./notification-list";

/** How many the panel shows; the full page has the rest */
const IN_PANEL = 8;

/**
 * Bell with an unread count; opens a panel with the latest notifications.
 * "icon" sits inside a top bar; "floating" is a round white button on the page background.
 * With `allHref`, the panel links to a page with every notification.
 */
export function NotificationBell({ variant = "icon", allHref }: { variant?: "icon" | "floating"; allHref?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ notifications: AppNotification[]; unread: number }>({ notifications: [], unread: 0 });
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const result = await apiRequest<typeof data>("/me/notifications");
    if (result.ok) setData(result.data);
  }, []);

  useEffect(() => {
    // Initial fetch once mounted; later updates arrive through live events
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useLiveEvent((event) => {
    if (event.type === "notification") void load();
  });

  // The notifications page read them all: clear the count here too
  useEffect(() => {
    const onRead = () => setData((d) => ({ ...d, unread: 0 }));
    window.addEventListener(NOTIFICATIONS_READ, onRead);
    return () => window.removeEventListener(NOTIFICATIONS_READ, onRead);
  }, []);

  // Close when clicking outside, or with Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) {
      await apiRequest("/me/notifications/read-all", { method: "POST" });
      setData((d) => ({ ...d, unread: 0 }));
    }
  }

  // Close the panel and mark what was shown as read, so the next opening shows only what's new
  const close = () => {
    setOpen(false);
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) }));
  };

  const label = data.unread ? `Notifications, ${data.unread} unread` : "Notifications";
  const shown = data.notifications.slice(0, IN_PANEL);
  const fresh = data.notifications.filter((n) => !n.readAt).length;

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => (open ? close() : void toggle())}
        aria-label={label}
        aria-expanded={open}
        className={`relative flex items-center justify-center rounded-full text-ink transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
          variant === "floating"
            ? "size-11 border border-line/80 bg-white shadow-[0_8px_24px_-14px_rgba(31,45,61,0.35)] hover:text-brand-600"
            : "size-10 hover:bg-canvas"
        }`}
      >
        <Bell className="size-[22px]" aria-hidden />
        {data.unread > 0 && (
          <span
            className={`absolute flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[0.625rem] leading-4 font-bold text-white ${
              variant === "floating" ? "-top-0.5 -right-0.5 ring-2 ring-white" : "top-1.5 right-1.5"
            }`}
          >
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          // On a phone the panel spans the screen under the top bar; on wider screens it hangs from the bell
          className={`fixed inset-x-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-50 overflow-hidden rounded-2xl border border-line bg-white shadow-xl transition-transform duration-150 ease-out starting:-translate-y-1 sm:absolute sm:inset-x-auto sm:right-0 sm:w-[22rem] ${
            variant === "floating" ? "sm:top-14" : "sm:top-12"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {fresh > 0 && <p className="text-xs font-medium text-brand-700">{fresh} new</p>}
          </div>
          {shown.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <BellOff className="size-6 text-gray-300" aria-hidden />
              <p className="mt-2 text-sm font-medium text-ink">You&apos;re all caught up</p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">Order updates and booking news show up here.</p>
            </div>
          ) : (
            <div className="max-h-[26rem] overflow-y-auto">
              {groupByDay(shown).map((group) => (
                <section key={group.label}>
                  <h3 className="bg-canvas/70 px-4 py-1.5 text-[0.6875rem] font-semibold tracking-wider text-gray-500 uppercase">{group.label}</h3>
                  <ul className="divide-y divide-line">
                    {group.items.map((n) => (
                      <NotificationItem key={n.id} notification={n} onOpen={close} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {allHref && shown.length > 0 && (
            <Link
              href={allHref}
              onClick={close}
              className="flex items-center justify-center gap-1 border-t border-line px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-canvas"
            >
              See all notifications
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
