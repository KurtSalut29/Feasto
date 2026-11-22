"use client";

import { BadgePercent, Bike, CalendarDays, Check, CircleAlert, Crown, LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";

type Plus = {
  on: boolean;
  price: number;
  freeDeliveries: number;
  deliveryMax: number;
  minSpend: number;
  member: { startsAt: string; endsAt: string; used: number; left: number } | null;
  nextMonth: { startsAt: string; endsAt: string } | null;
  pending: { id: string; paymentUrl: string } | null;
  history: { startsAt: string | null; endsAt: string | null; amount: number; paidChannel: string | null }[];
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

/** Feasto Plus: what it gives, the resident's month, and joining (with the return from Xendit's page) */
export function PlusView({ payment, result }: { payment: string | null; result: string | null }) {
  const router = useRouter();
  const [reload, setReload] = useState(0);
  const { data } = useApiData<Plus>("/plus", reload);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(Boolean(payment));

  // Back from Xendit: ask until the payment is known (paid, failed or still waiting)
  useEffect(() => {
    if (!payment) return;
    let tries = 0;
    let stop = false;
    const ask = async () => {
      const r = await apiRequest<{ status: string }>(`/plus/payment/${payment}`);
      if (stop) return;
      if (r.ok && r.data.status === "ACTIVE") {
        toast.success("Welcome to Feasto Plus!", "Your free deliveries are on.");
        setChecking(false);
        setReload((n) => n + 1);
        router.replace("/resident/plus");
      } else if ((r.ok && r.data.status === "FAILED") || tries++ > 10) {
        setChecking(false);
        if (result === "failed" || (r.ok && r.data.status === "FAILED")) toast.error("Not paid", "Nothing was charged. You can try again.");
        router.replace("/resident/plus");
      } else setTimeout(ask, 2500);
    };
    void ask();
    return () => {
      stop = true;
    };
  }, [payment, result, router]);

  if (!data) return <div className="h-72 animate-pulse rounded-3xl bg-canvas" />;

  async function join() {
    setBusy(true);
    const r = await apiRequest<{ paymentUrl: string | null }>("/plus/join", { method: "POST", body: {} });
    if (!r.ok) {
      setBusy(false);
      return void toast.error("Couldn't start it", r.error);
    }
    if (r.data.paymentUrl) window.location.href = r.data.paymentUrl;
    else {
      setBusy(false);
      toast.success("Feasto Plus is on", "Your free deliveries start now.");
      setReload((n) => n + 1);
    }
  }

  const perks = [
    { Icon: Bike, title: `${data.freeDeliveries} free deliveries a month`, text: `Up to ${formatPeso(data.deliveryMax)} each, on food from ${formatPeso(data.minSpend)}. It comes on by itself at checkout.` },
    { Icon: BadgePercent, title: "Members-only vouchers", text: "Extra vouchers on sale days, in My vouchers." },
    { Icon: Sparkles, title: "Riders still get their whole fee", text: "Feasto pays for your free delivery, not the rider or the store." },
  ];

  return (
    <div className="space-y-4">
      {checking && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-canvas px-4 py-3 text-sm text-ink">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Checking your payment…
        </p>
      )}

      <section aria-labelledby="plus-card" className="overflow-hidden rounded-3xl bg-gradient-to-br from-ink to-gray-800 p-5 text-white">
        <p id="plus-card" className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <Crown className="size-4" aria-hidden />
          Feasto Plus
        </p>
        {data.member ? (
          <>
            <p className="mt-1 text-2xl font-extrabold">You&apos;re a member</p>
            <p className="text-sm text-white/85">Until {day(data.member.endsAt)}</p>
            <div className="mt-3 rounded-2xl bg-white/10 p-3">
              <p className="text-sm text-white/90">
                {data.member.left} of {data.freeDeliveries} free deliveries left this month
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Free deliveries used" aria-valuemin={0} aria-valuemax={data.freeDeliveries} aria-valuenow={data.member.used}>
                <div className="h-full rounded-full bg-amber-300" style={{ width: `${data.freeDeliveries ? (data.member.used / data.freeDeliveries) * 100 : 0}%` }} />
              </div>
            </div>
            {data.nextMonth && <p className="mt-2 text-sm text-white/85">Next month paid: {day(data.nextMonth.startsAt)} to {day(data.nextMonth.endsAt)}</p>}
          </>
        ) : (
          <>
            <p className="mt-1 text-3xl font-extrabold">
              {formatPeso(data.price)}
              <span className="text-base font-semibold text-white/80"> / month</span>
            </p>
            <p className="text-sm text-white/85">Paid online once a month. No auto-renew: you choose each month.</p>
          </>
        )}
      </section>

      <ul className="space-y-2">
        {perks.map(({ Icon, title, text }) => (
          <li key={title} className="flex gap-3 rounded-2xl border border-line bg-white p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-ink">{title}</span>
              <span className="block text-sm text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>

      {data.on ? (
        <div className="space-y-2">
          {data.pending && (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                A payment page is still open.{" "}
                <a href={data.pending.paymentUrl} className="tap font-semibold underline">
                  Finish paying
                </a>
              </span>
            </p>
          )}
          <Button className="w-full" loading={busy} onClick={join}>
            {data.member ? <CalendarDays className="size-4" aria-hidden /> : <Crown className="size-4" aria-hidden />}
            {data.member ? `Add another month · ${formatPeso(data.price)}` : `Join for ${formatPeso(data.price)}`}
          </Button>
          <p className="text-center text-xs text-muted">You pay on Xendit&apos;s secure page (GCash, Maya, cards). Your month starts once it&apos;s paid.</p>
        </div>
      ) : (
        <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-muted">Feasto Plus isn&apos;t open to new members right now. Members keep their month.</p>
      )}

      {data.history.length > 0 && (
        <section aria-labelledby="plus-history" className="rounded-3xl border border-line bg-white p-5">
          <h2 id="plus-history" className="font-semibold text-ink">
            Your months
          </h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {data.history.map((h, i) => (
              <li key={`${h.startsAt}-${i}`} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2 text-ink">
                  <Check className="size-4 text-emerald-600" aria-hidden />
                  {h.startsAt ? day(h.startsAt) : "—"} to {h.endsAt ? day(h.endsAt) : "—"}
                </span>
                <span className="text-muted tabular-nums">{formatPeso(h.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
