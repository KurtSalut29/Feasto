import Image from "next/image";
import Link from "next/link";
import { STORE_TYPE_ICON } from "@/lib/store-type-icons";
import { STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { StoreCategory } from "@/lib/types";
import { browseHref, NO_FILTERS } from "./stores/store-browse";

/**
 * What Feasto has, before any particular store. Each tile opens every store of that kind and
 * shows a real photo from one of them. Kinds with no stores yet are left out, so no tile is a dead end.
 */
export function CategoryGrid({ categories }: { categories: StoreCategory[] }) {
  const byType = new Map(categories.map((c) => [c.type, c]));
  return (
    <ul className="grid grid-cols-3 gap-x-3 gap-y-3.5">
      {STORE_TYPE_OPTIONS.flatMap(({ value, label }) => {
        const category = byType.get(value);
        if (!category) return [];
        const Icon = STORE_TYPE_ICON[value];
        return (
          <li key={value}>
            <Link
              href={browseHref({ ...NO_FILTERS, type: value })}
              aria-label={`${label}, ${category.count} ${category.count === 1 ? "store" : "stores"}`}
              className="group block rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span className="relative block aspect-[4/3] overflow-hidden rounded-2xl bg-brand-50 ring-1 ring-black/5">
                {category.imageUrl ? (
                  <Image src={category.imageUrl} alt="" fill unoptimized sizes="33vw" className="object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none" />
                ) : (
                  <Icon className="absolute inset-0 m-auto size-8 text-brand-600" aria-hidden />
                )}
              </span>
              <span className="mt-1.5 block text-center text-[13px] leading-tight font-semibold text-balance text-ink">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
