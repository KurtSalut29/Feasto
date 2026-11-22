"use client";

import { Bike, CloudRain, Gauge, Route } from "lucide-react";
import { useEffect, useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { FeastoMap, type MapArea, type MapPin } from "@/components/map/feasto-map";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SwitchField } from "@/components/ui/switch-field";
import { TABLE, TBODY, TD, TH, THEAD, TR } from "@/components/ui/table";
import { formatPeso, timeAgo } from "@/lib/format";

type CellState = "normal" | "slow" | "very-slow" | "no-usual";
type Area = { cell: string; area: string; kmh: number; seconds: number; usualKmh?: number | null; state?: CellState; ring: [number, number][]; center: { lat: number; lng: number } };
type Rider = { id: string; name: string; store: string | null; at: { lat: number; lng: number }; secondsAgo: number; job: { kind: "delivery" | "pabili"; code: string; heading: string } | null };
type Trip = { id: string; code: string; pabili: boolean; kind: "TO_STORE" | "TO_DOOR" | "TO_SHOP"; endedAt: string; km: number; minutes: number; expectedMinutes: number | null; kmh: number | null; stoppedMinutes: number; demo: boolean };
type Data = {
  view: "now" | "week";
  riders: Rider[];
  areas: Area[];
  demand: { waiting: number; freeRiders: number };
  rain: { on: boolean; by: "admin" | "riders" | null; reports: number };
  today: { rides: number; km: number; movingKmh: number | null; overallKmh: number | null; stoppedShare: number | null; estimated: number; overEstimate: number };
  progress: { realRides: number; demoRides: number; needed: number };
  pace: { now: number; fallback: number; learned: boolean; hoursLearned: number; ridesThisHour: number; needed: number };
  uses: { feeOn: boolean; feePerMinute: number; feeMax: number; bonusOn: boolean; feesToday: number; feeOrdersToday: number; bonusesToday: number; bonusOrdersToday: number };
  trips: Trip[];
};

/** How often the page asks again: riders send a position every few seconds, squares fill every 15 minutes */
const REFRESH_MS = 15_000;

/** Now against the usual. Each color always comes with its words, on the map's legend and in the list. */
const NOW_LOOK: Record<CellState, { color: string; label: string; tone: BadgeTone }> = {
  normal: { color: "#059669", label: "Usual speed", tone: "success" },
  slow: { color: "#d97706", label: "Slower than usual", tone: "warning" },
  "very-slow": { color: "#dc2626", label: "Much slower", tone: "danger" },
  "no-usual": { color: "#64748b", label: "No usual yet", tone: "neutral" },
};

/** The past week, by speed itself */
const WEEK_BANDS = [
  { min: 25, color: "#059669", label: "25 km/h or faster", tone: "success" as BadgeTone },
  { min: 15, color: "#d97706", label: "15 to 25 km/h", tone: "warning" as BadgeTone },
  { min: 0, color: "#dc2626", label: "Under 15 km/h", tone: "danger" as BadgeTone },
];
const weekBand = (kmh: number) => WEEK_BANDS.find((b) => kmh >= b.min)!;

const LEG: Record<Trip["kind"], string> = { TO_STORE: "To the store", TO_DOOR: "To the door", TO_SHOP: "To the shop" };
const RANK: Record<CellState, number> = { "very-slow": 0, slow: 1, normal: 2, "no-usual": 3 };

