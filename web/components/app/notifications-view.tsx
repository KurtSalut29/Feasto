import type { LucideIcon } from "lucide-react";
import { NotificationFeed } from "@/components/app/notification-feed";
import { PushCard } from "@/components/app/push-card";

export type NotificationTopic = { Icon: LucideIcon; title: string; text: string };

/**
 * The notifications page for every role, across the whole screen: the feed in the main column, and
 * beside it the phone-alerts switch and what this role is told about. On phones the switch comes
 * first and the list of topics is left out.
 */
export function NotificationsView({
  emptyText,
  emptyAction,
  topics,
}: {
  emptyText: string;
  emptyAction?: { href: string; label: string };
  topics: NotificationTopic[];
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <aside aria-label="About notifications" className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
        <PushCard place="settings" />
        <section aria-labelledby="notify-topics" className="hidden rounded-3xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:block">
          <h2 id="notify-topics" className="text-sm font-semibold text-ink">
            What you&apos;re told about
          </h2>
          <ul className="mt-3.5 space-y-3.5">
            {topics.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100" aria-hidden>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 text-sm">
                  <span className="block font-medium text-ink">{title}</span>
                  <span className="block text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <NotificationFeed emptyText={emptyText} emptyAction={emptyAction} />
      </div>
    </div>
  );
}
