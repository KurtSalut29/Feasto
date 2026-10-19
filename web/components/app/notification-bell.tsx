"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { timeAgo } from "@/lib/format";
import { useLiveEvent } from "./live-updates";

type Notification = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

/**
 * Bell with an unread count; opens a panel with recent notifications.
 * "icon" sits inside a top bar; "floating" is a round white button on the page background.
 */
export function NotificationBell({ variant = "icon" }: { variant?: "icon" | "floating" }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ notifications: Notification[]; unread: number }>({ notifications: [], unread: 0 });
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

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) {
      await apiRequest("/me/notifications/read-all", { method: "POST" });
      setData((d) => ({ ...d, unread: 0 }));
    }
  }

  const label = data.unread ? `Notifications, ${data.unread} unread` : "Notifications";

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={toggle}
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
            className={`absolute flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-4 text-white ${
              variant === "floating" ? "-top-0.5 -right-0.5 ring-2 ring-white" : "top-1.5 right-1.5"
            }`}
          >
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className={`absolute right-0 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-white shadow-xl ${
            variant === "floating" ? "top-14" : "top-12"
          }`}
        >
          <p className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Notifications</p>
          {data.notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {data.notifications.map((n) => {
                const content = (
                  <>
                    <p className="text-sm font-semibold text-ink">{n.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                    <p className="mt-1 text-xs text-gray-400">{timeAgo(n.createdAt)}</p>
                  </>
                );
                return (
                  <li key={n.id} className={n.readAt ? "" : "bg-brand-50/50"}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-canvas">
                        {content}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
