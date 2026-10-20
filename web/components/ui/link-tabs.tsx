import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export type LinkTab = { href: string; label: string; count?: number; active: boolean; Icon?: LucideIcon };

/**
 * Tabs that are plain links, so the selected tab lives in the URL.
 * "segmented" is a compact switcher for toolbars; "underline" sits on a page; "pills" are filter chips.
 */
export function LinkTabs({ tabs, variant = "underline", label }: { tabs: LinkTab[]; variant?: "underline" | "pills" | "segmented"; label?: string }) {
  if (variant === "segmented") {
    return (
      <nav aria-label={label} className="max-w-full overflow-x-auto">
        <div className="inline-flex gap-1 rounded-xl bg-canvas p-1 ring-1 ring-line/70">
          {tabs.map(({ href, label: text, count, active, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                active ? "bg-white font-semibold text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
              }`}
            >
              {Icon && <Icon className={`size-4 ${active ? "text-brand-600" : ""}`} aria-hidden />}
              {text}
              {count !== undefined && (
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums ${
                    active ? "bg-brand-50 text-brand-700" : "bg-white/80 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>
    );
  }

  if (variant === "pills") {
    return (
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
              tab.active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-gray-300"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className={`text-xs ${tab.active ? "text-white/70" : "text-muted"}`}>{tab.count}</span>}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-6 border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={`-mb-px inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
            tab.active ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${tab.active ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600"}`}>{tab.count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
