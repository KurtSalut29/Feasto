"use client";

import { Bike, Clock, Hourglass, Route, Sun, Wallet } from "lucide-react";
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
    <ol className="grid gap-2 sm:grid-cols-4">
      {steps.map((step) => (
        <li key={step.who} className="rounded-xl bg-canvas px-3 py-2.5">
          <p className="text-sm font-semibold text-ink tabular-nums">{step.at === 0 ? "Right away" : `After ${whenInWords(step.at)}`}</p>
          <p className="text-sm text-muted">{step.who}</p>
        </li>
      ))}
    </ol>
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
    <form onSubmit={submit} noValidate className="max-w-3xl space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && !error && <Alert tone="success">Settings saved.</Alert>}

      <Card
        title="Delivery fee"
        Icon={Wallet}
        description="Follows the distance by road from the store to the resident, like other food apps. Charged per store; pickup stays free. The rider earns the whole fee."
      >
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Base fee (₱)" step="0.01" min="0" icon={Wallet} hint="₱0 to ₱500. Covers the first kilometres." {...field("deliveryFee")} />
            <TextField label="Kilometres the base fee covers" step="0.5" min="0" icon={Route} hint="0 to 20 km, e.g. 2." {...field("deliveryBaseKm")} />
            <TextField label="Each extra km (₱)" step="0.01" min="0" icon={Route} hint="₱0 to ₱100. A started kilometre counts as one." {...field("deliveryPerKm")} />
            <TextField label="Rush-hour add-on (₱)" step="0.01" min="0" icon={Sun} hint="₱0 to ₱200. Added in the rush hours below, when riders are busiest. 0 turns it off." {...field("deliveryPeakFee")} />
          </div>
          <RushHoursEditor
            value={peakHours}
            onChange={(next) => {
              setSaved(false);
              setPeakHours(next);
            }}
            peakFee={Number(values.deliveryPeakFee) || 0}
            errors={fieldErrors.peakHours}
          />
          <FeeExamples
            base={Number(values.deliveryFee) || 0}
            baseKm={Number(values.deliveryBaseKm) || 0}
            perKm={Number(values.deliveryPerKm) || 0}
            peak={Number(values.deliveryPeakFee) || 0}
          />
          <p className="text-sm text-muted">New checkouts use these prices. Orders already placed keep the fee they were placed with.</p>
        </div>
      </Card>

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

      <Card title="Stuck orders" Icon={Hourglass} description="When an order counts as stuck and you get a notification.">
        <div className="p-5">
          <TextField label="Stuck after (minutes)" min="1" icon={Hourglass} className="sm:max-w-xs" hint="1 to 240. How long an order can wait for a store or rider." {...field("stuckMinutes")} />
        </div>
      </Card>

      <Button type="submit" loading={saving}>
        Save settings
      </Button>
    </form>
  );
}
