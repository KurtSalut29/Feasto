import { Search, X } from "lucide-react";
import Link from "next/link";

/**
 * A search box that works without JavaScript: it submits the page's own URL with `q`, keeping
 * the filters in `hidden`. Clear drops the search but keeps the filters.
 */
export function SearchBar({ action, hidden = {}, value, placeholder }: { action: string; hidden?: Record<string, string>; value: string; placeholder: string }) {
  const clear = `${action}?${new URLSearchParams(hidden)}`;
  return (
    <form action={action} role="search" className="mb-4 flex gap-2">
      {Object.entries(hidden).map(([name, v]) => (
        <input key={name} type="hidden" name={name} value={v} />
      ))}
      <div className="relative min-w-0 flex-1 sm:max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={value}
          placeholder={placeholder}
          aria-label="Search"
          className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
        />
      </div>
      <button
        type="submit"
        className="h-10 shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-white transition hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        Search
      </button>
      {value && (
        <Link
          href={clear}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <X className="size-4" aria-hidden />
          Clear
        </Link>
      )}
    </form>
  );
}
