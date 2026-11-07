"use client";

import { ArrowUpDown, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/**
 * The kinds of stores, in the same order on every page. The chosen one is scrolled to the
 * middle of the row, so a resident who tapped "Desserts" on Home can see it's selected.
 */
export function CategoryTabs({ tabs }: { tabs: { label: string; count: number; href: string; active: boolean }[] }) {
  const row = useRef<HTMLElement>(null);
  const chosen = tabs.find((tab) => tab.active)?.label;

  useLayoutEffect(() => {
    const box = row.current;
    const tab = box?.querySelector<HTMLElement>("[aria-current=page]");
    // Sets the row's own scroll, not scrollIntoView, so the page itself never moves
    if (box && tab) box.scrollLeft = tab.offsetLeft - (box.clientWidth - tab.offsetWidth) / 2;
  }, [chosen]);

  return (
    <nav ref={row} aria-label="Store types" className="relative -mx-4 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
      <ul className="flex w-max min-w-full gap-5 border-b border-line px-4">
        {tabs.map((tab) => (
          <li key={tab.label}>
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
                tab.active ? "border-brand-600 text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab.label}
              <span className={`text-xs font-medium tabular-nums ${tab.active ? "text-brand-700" : "text-gray-500"}`}>{tab.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * How to order the list. A phone's own picker: the real select lies invisibly over the chip,
 * at 16 px so iPhones don't zoom in when it's tapped.
 */
export function SortMenu({ value, options }: { value: string; options: { value: string; label: string; href: string }[] }) {
  const router = useRouter();
  return (
    <span className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-sm font-medium text-ink transition hover:border-gray-300 has-focus-visible:outline-2 has-focus-visible:outline-brand-500">
      <ArrowUpDown className="size-3.5 text-muted" aria-hidden />
      {options.find((o) => o.value === value)?.label}
      <ChevronDown className="size-3.5 text-muted" aria-hidden />
      <select
        aria-label="Sort stores"
        value={value}
        onChange={(e) => {
          const href = options.find((o) => o.value === e.target.value)?.href;
          if (href) router.replace(href, { scroll: false });
        }}
        className="absolute inset-0 cursor-pointer appearance-none text-base opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
