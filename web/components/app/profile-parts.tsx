import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { initials } from "@/lib/format";
import type { User } from "@/lib/types";

/** Avatar, name and contact details at the top of the mobile Account tab, with optional numbers below. */
export function ProfileCard({ user, stats }: { user: User; stats?: { label: string; value: ReactNode; href?: string }[] }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-[0_16px_32px_-18px_rgba(178,58,0,0.7)]">
      <div aria-hidden className="absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -right-4 -bottom-16 size-32 rounded-full bg-white/5" />
      <div className="relative flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-semibold ring-2 ring-white/30">
          {initials(user.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{user.name}</p>
          <p className="truncate text-sm text-white/80">{user.email}</p>
          {user.phone && <p className="text-sm text-white/80">{user.phone}</p>}
        </div>
      </div>
      {stats && stats.length > 0 && (
        <dl className="relative mt-4 grid divide-x divide-white/15 rounded-2xl bg-white/10" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((stat) => {
            const body = (
              <>
                <dd className="text-lg font-bold">{stat.value}</dd>
                <dt className="text-xs text-white/80">{stat.label}</dt>
              </>
            );
            return stat.href ? (
              <Link key={stat.label} href={stat.href} className="flex flex-col-reverse items-center rounded-2xl px-2 py-2.5 transition hover:bg-white/10">
                {body}
              </Link>
            ) : (
              <div key={stat.label} className="flex flex-col-reverse items-center px-2 py-2.5">
                {body}
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

/** A group of tappable rows, like a phone's settings screen. */
export function RowGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</p>}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">{children}</ul>
    </div>
  );
}

/** One row. With `href` it's a link to another page. */
export function Row({
  Icon,
  label,
  value,
  href,
}: {
  Icon: LucideIcon;
  label: string;
  value?: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{label}</span>
      {value && <span className="shrink-0 text-sm text-muted">{value}</span>}
      {href && <ChevronRight className="size-5 shrink-0 text-gray-400" aria-hidden />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="flex items-center gap-3 px-4 py-3 transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
        >
          {content}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{content}</div>
      )}
    </li>
  );
}
