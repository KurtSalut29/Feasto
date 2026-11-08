import { ArrowDownWideNarrow } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type QueueRow = {
  id: string;
  /** Selects this row; keeps the rest of the page's query (filters, page) */
  href: string;
  /** The compact line(s) shown in the list */
  content: ReactNode;
};

/**
 * A long list that stays easy to work through: compact rows on the left, numbered in the order
 * they should be handled, and the chosen row in full on the right. On phones the chosen row
 * opens right under itself instead. Everything is plain links, so the choice lives in the URL.
 */
export function SplitQueue({
  title,
  order = "Oldest first",
  rows,
  selectedId,
  detail,
  empty = "Nothing here right now.",
  footer,
  numbered = true,
  startAt = 1,
}: {
  title: string;
  /** How the list is sorted, in words */
  order?: string;
  rows: QueueRow[];
  selectedId: string | undefined;
  /** The chosen row in full */
  detail: ReactNode;
  empty?: string;
  /** Under the list, e.g. pagination (it brings its own top border) */
  footer?: ReactNode;
  numbered?: boolean;
  /** The first row's number, when the list is one page of many */
  startAt?: number;
}) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section aria-label={title} className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-canvas/50 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="flex items-center gap-1 text-xs text-muted">
            <ArrowDownWideNarrow className="size-3.5" aria-hidden />
            {order}
          </p>
        </header>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">{empty}</p>
        ) : (
          <ol className="divide-y divide-line">
            {rows.map((row, i) => {
              const on = row.id === selectedId;
              const n = startAt + i;
              return (
                <li key={row.id}>
                  <Link
                    href={row.href}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    className={`relative flex gap-3 px-4 py-3.5 transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
                      on ? "bg-brand-50/70" : "hover:bg-canvas/60"
                    }`}
                  >
                    {on && <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-r bg-brand-600" />}
                    {numbered && (
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums ${
                          n === 1 ? "bg-ink text-white" : "bg-canvas text-muted ring-1 ring-line"
                        }`}
                      >
                        {n}
                        <span className="sr-only"> in line</span>
                      </span>
                    )}
                    <span className="min-w-0 flex-1">{row.content}</span>
                  </Link>
                  {/* Phones: the chosen row opens right under itself */}
                  {on && <div className="border-t border-brand-100 px-4 py-4 lg:hidden">{detail}</div>}
                </li>
              );
            })}
          </ol>
        )}
        {footer}
      </section>

      {/* Big screens: the chosen row beside the list */}
      <div className="hidden rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:sticky lg:top-6 lg:block">
        {rows.length && selectedId ? detail : <p className="py-16 text-center text-sm text-muted">{rows.length ? "Choose one from the list." : empty}</p>}
      </div>
    </div>
  );
}
