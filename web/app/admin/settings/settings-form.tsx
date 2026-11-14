"use client";

import { BadgePercent, Bike, CalendarHeart, Clock, Hourglass, Percent, Route, ShieldCheck, Store, Sun, TimerOff, UserPlus, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import { formatPeso } from "@/lib/format";
import { RushHoursEditor, type PeakWindow } from "./rush-hours-editor";

export type PlatformSettings = {
  /** Base delivery fee, for the first `deliveryBaseKm` km */
  deliveryFee: number;
  deliveryBaseKm: number;
  deliveryPerKm: number;
  deliveryPeakFee: number;
  /** When the add-on applies; the system checks the time at each checkout */
  peakHours: PeakWindow[];
  storeRiderSeconds: number;
  riderWaveSeconds: number;
  stuckMinutes: number;
  /** Orders no store accepted, or no rider took, are cancelled by themselves after this (0 = off) */
  autoCancelMinutes: number;
  /** Accounts one network may create in 10 minutes (where Feasto can tell networks apart) */
  signupsPerNetwork: number;
  /** Feasto's commission on a delivery order's food, in percent */
  commissionPercent: number;
  pickupCommissionPercent: number;
  /** Feasto's share of the delivery fee, in percent; tips are never shared */
  riderFeePercent: number;
  /** A newly approved store pays no commission for this many days */
  freeTrialDays: number;
};
type Key = Exclude<keyof PlatformSettings, "peakHours">;

const whenInWords = (seconds: number) => (seconds < 60 ? `${seconds} s` : seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`);

/** What a few distances would cost with the prices being typed, so the admin sees the effect. */
function FeeExamples({ base, baseKm, perKm, peak }: { base: number; baseKm: number; perKm: number; peak: number }) {
  const fee = (km: number) => base + Math.max(0, Math.ceil(Math.round((km - baseKm) * 10) / 10)) * perKm;
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-canvas text-left text-xs font-semibold tracking-wide text-muted uppercase">
          <tr>
            <th className="px-3 py-2">Distance by road</th>
            <th className="px-3 py-2 text-right">Normal hours</th>
            <th className="px-3 py-2 text-right">In a rush hour</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[1, 2.5, 4, 6, 9].map((km) => (
            <tr key={km}>
              <td className="px-3 py-2 text-ink">{km} km</td>
              <td className="px-3 py-2 text-right font-semibold text-ink tabular-nums">{formatPeso(fee(km))}</td>
              <td className="px-3 py-2 text-right text-ink tabular-nums">{formatPeso(fee(km) + peak)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The order a job reaches riders in, worked out from the two waits as they're typed. */
function WaveTimeline({ storeSeconds, waveSeconds }: { storeSeconds: number; waveSeconds: number }) {
  const steps = [
    { at: 0, who: "The store's own riders" },
    { at: storeSeconds, who: "The 3 nearest free riders" },
    { at: storeSeconds + waveSeconds, who: "The next 5 nearest" },
    { at: storeSeconds + waveSeconds * 2, who: "Every free rider" },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
      {steps.map((step) => (
        <li key={step.who} className="rounded-xl bg-canvas px-3 py-2.5">
          <p className="text-sm font-semibold text-ink tabular-nums">{step.at === 0 ? "Right away" : `After ${whenInWords(step.at)}`}</p>
          <p className="text-sm text-muted">{step.who}</p>
        </li>
      ))}
    </ol>
  );
}

/** One order worked out with the rates being typed, so the admin sees who gets what. */
function EarningsExample({ commission, pickup, riderFee, deliveryFee }: { commission: number; pickup: number; riderFee: number; deliveryFee: number }) {
  const food = 300;
  const cut = (amount: number, percent: number) => Math.round(amount * percent) / 100;
  const rows = [
    { what: "Delivery order", food, fee: deliveryFee, commission: cut(food, commission), riderCut: cut(deliveryFee, riderFee) },
    { what: "Pickup order", food, fee: 0, commission: cut(food, pickup), riderCut: 0 },
  ];
  return (
    // Focusable so it can be scrolled sideways with the keyboard on a small screen
    <div tabIndex={0} role="region" aria-label="Example order" className="overflow-x-auto rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-brand-500">
      <table className="w-full min-w-[460px] text-sm">
        <thead className="bg-canvas text-left text-xs font-semibold tracking-wide text-muted uppercase">
          <tr>
            <th className="px-3 py-2">{formatPeso(food)} of food</th>
            <th className="px-3 py-2 text-right">Store gets</th>
            <th className="px-3 py-2 text-right">Rider gets</th>
            <th className="px-3 py-2 text-right">Feasto earns</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.what}>
              <td className="px-3 py-2 text-ink">{r.what}</td>
              <td className="px-3 py-2 text-right text-ink tabular-nums">{formatPeso(r.food - r.commission)}</td>
              <td className="px-3 py-2 text-right text-ink tabular-nums">{r.fee ? `${formatPeso(r.fee - r.riderCut)} + tips` : "—"}</td>
              <td className="px-3 py-2 text-right font-semibold text-ink tabular-nums">{formatPeso(r.commission + r.riderCut)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsForm({ initial }: { initial: PlatformSettings }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<Key, string>>({
    deliveryFee: String(initial.deliveryFee),
    deliveryBaseKm: String(initial.deliveryBaseKm),
    deliveryPerKm: String(initial.deliveryPerKm),
    deliveryPeakFee: String(initial.deliveryPeakFee),
    storeRiderSeconds: String(initial.storeRiderSeconds),
    riderWaveSeconds: String(initial.riderWaveSeconds),
    stuckMinutes: String(initial.stuckMinutes),
    autoCancelMinutes: String(initial.autoCancelMinutes),
    signupsPerNetwork: String(initial.signupsPerNetwork),
    commissionPercent: String(initial.commissionPercent),
    pickupCommissionPercent: String(initial.pickupCommissionPercent),
    riderFeePercent: String(initial.riderFeePercent),
    freeTrialDays: String(initial.freeTrialDays),
  });
  const [peakHours, setPeakHours] = useState<PeakWindow[]>(initial.peakHours);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const field = (name: Key) => ({
    name,
    type: "number" as const,
    inputMode: "numeric" as const,
    value: values[name],
    error: fieldErrors[name]?.[0],
    onChange: (event: { target: { value: string } }) => {
      setSaved(false);
      setValues((current) => ({ ...current, [name]: event.target.value }));
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(undefined);
    setFieldErrors({});
    // A blank box goes as null, which the server refuses with the field's own message
    const number = (key: Key) => (values[key].trim() === "" ? null : Number(values[key]));
    const result = await apiRequest("/admin/settings", {
      method: "PUT",
      body: {
        deliveryFee: number("deliveryFee"),
        deliveryBaseKm: number("deliveryBaseKm"),
        deliveryPerKm: number("deliveryPerKm"),
        deliveryPeakFee: number("deliveryPeakFee"),
        peakHours: peakHours.map((w) => ({ ...w, name: w.name.trim() })),
        storeRiderSeconds: number("storeRiderSeconds"),
        riderWaveSeconds: number("riderWaveSeconds"),
        stuckMinutes: number("stuckMinutes"),
        autoCancelMinutes: number("autoCancelMinutes"),
        signupsPerNetwork: number("signupsPerNetwork"),
        commissionPercent: number("commissionPercent"),
        pickupCommissionPercent: number("pickupCommissionPercent"),
        riderFeePercent: number("riderFeePercent"),
        freeTrialDays: number("freeTrialDays"),
      },
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setSaved(true);
    toast.success("Settings saved", "New checkouts and rider offers use them from now on.");
    router.refresh();
  }

  const storeSeconds = Number(values.storeRiderSeconds) || 0;
  const waveSeconds = Number(values.riderWaveSeconds) || 0;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && !error && <Alert tone="success">Settings saved.</Alert>}

      <Card
        title="Delivery fee"
        Icon={Wallet}
        description="Follows the distance by road from the store to the resident, like other food apps. Charged per store; pickup stays free. The rider earns the whole fee."
      >
        {/* Big screens: the prices and what they cost on the left, the rush hours on the right */}
        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Base fee (₱)" step="0.01" min="0" icon={Wallet} hint="₱0 to ₱500. Covers the first kilometres." {...field("deliveryFee")} />
            <TextField label="Kilometres the base fee covers" step="0.5" min="0" icon={Route} hint="0 to 20 km, e.g. 2." {...field("deliveryBaseKm")} />
            <TextField label="Each extra km (₱)" step="0.01" min="0" icon={Route} hint="₱0 to ₱100. A started kilometre counts as one." {...field("deliveryPerKm")} />
            <TextField label="Rush-hour add-on (₱)" step="0.01" min="0" icon={Sun} hint="₱0 to ₱200. Added in the rush hours below, when riders are busiest. 0 turns it off." {...field("deliveryPeakFee")} />
          </div>
          <FeeExamples
            base={Number(values.deliveryFee) || 0}
            baseKm={Number(values.deliveryBaseKm) || 0}
            perKm={Number(values.deliveryPerKm) || 0}
            peak={Number(values.deliveryPeakFee) || 0}
          />
          <p className="text-sm text-muted">New checkouts use these prices. Orders already placed keep the fee they were placed with.</p>
          </div>
          <div className="min-w-0 xl:border-l xl:border-line xl:pl-6">
            <RushHoursEditor
              value={peakHours}
              onChange={(next) => {
                setSaved(false);
                setPeakHours(next);
              }}
              peakFee={Number(values.deliveryPeakFee) || 0}
              errors={fieldErrors.peakHours}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Feasto's earnings"
        Icon={BadgePercent}
        description="What Feasto keeps from each finished order. Residents pay nothing extra, and every tip goes to the rider."
      >
        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <TextField label="Commission on delivery orders (%)" step="0.5" min="0" icon={Percent} hint="0 to 30. Taken from the store's food sales." {...field("commissionPercent")} />
            <TextField label="Commission on pickup orders (%)" step="0.5" min="0" icon={Store} hint="0 to 30. Lower, because no rider is needed." {...field("pickupCommissionPercent")} />
            <TextField label="Share of the delivery fee (%)" step="0.5" min="0" icon={Bike} hint="0 to 30. Taken from the rider's fee, never from tips." {...field("riderFeePercent")} />
            <TextField label="Free days for new stores" min="0" icon={CalendarHeart} hint="0 to 365. A newly approved store pays no commission for this long." {...field("freeTrialDays")} />
          </div>
          <div className="min-w-0 space-y-3 xl:border-l xl:border-line xl:pl-6">
            <EarningsExample
              commission={Number(values.commissionPercent) || 0}
              pickup={Number(values.pickupCommissionPercent) || 0}
              riderFee={Number(values.riderFeePercent) || 0}
              deliveryFee={Number(values.deliveryFee) || 0}
            />
            <p className="text-sm text-muted">
              New checkouts use these rates. Orders already placed keep theirs, and cancelled or declined orders pay nothing. Each store and rider sees the same breakdown in their reports.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-2">

      <Card title="Finding a rider" Icon={Bike} description="How long a job waits before it reaches more riders.">
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Store riders' turn (seconds)" min="10" icon={Clock} hint="10 to 600. How long a store's own riders have a job to themselves." {...field("storeRiderSeconds")} />
            <TextField label="Time between waves (seconds)" min="10" icon={Clock} hint="10 to 300. The wait before the job reaches more free riders." {...field("riderWaveSeconds")} />
          </div>
          <WaveTimeline storeSeconds={storeSeconds} waveSeconds={waveSeconds} />
          <p className="text-sm text-muted">Jobs already waiting finish their current wait first. A step with no riders to reach is skipped.</p>
        </div>
      </Card>

      <Card
        title="Orders that wait too long"
        Icon={Hourglass}
        description="Feasto cancels orders nobody took by itself, and tells you only about the ones it can't fix."
      >
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Cancel automatically after (minutes)"
              min="0"
              icon={TimerOff}
              hint="0 turns it off, or 3 to 120. If the store hasn't accepted the order, or no rider took the delivery, it's cancelled and the resident and the store are told why."
              {...field("autoCancelMinutes")}
            />
            <TextField
              label="Tell me after (minutes)"
              min="1"
              icon={Hourglass}
              hint="1 to 240. For orders a rider already has (picked up but not delivered, or not collected), which Feasto doesn't cancel."
              {...field("stuckMinutes")}
            />
          </div>
          <ol className="grid gap-2 text-sm sm:grid-cols-3">
            {[
              ["Store didn't accept", Number(values.autoCancelMinutes) ? `Cancelled after ${values.autoCancelMinutes} min` : "Waits for you"],
              ["No rider took it", Number(values.autoCancelMinutes) ? `Cancelled after ${values.autoCancelMinutes} min` : "Waits for you"],
              ["Rider has it, but it's late", `You're told after ${values.stuckMinutes || "…"} min`],
            ].map(([what, then]) => (
              <li key={what} className="rounded-xl bg-canvas px-3 py-2.5">
                <p className="font-semibold text-ink">{what}</p>
                <p className="text-muted">{then}</p>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted">The stock goes back and online payments are refunded. Every automatic cancel is in the activity log as &quot;Feasto (automatic)&quot;.</p>
        </div>
      </Card>

      <Card
        title="Sign-up limit"
        Icon={ShieldCheck}
        description="Stops a script from making hundreds of fake accounts, without stopping a class that signs up together."
      >
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="New accounts per network, every 10 minutes"
              min="5"
              icon={UserPlus}
              hint="5 to 1000. Everyone on the same WiFi or pocket WiFi shares one network, so leave room for a whole class."
              {...field("signupsPerNetwork")}
            />
          </div>
          <p className="text-sm text-muted">
            Feasto can only tell networks apart through the tunnel and on a cloud server. On the classroom laptop every phone looks the same to it, so
            there only the overall cap applies: 300 new accounts in 10 minutes across all of Feasto. Only accounts actually made are counted.
          </p>
        </div>
      </Card>
      </div>

      {/* Always in reach, above the bottom tabs on phones */}
      <div className="sticky bottom-[calc(var(--tabbar-h)+1rem+env(safe-area-inset-bottom))] z-10 flex justify-end">
        <Button type="submit" loading={saving} className="shadow-[0_12px_28px_-10px_rgba(210,70,0,0.6)]">
          Save settings
        </Button>
      </div>
    </form>
  );
}
