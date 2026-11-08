"use client";

import { BellOff, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLiveEvent } from "@/components/app/live-updates";
import { groupByDay, NOTIFICATIONS_READ, NotificationItem, type AppNotification } from "@/components/app/notification-list";
import { ButtonLink } from "@/components/ui/button";
import { apiRequest } from "@/lib/browser-api";

type Feed = { notifications: AppNotification[]; unread: number };

/**
 * Every recent notification, grouped by day. New ones stay highlighted while the page is open,
 * and count as read on the server as soon as they've been shown.
 */
export function NotificationFeed({ emptyText, emptyAction }: { emptyText: string; emptyAction?: { href: string; label: string } }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const result = await apiRequest<Feed>("/me/notifications?limit=100");
    if (!result.ok) return setFailed(true);
    setFeed(result.data);
    if (result.data.unread > 0) {
      await apiRequest("/me/notifications/read-all", { method: "POST" });
      window.dispatchEvent(new Event(NOTIFICATIONS_READ));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first fetch once mounted; live events bring the rest
    void load();
  }, [load]);

  useLiveEvent((event) => {
    if (event.type === "notification") void load();
  });

  function markAllRead() {
    setFeed((f) => f && { unread: 0, notifications: f.notifications.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) });
  }

  if (failed) return <p className="py-8 text-center text-sm text-muted">Notifications couldn&apos;t load. Check your connection and refresh.</p>;
  if (!feed) {
    return (
      <div aria-busy="true" className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="size-10 animate-pulse rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (feed.notifications.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-canvas text-muted">
          <BellOff className="size-7" aria-hidden />
        </span>
        <p className="mt-4 font-semibold text-ink">You&apos;re all caught up</p>
        <p className="mt-1 max-w-xs text-sm text-muted">{emptyText}</p>
        {emptyAction && (
          <div className="mt-5">
            <ButtonLink href={emptyAction.href}>{emptyAction.label}</ButtonLink>
          </div>
        )}
      </div>
    );
  }

  const fresh = feed.notifications.filter((n) => !n.readAt).length;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          {fresh ? `${fresh} new` : "No new notifications"}
        </p>
        {fresh > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <CheckCheck className="size-4" aria-hidden />
            Mark all as read
          </button>
        )}
      </div>
      <div className="space-y-5">
        {groupByDay(feed.notifications).map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h2 className="mb-2 text-sm font-semibold tracking-wider text-gray-400 uppercase">{group.label}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {group.items.map((n) => (
                <NotificationItem key={n.id} notification={n} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
