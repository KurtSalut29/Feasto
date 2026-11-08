"use client";

import { Bike, ChevronDown, Search, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/app/avatar";

export type RosterState = "delivering" | "online" | "offline" | "inactive";

/** One of the store's riders, as the roster lists them. `details` is drawn on the server. */
export type RosterRider = {
  id: string;
  name: string;
  phone: string | null;
  vehicle: string;
  plate: string | null;
  license: { number: string | null; text: string; tone: "ok" | "soon" | "expired" | "none" };
  state: RosterState;
  stateText: string;
  deliveries: number;
  deliveriesToday: number;
  /** A renewed license to check, or a license that needs renewing */
  needsAttention: boolean;
  details: ReactNode;
};

const STATE_STYLE: Record<RosterState, { dot: string; text: string }> = {
  delivering: { dot: "bg-sky-500", text: "text-sky-700" },
  online: { dot: "bg-emerald-500", text: "text-emerald-700" },
  offline: { dot: "bg-gray-300", text: "text-muted" },
  inactive: { dot: "bg-red-400", text: "text-red-700" },
};

const LICENSE_STYLE = {
  ok: "text-muted",
  soon: "font-semibold text-amber-700",
  expired: "font-semibold text-red-700",
  none: "text-gray-400",
};

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "online", label: "Online", test: (r: RosterRider) => r.state === "online" || r.state === "delivering" },
  { key: "delivering", label: "On a delivery", test: (r: RosterRider) => r.state === "delivering" },
  { key: "offline", label: "Offline", test: (r: RosterRider) => r.state === "offline" },
  { key: "attention", label: "Needs attention", test: (r: RosterRider) => r.needsAttention },
  { key: "inactive", label: "Not active", test: (r: RosterRider) => r.state === "inactive" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

/**
 * Every rider of the store in one compact list that stays readable at any size: search by name,
 * plate or phone, filter by what they're doing, and open a rider for their license and actions.
 */
export function Roster({ riders }: { riders: RosterRider[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const test = FILTERS.find((f) => f.key === filter)!.test;
  const shown = riders.filter(
    (r) => test(r) && (!q || r.name.toLowerCase().includes(q) || r.plate?.toLowerCase().includes(q) || r.phone?.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000")),
  );

  return (
    <section aria-labelledby="roster-title" className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-canvas text-muted ring-1 ring-line/70">
            <Users className="size-[18px]" aria-hidden />
          </span>
          <div>
            <h2 id="roster-title" className="font-semibold text-ink">
              Your riders
            </h2>
            <p className="text-sm text-muted">
              {riders.length} {riders.length === 1 ? "rider" : "riders"}. Open one to see their license and actions.
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, plate or phone"
            aria-label="Search riders"
            className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </div>
      </header>

      <div role="group" aria-label="Show" className="flex gap-1.5 overflow-x-auto border-b border-line px-5 py-2.5 [scrollbar-width:none]">
        {FILTERS.map(({ key, label, test: match }) => {
          const count = riders.filter(match).length;
          if (key !== "all" && count === 0) return null;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`h-8 shrink-0 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                filter === key ? "bg-ink text-white" : key === "attention" ? "bg-amber-50 text-amber-800 hover:bg-amber-100" : "bg-canvas text-muted hover:text-ink"
              }`}
            >
              {label}
              <span className={`ml-1.5 text-xs ${filter === key ? "text-white/70" : "opacity-60"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_90px_36px] gap-4 border-b border-line bg-canvas/60 px-5 py-2 text-[11px] font-semibold tracking-wider text-gray-500 uppercase lg:grid">
        <span>Rider</span>
        <span>Motorcycle</span>
        <span>License</span>
        <span>Right now</span>
        <span className="text-right">Deliveries</span>
        <span className="sr-only">Details</span>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">No riders match.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((rider) => {
            const expanded = open === rider.id;
            const state = STATE_STYLE[rider.state];
            return (
              <li key={rider.id} className={expanded ? "bg-canvas/40" : undefined}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`rider-${rider.id}`}
                  onClick={() => setOpen(expanded ? null : rider.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3 text-left transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_90px_36px]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="relative shrink-0">
                      <Avatar name={rider.name} />
                      <span aria-hidden className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-white ${state.dot}`} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink">{rider.name}</span>
                        {rider.needsAttention && (
                          <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">Check</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted">{rider.phone ?? "No phone"}</span>
                      {/* Below big screens, the other columns fold into one line */}
                      <span className="mt-0.5 block truncate text-xs lg:hidden">
                        <span className={`font-semibold ${state.text}`}>{rider.stateText}</span>
                        <span className="text-muted">
                          {" "}
                          · {rider.plate ?? rider.vehicle} · {rider.deliveriesToday} today
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="hidden min-w-0 lg:block">
                    <span className="flex items-center gap-1.5 truncate text-sm text-ink">
                      <Bike className="size-4 shrink-0 text-gray-400" aria-hidden />
                      <span className="truncate">{rider.vehicle}</span>
                    </span>
                    <span className="block truncate font-mono text-xs text-muted">{rider.plate ?? "No plate"}</span>
                  </span>
                  <span className="hidden min-w-0 lg:block">
                    <span className="block truncate text-sm text-ink">{rider.license.number ?? "No number"}</span>
                    <span className={`block truncate text-xs ${LICENSE_STYLE[rider.license.tone]}`}>{rider.license.text}</span>
                  </span>
                  <span className={`hidden items-center gap-1.5 text-sm font-medium lg:flex ${state.text}`}>
                    <span aria-hidden className={`size-2 shrink-0 rounded-full ${state.dot}`} />
                    <span className="truncate">{rider.stateText}</span>
                  </span>
                  <span className="hidden text-right lg:block">
                    <span className="block text-sm font-semibold text-ink tabular-nums">{rider.deliveriesToday} today</span>
                    <span className="block text-xs text-muted tabular-nums">{rider.deliveries} in all</span>
                  </span>
                  <span className="flex size-9 items-center justify-center justify-self-end rounded-lg text-muted ring-1 ring-line">
                    <ChevronDown className={`size-4 transition ${expanded ? "rotate-180" : ""}`} aria-hidden />
                    <span className="sr-only">{expanded ? "Hide details" : "Show details"}</span>
                  </span>
                </button>
                {expanded && (
                  <div id={`rider-${rider.id}`} className="border-t border-dashed border-line px-5 py-4">
                    {rider.details}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
