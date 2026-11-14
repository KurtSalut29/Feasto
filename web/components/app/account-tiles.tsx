import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

/** Something happening right now (an order on its way, a delivery), with a link to follow it. */
export function NowCard({ href, Icon, title, text }: { href: string; Icon: LucideIcon; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs font-medium text-brand-700">{text}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-brand-700" aria-hidden />
    </Link>
  );
}

/** One of the account page's big shortcuts, with a short note on what's there. */
export function Tile({ href, Icon, label, note, highlight }: { href: string; Icon: LucideIcon; label: string; note: string; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-2xl border border-line p-3.5 transition hover:border-gray-300 hover:bg-canvas/60 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <span className="relative flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="size-5" aria-hidden />
        {highlight && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-brand-600 ring-2 ring-white" />}
      </span>
      <span>
        <span className="block text-[0.9375rem] font-semibold text-ink">{label}</span>
        <span className={`block text-xs ${highlight ? "font-semibold text-brand-700" : "text-muted"}`}>{note}</span>
      </span>
    </Link>
  );
}
