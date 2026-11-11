import Image from "next/image";
import Link from "next/link";
import { STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { StoreCategory, StoreType } from "@/lib/types";
import { browseHref, NO_FILTERS } from "./stores/store-browse";

/** Feasto's own badge for each kind of store; the name is written under it. */
const badge = (type: StoreType) => `/category-badges/${type.toLowerCase().replaceAll("_", "-")}.webp`;

/**
 * What Feasto has, before any particular store. Each badge opens every store of that kind.
 * Kinds with no stores yet are left out, so no tile is a dead end.
 */
export function CategoryGrid({ categories }: { categories: StoreCategory[] }) {
  const byType = new Map(categories.map((c) => [c.type, c]));
  return (
    <ul className="grid grid-cols-3 gap-x-2 gap-y-3 md:grid-cols-5 lg:grid-cols-9 lg:gap-x-3">
      {STORE_TYPE_OPTIONS.flatMap(({ value, label }) => {
        const category = byType.get(value);
        if (!category) return [];
        const stores = `${category.count} ${category.count === 1 ? "store" : "stores"}`;
        return (
          <li key={value}>
            <Link
              href={browseHref({ ...NO_FILTERS, type: value })}
              aria-label={`${label}, ${stores}`}
              className="group block rounded-2xl p-1 outline-none transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <span className="relative block aspect-[4/3]">
                <Image
                  src={badge(value)}
                  alt=""
                  fill
                  // Every badge is on the first screen, so none should wait for scrolling
                  loading="eager"
                  sizes="(max-width: 440px) 30vw, (max-width: 1024px) 18vw, 130px"
                  className="object-contain transition duration-300 group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none"
                />
              </span>
              <span className="mt-0.5 block text-center text-[13px] leading-tight font-semibold text-balance text-ink">{label}</span>
              <span className="block text-center text-xs text-muted">{stores}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
