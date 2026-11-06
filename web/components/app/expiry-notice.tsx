import { ArrowRight, CalendarClock, CircleAlert } from "lucide-react";
import Link from "next/link";
import { daysLeft, formatDate, isExpired } from "@/lib/format";

const WARN_DAYS = 30;

/** Warns a store or rider that their document is expiring, with the way to renew it. Nothing when it's fine. */
export function ExpiryNotice({ date, documentName, href, blocked }: { date: string | null | undefined; documentName: string; href: string; blocked: string }) {
  if (!date) return null;
  const expired = isExpired(date);
  const left = daysLeft(date);
  if (!expired && left > WARN_DAYS) return null;
  const Icon = expired ? CircleAlert : CalendarClock;

  return (
    <Link
      href={href}
      className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
        expired ? "border-red-200 bg-red-50 text-red-900 hover:bg-red-100/70" : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100/70"
      }`}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">
          {expired ? `Your ${documentName} expired on ${formatDate(date)}` : `Your ${documentName} expires ${left === 0 ? "today" : `in ${left} ${left === 1 ? "day" : "days"}`}`}
        </span>
        <span className="block">{expired ? blocked : "Send the renewed one so nothing stops."}</span>
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}