const card = "rounded-3xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
const kmh = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(n < 10 ? 1 : 0)} km/h`);
const minutes = (s: number) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);

/** Admin › Daloy: the riders on the map, the speed of each part of town now, and the rides logged */
export function DaloyLive() {
  const [view, setView] = useState<"now" | "week">("now");
  const [demo, setDemo] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  const { data } = useApiData<Data>(`/admin/daloy?view=${view}&demo=${demo ? 1 : 0}`, tick);
  if (!data) return <div className="h-96 animate-pulse rounded-3xl bg-canvas" />;

  const now = data.view === "now";
  const look = (a: Area) => (now ? NOW_LOOK[a.state ?? "no-usual"] : weekBand(a.kmh));
  const areas: MapArea[] = data.areas.map((a) => ({ id: a.cell, ring: a.ring, color: look(a).color }));
  const pins: MapPin[] = data.riders.map((r) => ({ id: r.id, kind: "rider", at: r.at, label: r.name.split(" ")[0] }));
  const sorted = [...data.areas].sort((a, b) => (now ? RANK[a.state ?? "no-usual"] - RANK[b.state ?? "no-usual"] || a.kmh - b.kmh : a.kmh - b.kmh));
  const onJob = data.riders.filter((r) => r.job).length;
  const legend = now ? Object.values(NOW_LOOK) : WEEK_BANDS;
  const { realRides, needed } = data.progress;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile Icon={Bike} label="Riders on the map" value={String(data.riders.length)} note={`${onJob} on a job, ${data.riders.length - onJob} free`} />
        <Tile
          Icon={CloudRain}
          label="Orders waiting for a rider"
          value={String(data.demand.waiting)}
          note={`${data.demand.freeRiders} free ${data.demand.freeRiders === 1 ? "rider" : "riders"} · ${data.rain.on ? `Raining (${data.rain.by === "admin" ? "set by you" : "riders said so"})` : "No rain"}`}
        />
        <Tile Icon={Route} label="Rides logged today" value={String(data.today.rides)} note={`${data.today.km} km ridden${data.today.estimated ? ` · ${data.today.overEstimate} of ${data.today.estimated} took longer than estimated` : ""}`} />
        <Tile
          Icon={Gauge}
          label="Speed today, while moving"
          value={kmh(data.today.movingKmh)}
          note={data.today.overallKmh == null ? "No rides yet today" : `${kmh(data.today.overallKmh)} with the stops · stopped ${data.today.stoppedShare}% of the time`}
        />
      </div>

      <section aria-labelledby="map-title" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="map-title" className="font-semibold text-ink">
              {now ? "The roads in the last half hour" : "The roads over the past 7 days"}
            </h2>
            <p className="text-sm text-muted">
              {now
                ? "Each square is about 440 m. It's compared with its usual speed at this time of day over the past 4 weeks."
                : "Where riders went this week, and how fast. The stops at lights and in traffic count in the speed."}
            </p>
          </div>
          <div className="w-full sm:w-64">
            <SegmentedControl
              name="daloy-view"
              legend="Show"
              value={view}
              onChange={setView}
              options={[
                { value: "now", label: "Now" },
                { value: "week", label: "Past 7 days" },
              ]}
            />
          </div>
        </div>
        <FeastoMap pins={pins} areas={areas} label="Map of the riders online and the speed of each part of town" className="mt-4 h-[26rem] rounded-2xl" start={{ center: { lat: 11.5618, lng: 124.3965 }, zoom: 14 }} />
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink" aria-label="What the colors mean">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-2">
              <span aria-hidden className="size-3.5 rounded-sm border" style={{ backgroundColor: `${l.color}59`, borderColor: l.color }} />
              {l.label}
            </li>
          ))}
          <li className="flex items-center gap-2 text-muted">
            <Bike className="size-4" aria-hidden />A rider, live
          </li>
        </ul>
        <div className="mt-4 border-t border-line pt-4">
          <SwitchField
            label="Include demo rides"
            description={`The "simulate the ride" button on a laptop. Kept apart so it never mixes with real roads. ${data.progress.demoRides} demo ${data.progress.demoRides === 1 ? "ride" : "rides"} so far.`}
            checked={demo}
            onChange={setDemo}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section aria-labelledby="areas-title" className={card}>
          <h2 id="areas-title" className="font-semibold text-ink">
            {now ? "Slowest first" : "Slowest this week"}
          </h2>
          <p className="text-sm text-muted">The map as a list. A square is named after the nearest store.</p>
          {sorted.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-canvas px-4 py-6 text-center text-sm text-muted">
              {now ? "No rides in the last half hour." : "No rides this week."} Squares fill in as riders deliver{demo ? "" : ", or turn on demo rides to see how it looks"}.
            </p>
          ) : (
            <div className="-mx-5 mt-3 overflow-x-auto">
              <table className={TABLE}>
                <thead className={THEAD}>
                  <tr>
                    <th className={TH}>Area</th>
                    <th className={TH}>{now ? "Now" : "Average"}</th>
                    {now && <th className={TH}>Usual</th>}
                    <th className={TH}>{now ? "Compared" : "Riding"}</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {sorted.slice(0, 12).map((a) => (
                    <tr key={a.cell} className={TR}>
                      <td className={`${TD} max-w-56 truncate font-medium text-ink`}>{a.area}</td>
                      <td className={`${TD} tabular-nums`}>{kmh(a.kmh)}</td>
                      {now && <td className={`${TD} tabular-nums text-muted`}>{kmh(a.usualKmh)}</td>}
                      <td className={TD}>{now ? <Badge tone={look(a).tone}>{look(a).label}</Badge> : <span className="tabular-nums text-muted">{minutes(a.seconds)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="trips-title" className={card}>
          <h2 id="trips-title" className="font-semibold text-ink">
            Latest rides
          </h2>
          <p className="text-sm text-muted">Each ride against Feasto&apos;s estimate today (3 minutes a km). This is what step 2 learns from.</p>
          {data.trips.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-canvas px-4 py-6 text-center text-sm text-muted">No rides logged yet. A ride is logged when the rider reaches the store, picks up, or gets to the door.</p>
          ) : (
            <div className="-mx-5 mt-3 overflow-x-auto">
              <table className={TABLE}>
                <thead className={THEAD}>
                  <tr>
                    <th className={TH}>Ride</th>
                    <th className={TH}>Took</th>
                    <th className={TH}>Estimate</th>
                    <th className={TH}>Speed</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {data.trips.slice(0, 12).map((t) => {
                    const late = t.expectedMinutes != null && t.minutes > t.expectedMinutes * 1.25;
                    return (
                      <tr key={t.id} className={TR}>
                        <td className={TD}>
                          <span className="block font-medium text-ink">
                            {t.code} · {LEG[t.kind]} {t.demo && <Badge>Demo</Badge>}
                          </span>
                          <span className="block text-xs text-muted">
                            {t.pabili ? "Pabili" : "Delivery"} · {t.km.toFixed(1)} km · {timeAgo(t.endedAt)}
                          </span>
                        </td>
                        <td className={`${TD} tabular-nums`}>
                          {t.minutes} min
                          {t.stoppedMinutes > 0 && <span className="block text-xs text-muted">{t.stoppedMinutes} min stopped</span>}
                        </td>
                        <td className={`${TD} tabular-nums`}>{t.expectedMinutes == null ? <span className="text-muted">No pin</span> : late ? <Badge tone="warning">{t.expectedMinutes} min, longer</Badge> : `${t.expectedMinutes} min`}</td>
                        <td className={`${TD} tabular-nums`}>{kmh(t.kmh)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="next-title" className={card}>
        <h2 id="next-title" className="font-semibold text-ink">
          How Daloy is used
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-canvas p-3">
            <dt className="text-sm text-muted">ETA pace now</dt>
            <dd className="text-xl font-bold text-ink tabular-nums">{data.pace.now.toFixed(1)} min/km</dd>
            <dd className="text-xs text-muted">
              {data.pace.learned
                ? `Learned from ${data.pace.ridesThisHour} real rides at this hour.`
                : `Feasto's ${data.pace.fallback} min/km until ${data.pace.needed} real rides at this hour (${data.pace.ridesThisHour} so far).`}
            </dd>
          </div>
          <div className="rounded-2xl bg-canvas p-3">
            <dt className="text-sm text-muted">Slow-road add-ons today</dt>
            <dd className="text-xl font-bold text-ink tabular-nums">{formatPeso(data.uses.feesToday)}</dd>
            <dd className="text-xs text-muted">
              {data.uses.feeOn ? `${data.uses.feeOrdersToday} orders · ₱${data.uses.feePerMinute} a slow minute, at most ₱${data.uses.feeMax}. All to the riders.` : "Off in Admin › Settings."}
            </dd>
          </div>
          <div className="rounded-2xl bg-canvas p-3">
            <dt className="text-sm text-muted">Delay bonuses today</dt>
            <dd className="text-xl font-bold text-ink tabular-nums">{formatPeso(data.uses.bonusesToday)}</dd>
            <dd className="text-xs text-muted">{data.uses.bonusOn ? `${data.uses.bonusOrdersToday} rides. Paid by Feasto with the riders' payouts.` : "Off in Admin › Settings."}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-muted">
          Real rides so far: <span className="font-semibold text-ink tabular-nums">{realRides}</span>. The add-on needs a recent ride and a usual for at least half the squares on the way, so with little data it adds nothing.
        </p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label="Real rides logged" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={Math.min(realRides, needed)}>
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (realRides / needed) * 100)}%` }} />
        </div>
        <p className="mt-3 text-xs text-muted">
          Only the admin sees riders here, and only while they&apos;re online. The road squares keep metres and seconds, no rider or order, and are deleted after 90 days.
        </p>
      </section>
    </div>
  );
}

function Tile({ Icon, label, value, note }: { Icon: typeof Bike; label: string; value: string; note: string }) {
  return (
    <div className={card}>
      <p className="flex items-center gap-2 text-sm text-muted">
        <Icon className="size-4 text-brand-600" aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{value}</p>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}
