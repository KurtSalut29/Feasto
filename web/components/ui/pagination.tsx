import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

/** Page numbers to show: always the first and last, the current page and its neighbours, and gaps between. */
function pageList(page: number, last: number): (number | "gap")[] {
  const keep = new Set([1, last, page - 1, page, page + 1].filter((n) => n >= 1 && n <= last));
  const sorted = [...keep].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? ["gap" as const, n] : [n]));
}

const box = "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-500";

/** "Showing 26–50 of 132 orders" with previous / next and page numbers. Renders nothing for a single page. */
export function Pagination({
  page,
  pageSize,
  total,
  noun,
  href,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  href: (page: number) => string;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p className="text-sm text-muted">
        Showing <span className="font-semibold text-ink tabular-nums">{from}</span>–<span className="font-semibold text-ink tabular-nums">{to}</span> of{" "}
        <span className="font-semibold text-ink tabular-nums">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} aria-label="Previous page" className={`${box} border border-line bg-white text-ink hover:bg-canvas`}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
        ) : (
          <span aria-hidden className={`${box} border border-line text-gray-300`}>
            <ChevronLeft className="size-4" />
          </span>
        )}
        {pageList(page, last).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} aria-hidden className="px-1 text-gray-400">
              …
            </span>
          ) : (
            <Link
              key={n}
              href={href(n)}
              aria-current={n === page ? "page" : undefined}
              aria-label={`Page ${n}`}
              className={`${box} tabular-nums ${n === page ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink"}`}
            >
              {n}
            </Link>
          ),
        )}
        {page < last ? (
          <Link href={href(page + 1)} aria-label="Next page" className={`${box} border border-line bg-white text-ink hover:bg-canvas`}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span aria-hidden className={`${box} border border-line text-gray-300`}>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
