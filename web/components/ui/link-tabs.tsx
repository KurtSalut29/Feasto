import Link from "next/link";

export type LinkTab = { href: string; label: string; count?: number; active: boolean };

/** Tabs that are plain links, so the selected tab lives in the URL. */
export function LinkTabs({ tabs, variant = "underline" }: { tabs: LinkTab[]; variant?: "underline" | "pills" }) {
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
            {tab.count !== undefined && (
              <span className={`text-xs ${tab.active ? "text-white/70" : "text-muted"}`}>{tab.count}</span>
            )}
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
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${tab.active ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600"}`}
            >
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
