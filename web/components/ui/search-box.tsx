import { Search, X } from "lucide-react";
import Link from "next/link";

/**
 * A search box that submits as a plain GET form, so the query lives in the URL.
 * `keep` carries the current filters along; the × link clears only the search.
 */
export function SearchBox({
  action,
  value,
  placeholder,
  label,
  keep = {},
  clearHref,
}: {
  action: string;
  value: string;
  placeholder: string;
  label: string;
  keep?: Record<string, string | undefined>;
  clearHref: string;
}) {
  return (
    <form action={action} role="search" className="relative w-full sm:w-72">
      {Object.entries(keep).map(([name, v]) => v && <input key={name} type="hidden" name={name} value={v} />)}
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        type="search"
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        aria-label={label}
        className="h-10 w-full rounded-xl border border-line bg-white pr-9 pl-9 text-sm outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <Link
          href={clearHref}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 hover:bg-canvas hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </Link>
      )}
    </form>
  );
}
