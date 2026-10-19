import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { initials } from "@/lib/format";
import type { User } from "@/lib/types";

/** Avatar, name and contact details at the top of the mobile Account tab. */
export function ProfileCard({ user }: { user: User }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line p-4">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
        {initials(user.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">{user.name}</p>
        <p className="truncate text-sm text-muted">{user.email}</p>
        {user.phone && <p className="text-sm text-muted">{user.phone}</p>}
      </div>
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
