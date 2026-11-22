"use client";

import { Cake, Check, Coins, Copy, Gift, Medal, Share2, Target, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";

type Tier = "Bronze" | "Silver" | "Gold";
type Suki = {
  on: boolean;
  points: { balance: number; pending: number; value: number; pointValue: number; earnPer: number; minRedeem: number };
  tier: { name: Tier; multiplier: number; orders30: number; next: { name: Tier; at: number } | null };
  missions: { id: string; title: string; kind: "ORDERS" | "NEW_STORES" | "SPEND"; period: "WEEK" | "MONTH"; target: number; rewardPoints: number; progress: number; endsAt: string; done: boolean }[];
  referral: { code: string; points: number; invitedBy: string | null; canJoinWithCode: boolean; friends: { name: string; joinedAt: string; rewarded: boolean }[] };
  birthday: { date: string | null; points: number; needsId: boolean };
  history: { at: string; points: number; text: string; pending: boolean }[];
};

const card = "rounded-3xl border border-line bg-white p-5";
const TIER_LOOK: Record<Tier, string> = {
  Bronze: "bg-orange-100 text-orange-900 ring-orange-200",
  Silver: "bg-slate-100 text-slate-800 ring-slate-300",
  Gold: "bg-amber-100 text-amber-900 ring-amber-300",
};
const num = (n: number) => n.toLocaleString("en-PH");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
const ends = (iso: string) => new Date(new Date(iso).getTime() - 1).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" });

/** The resident's Suki: points, tier, missions, inviting friends, birthday and history */
export function SukiView() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<Suki>("/loyalty", reload);
  if (!data) return <div className="h-72 animate-pulse rounded-3xl bg-canvas" />;
  if (!data.on) return <EmptyState Icon={Coins} title="Suki points are off for now" text="Feasto turned them off for a while. Your points are kept." />;
  const again = () => setReload((n) => n + 1);
  const { points, tier } = data;
  const toNext = tier.next ? Math.min(100, (tier.orders30 / tier.next.at) * 100) : 100;

  return (
    <div className="space-y-4">
      <section aria-labelledby="balance" className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white">
        <p id="balance" className="flex items-center gap-2 text-sm font-semibold text-white/85">
          <Coins className="size-4" aria-hidden />
          Your points
        </p>
        <p className="mt-1 text-4xl font-extrabold tabular-nums">{num(points.balance)}</p>
        <p className="text-sm text-white/90">
          Worth {formatPeso(points.value)} off
          {points.pending > 0 && ` · +${num(points.pending)} on the way`}
        </p>
        <p className="mt-3 rounded-2xl bg-white/12 px-3 py-2 text-sm text-white/95">
          1 point for every {formatPeso(points.earnPer)} of food. {num(points.minRedeem)} points = {formatPeso(Math.round(points.minRedeem * points.pointValue * 100) / 100)} off at checkout.
        </p>
      </section>

      <section aria-labelledby="tier" className={card}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="tier" className="flex items-center gap-2 font-semibold text-ink">
            <Medal className="size-5 text-brand-600" aria-hidden />
            Your tier
          </h2>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${TIER_LOOK[tier.name]}`}>{tier.name}</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          {tier.orders30} {tier.orders30 === 1 ? "order" : "orders"} in the last 30 days{tier.multiplier > 1 ? `: you earn ${tier.multiplier}× points` : ""}.
          {tier.next ? ` ${tier.next.at - tier.orders30} more for ${tier.next.name} (${tier.next.name === "Gold" ? "1.5" : "1.25"}× points).` : " That's the top tier."}
        </p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label={`Progress to ${tier.next?.name ?? "the top tier"}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(toNext)}>
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${toNext}%` }} />
        </div>
      </section>

      <section aria-labelledby="missions" className={card}>
        <h2 id="missions" className="flex items-center gap-2 font-semibold text-ink">
          <Target className="size-5 text-brand-600" aria-hidden />
          Missions
        </h2>
        {data.missions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No missions right now. Check back soon.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.missions.map((m) => {
              const shown = m.kind === "SPEND" ? `${formatPeso(m.progress)} of ${formatPeso(m.target)}` : `${m.progress} of ${m.target}`;
              return (
                <li key={m.id} className="rounded-2xl border border-line p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-medium text-ink">{m.title}</p>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200">+{num(m.rewardPoints)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label={m.title} aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={m.progress}>
                    <div className={`h-full rounded-full ${m.done ? "bg-emerald-600" : "bg-brand-600"}`} style={{ width: `${Math.min(100, (m.progress / m.target) * 100)}%` }} />
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                    {m.done ? (
                      <>
                        <Check className="size-3.5 text-emerald-700" aria-hidden />
                        <span className="font-semibold text-emerald-800">Done: points added</span>
                      </>
                    ) : (
                      <>
                        {shown} · ends {ends(m.endsAt)}
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Invite data={data} onChange={again} />
      <Birthday data={data} onChange={again} />

      <section aria-labelledby="history" className={card}>
        <h2 id="history" className="font-semibold text-ink">
          History
        </h2>
        {data.history.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Your points show here after your first order.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {data.history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block text-ink">{h.text}</span>
                  <span className="block text-xs text-muted">
                    {day(h.at)}
                    {h.pending && " · counted once it arrives"}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${h.points < 0 ? "text-ink" : h.pending ? "text-muted" : "text-emerald-700"}`}>
                  {h.points > 0 ? "+" : "−"}
                  {num(Math.abs(h.points))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Invite({ data, onChange }: { data: Suki; onChange: () => void }) {
  const { referral } = data;
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const message = `Order food in Naval with Feasto! Use my code ${referral.code} when you sign up, and we both get ${referral.points} points after your first order.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(referral.code);
      toast.success("Code copied", referral.code);
    } catch {
      toast.error("Couldn't copy", "Hold the code to copy it.");
    }
  }
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Feasto", text: message });
      } catch {
        // Closed the share sheet
      }
    } else void copy();
  }
  async function join(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const result = await apiRequest<{ inviter: string }>("/loyalty/referral", { method: "POST", body: { code } });
    setBusy(false);
    if (!result.ok) return result.fieldErrors ? setErrors(result.fieldErrors) : void toast.error("Couldn't add it", result.error);
    toast.success(`Joined with ${result.data.inviter}'s code`, "You both get points once your first order arrives.");
    onChange();
  }

  return (
    <section aria-labelledby="invite" className={card}>
      <h2 id="invite" className="flex items-center gap-2 font-semibold text-ink">
        <Users className="size-5 text-brand-600" aria-hidden />
        Invite friends
      </h2>
      <p className="mt-1 text-sm text-muted">
        When a friend signs up with your code and their first order arrives, you both get {num(referral.points)} points. Up to 10 friends a month.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-xl bg-canvas px-4 py-2.5 font-mono text-lg font-bold tracking-widest text-ink">{referral.code}</span>
        <Button variant="secondary" onClick={copy}>
          <Copy className="size-4" aria-hidden />
          Copy
        </Button>
        <Button onClick={share}>
          <Share2 className="size-4" aria-hidden />
          Share
        </Button>
      </div>
      {referral.friends.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {referral.friends.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3">
              <span className="text-ink">{f.name}</span>
              <span className={f.rewarded ? "font-semibold text-emerald-700" : "text-muted"}>{f.rewarded ? `+${num(referral.points)} points` : "Waiting for their first order"}</span>
            </li>
          ))}
        </ul>
      )}
      {referral.invitedBy && <p className="mt-3 text-sm text-muted">You joined with {referral.invitedBy}&apos;s code.</p>}
      {referral.canJoinWithCode && (
        <form onSubmit={join} className="mt-4 flex items-end gap-2 border-t border-line pt-4">
          <div className="min-w-0 flex-1">
            <TextField label="Got a friend's code?" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. ROSA7K2P" error={errors.code?.[0]} />
          </div>
          <Button type="submit" loading={busy} disabled={code.trim().length < 4}>
            Add
          </Button>
        </form>
      )}
    </section>
  );
}

