"use client";

import { Bike, Clock, Hourglass, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";

export type PlatformSettings = { deliveryFee: number; storeRiderSeconds: number; riderWaveSeconds: number; stuckMinutes: number };
type Key = keyof PlatformSettings;

const whenInWords = (seconds: number) => (seconds < 60 ? `${seconds} s` : seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`);

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
    storeRiderSeconds: String(initial.storeRiderSeconds),
    riderWaveSeconds: String(initial.riderWaveSeconds),
    stuckMinutes: String(initial.stuckMinutes),
  });
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
      body: { deliveryFee: number("deliveryFee"), storeRiderSeconds: number("storeRiderSeconds"), riderWaveSeconds: number("riderWaveSeconds"), stuckMinutes: number("stuckMinutes") },
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const storeSeconds = Number(values.storeRiderSeconds) || 0;
  const waveSeconds = Number(values.riderWaveSeconds) || 0;

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && !error && <Alert tone="success">Settings saved.</Alert>}

      <Card title="Delivery fee" Icon={Wallet} description="Charged per store in a checkout. Pickup stays free.">
        <div className="space-y-2 p-5">
          <TextField label="Delivery fee (₱)" step="0.01" min="0" icon={Wallet} className="sm:max-w-xs" hint="New checkouts use this. Orders already placed keep the fee they were placed with." {...field("deliveryFee")} />
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
