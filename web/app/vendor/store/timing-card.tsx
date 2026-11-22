"use client";

import { ChefHat, Clock, Route, ShoppingBasket, Timer } from "lucide-react";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";

type Timing = {
  timing: { prepMinutes: number; prepPer5Items: number; deliveryRadiusKm: number; largeOrderNoticeMinutes: number; minOrderAmount?: number | string };
  actual: { medianMinutes: number | null; orders: number; onTime: number; timed: number };
  largeOrder: { items: number; amount: number };
};

/**
 * How long the kitchen usually takes and how far the store delivers. Feasto uses these to tell
 * residents "about 25 min to cook" before they order and to pick the time when the store accepts.
 */
export function TimingCard() {
  const { data } = useApiData<Timing>("/vendor/store/timing");
  if (!data) {
    return (
      <Card title="Kitchen time and delivery distance" Icon={ChefHat}>
        <p className="px-5 py-4 text-sm text-muted">Loading…</p>
      </Card>
    );
  }
  return <TimingForm data={data} />;
}

function TimingForm({ data }: { data: Timing }) {
  const [values, setValues] = useState({
    prepMinutes: String(data.timing.prepMinutes),
    prepPer5Items: String(data.timing.prepPer5Items),
    deliveryRadiusKm: String(data.timing.deliveryRadiusKm),
    largeOrderNoticeMinutes: String(data.timing.largeOrderNoticeMinutes),
    minOrderAmount: String(Number(data.timing.minOrderAmount ?? 0)),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  type Key = keyof typeof values;
  const field = (name: Key) => ({
    name,
    type: "number" as const,
    inputMode: "numeric" as const,
    value: values[name],
    error: errors[name]?.[0],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });

  async function save() {
    setSaving(true);
    setErrors({});
    const number = (k: Key) => (values[k].trim() === "" ? null : Number(values[k]));
    const result = await apiRequest("/vendor/store/timing", {
      method: "PUT",
      body: { prepMinutes: number("prepMinutes"), prepPer5Items: number("prepPer5Items"), deliveryRadiusKm: number("deliveryRadiusKm"), largeOrderNoticeMinutes: number("largeOrderNoticeMinutes"), minOrderAmount: number("minOrderAmount") ?? 0 },
    });
    setSaving(false);
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      else toast.error("Couldn't save", result.error);
      return;
    }
    toast.success("Kitchen time saved", "Residents see the new time on their next order.");
  }

  const prep = Number(values.prepMinutes) || 0;
  const per5 = Number(values.prepPer5Items) || 0;
  const example = (items: number) => prep + Math.ceil(Math.max(0, items - 5) / 5) * per5;
  const { actual } = data;

  return (
    <Card
      title="Kitchen time and delivery distance"
      Icon={ChefHat}
      description="Residents see how long their order takes before they order. When you accept, Feasto picks this time for you, and you can change it."
    >
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <TextField label="Usual kitchen time (minutes)" min="5" icon={Clock} hint="5 to 180. For an order of up to 5 items." {...field("prepMinutes")} />
          <TextField label="More for every 5 items (minutes)" min="0" icon={Timer} hint="0 to 60. For a bigger order." {...field("prepPer5Items")} />
          <TextField label="Delivers up to (km by road)" step="0.5" min="1" icon={Route} hint="1 to 25. Farther addresses can still order for pickup." {...field("deliveryRadiusKm")} />
          <TextField
            label="Notice for a big order (minutes)"
            min="0"
            step="30"
            icon={ChefHat}
            hint={`0 for none, up to 2880. A big order is ${data.largeOrder.items}+ items or ${formatPeso(data.largeOrder.amount)}+. With notice, it must be scheduled at least this far ahead.`}
            {...field("largeOrderNoticeMinutes")}
          />
          <TextField
            label="Minimum order for delivery (₱)"
            min="0"
            step="10"
            icon={ShoppingBasket}
            hint="0 for none, up to ₱5,000. Smaller orders can still be picked up."
            {...field("minOrderAmount")}
          />
        </div>
        <div className="space-y-3">
          <ul className="grid grid-cols-3 gap-2 text-sm">
            {[3, 12, 50].map((n) => (
              <li key={n} className="rounded-xl bg-canvas px-3 py-2.5">
                <p className="text-muted">{n} items</p>
                <p className="font-semibold text-ink tabular-nums">{example(n)} min</p>
              </li>
            ))}
          </ul>
          <p className="rounded-xl bg-canvas px-3 py-2.5 text-sm text-ink">
            {actual.medianMinutes
              ? `In the last 30 days your kitchen usually took ${actual.medianMinutes} min from accepting to ready (${actual.orders} orders).`
              : "Once you've accepted a few orders, Feasto shows how long your kitchen really takes, to help you set this."}
            {actual.timed > 0 && ` Ready by the time you said: ${Math.round((actual.onTime / actual.timed) * 100)}% of ${actual.timed}.`}
          </p>
          <Button className="w-full sm:w-auto" loading={saving} onClick={save}>
            Save kitchen time
          </Button>
        </div>
      </div>
    </Card>
  );
}
