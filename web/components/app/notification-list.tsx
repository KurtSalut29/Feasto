import {
  Bell,
  Bike,
  CalendarDays,
  CircleAlert,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
  Star,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { manilaDate, timeAgo } from "@/lib/format";

export type AppNotification = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

/** Tells every bell on the page that the notifications were just read somewhere else. */
export const NOTIFICATIONS_READ = "feasto:notifications-read";

type Kind = { Icon: LucideIcon; tone: string };

const PROBLEM: Kind = { Icon: CircleAlert, tone: "bg-red-50 text-red-600" };

/** What a notification is about, from its words and link, so it gets a fitting icon and color. */
export function kindOf({ title, link }: Pick<AppNotification, "title" | "link">): Kind {
  const t = title.toLowerCase();
  if (/payment received|paid/.test(t)) return { Icon: Wallet, tone: "bg-emerald-50 text-emerald-600" };
  if (/failed|couldn't|cancel|declin|expired|rejected|no longer|suspended|given to another/.test(t)) return PROBLEM;
  if (/attention|renew|permit|license/.test(t)) return { Icon: TriangleAlert, tone: "bg-amber-50 text-amber-600" };
  if (/deliver|enjoy|collected/.test(t)) return { Icon: PackageCheck, tone: "bg-emerald-50 text-emerald-600" };
  if (/rider|ride for|on the way|delivery job/.test(t)) return { Icon: Bike, tone: "bg-brand-50 text-brand-600" };
  if (/ready/.test(t)) return { Icon: ShoppingBag, tone: "bg-brand-50 text-brand-600" };
  if (/table|booking/.test(t) || link?.includes("booking") || link?.includes("reservation")) return { Icon: CalendarDays, tone: "bg-sky-50 text-sky-600" };
  if (/rating|star/.test(t)) return { Icon: Star, tone: "bg-amber-50 text-amber-600" };
  if (/order|preparing|accepted/.test(t) || link?.includes("order")) return { Icon: ReceiptText, tone: "bg-brand-50 text-brand-600" };
  return { Icon: Bell, tone: "bg-canvas text-muted" };
}

const manilaDay = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10);

/** Today, Yesterday and Earlier, newest first; empty groups are left out. */
export function groupByDay(list: AppNotification[]) {
  const today = manilaDate(0);
  const yesterday = manilaDate(-1);
  const groups: { label: string; items: AppNotification[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];
  for (const n of list) {
    const day = manilaDay(n.createdAt);
    groups[day === today ? 0 : day === yesterday ? 1 : 2].items.push(n);
  }
  return groups.filter((g) => g.items.length > 0);
}

/** One notification: its icon, what happened, when, and a dot while it's new. */
export function NotificationItem({ notification: n, onOpen }: { notification: AppNotification; onOpen?: () => void }) {
  const { Icon, tone } = kindOf(n);
  const unread = !n.readAt;
  const content = (
    <>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone}`} aria-hidden>
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-snug text-ink ${unread ? "font-semibold" : "font-medium"}`}>{n.title}</span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">{n.body}</span>
        <span className="mt-1 block text-xs text-gray-500">{timeAgo(n.createdAt)}</span>
      </span>
      {unread && (
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-600">
          <span className="sr-only">New</span>
        </span>
      )}
    </>
  );
  const box = `flex items-start gap-3 px-4 py-3 ${unread ? "bg-brand-50/60" : ""}`;
  return (
    <li>
      {n.link ? (
        <Link href={n.link} onClick={onOpen} className={`${box} transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500`}>
          {content}
        </Link>
      ) : (
        <div className={box}>{content}</div>
      )}
    </li>
  );
}