function Birthday({ data, onChange }: { data: Suki; onChange: () => void }) {
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const { birthday } = data;

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const result = await apiRequest("/loyalty/birthday", { method: "PUT", body: { date } });
    setBusy(false);
    if (!result.ok) return result.fieldErrors ? setErrors(result.fieldErrors) : void toast.error("Couldn't save it", result.error);
    toast.success("Birthday saved", "Your gift comes in your birthday week.");
    onChange();
  }

  return (
    <section aria-labelledby="bday" className={card}>
      <h2 id="bday" className="flex items-center gap-2 font-semibold text-ink">
        <Cake className="size-5 text-brand-600" aria-hidden />
        Birthday gift
      </h2>
      {birthday.date ? (
        <p className="mt-1 text-sm text-muted">
          <Gift className="mr-1 inline size-4 text-brand-600" aria-hidden />
          {num(birthday.points)} points come in your birthday week ({new Date(`${birthday.date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", day: "numeric", timeZone: "UTC" })}).
          {birthday.needsId && " Your ID needs to be verified first."}
        </p>
      ) : (
        <form onSubmit={save} className="mt-2 space-y-3">
          <p className="text-sm text-muted">
            Add your birthday for {num(birthday.points)} points in your birthday week. It can be set once{birthday.needsId ? ", and the gift needs a verified ID" : ""}.
          </p>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextField label="Your birthday" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date?.[0]} />
            </div>
            <Button type="submit" loading={busy} disabled={!date}>
              Save
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
