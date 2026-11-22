"use client";

import { AlertTriangle, KeyRound, Minus, PackageOpen, PencilLine, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ui/image-upload";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatDateTime, formatPeso } from "@/lib/format";
import type { Address, OrderIssue } from "@/lib/types";

/** The 4-digit PIN the resident tells the rider at the door (big deliveries only) */
export function DoorPin({ pin }: { pin: string }) {
  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-800">
        <KeyRound className="size-4" aria-hidden />
        Your PIN for the rider
      </p>
      <p className="mt-1 font-mono text-[2rem] leading-none font-bold tracking-[0.3em] text-ink" aria-label={`PIN ${pin.split("").join(" ")}`}>
        {pin}
      </p>
      <p className="mt-2 text-[0.8125rem] text-muted">It&apos;s a big order, so the rider asks for this before handing it over. Tell it only to the rider at your door, never on the phone or in chat.</p>
    </section>
  );
}

type EditItem = { id: string; name: string; quantity: number; unitPrice: string; removedAt?: string | null };

/** Change how many of each dish, or the address, before the store accepts (cash, no discounts) */
export function EditOrder({ orderId, items, delivery, deliveryFee }: { orderId: string; items: EditItem[]; delivery: boolean; deliveryFee: number }) {
  const router = useRouter();
  const live = items.filter((i) => !i.removedAt);
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(live.map((i) => [i.id, i.quantity])));
  const [addressId, setAddressId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { data } = useApiData<{ addresses: Address[] }>(open && delivery ? "/me/addresses" : null);
  const food = live.reduce((n, i) => n + Number(i.unitPrice) * (counts[i.id] ?? 0), 0);
  const changed = live.some((i) => counts[i.id] !== i.quantity) || addressId !== "";

  async function save() {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest<{ total: number }>(`/orders/${orderId}`, {
      method: "PATCH",
      body: { items: live.filter((i) => counts[i.id] !== i.quantity).map((i) => ({ id: i.id, quantity: counts[i.id] })), addressId: addressId || undefined },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    toast.success("Order changed", `The store sees the change. New total ${formatPeso(result.data.total)}.`);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        <PencilLine className="size-[18px]" aria-hidden />
        Change order
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Change your order" description="You can change it until the store accepts it.">
        <ul className="space-y-2">
          {live.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <span className="min-w-0">
                <span className={`block truncate text-[0.9375rem] font-medium ${counts[i.id] ? "text-ink" : "text-muted line-through"}`}>{i.name}</span>
                <span className="text-[0.8125rem] text-muted">{formatPeso(Number(i.unitPrice))} each</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`One less ${i.name}`}
                  disabled={!counts[i.id]}
                  onClick={() => setCounts((c) => ({ ...c, [i.id]: Math.max(0, (c[i.id] ?? 0) - 1) }))}
                  className="tap flex size-9 items-center justify-center rounded-full border border-line text-ink hover:bg-canvas disabled:opacity-40"
                >
                  <Minus className="size-4" aria-hidden />
                </button>
                <span className="w-7 text-center font-semibold tabular-nums" aria-live="polite">
                  {counts[i.id] ?? 0}
                </span>
                <button
                  type="button"
                  aria-label={`One more ${i.name}`}
                  disabled={(counts[i.id] ?? 0) >= 50}
                  onClick={() => setCounts((c) => ({ ...c, [i.id]: (c[i.id] ?? 0) + 1 }))}
                  className="tap flex size-9 items-center justify-center rounded-full border border-line text-ink hover:bg-canvas disabled:opacity-40"
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
        {delivery && data && data.addresses.length > 1 && (
          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-ink">Deliver to</span>
            <select value={addressId} onChange={(e) => setAddressId(e.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[0.9375rem] text-ink">
              <option value="">Keep the same address</option>
              {data.addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}: {a.details}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[0.8125rem] text-muted">A new address can change the delivery fee.</span>
          </label>
        )}
        <p className="mt-4 flex justify-between text-[0.9375rem] font-semibold text-ink">
          <span>Food</span>
          <span className="tabular-nums">{formatPeso(food)}</span>
        </p>
        {delivery && <p className="text-[0.8125rem] text-muted">Plus the delivery fee ({formatPeso(deliveryFee)} now).</p>}
        {error && (
          <div className="mt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button loading={busy} disabled={!changed || food <= 0} onClick={save}>
            Save changes
          </Button>
        </div>
      </Dialog>
    </>
  );
}

const KINDS: { value: OrderIssue["kind"]; label: string }[] = [
  { value: "MISSING_ITEM", label: "Something was missing" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "DAMAGED", label: "Spilled or damaged" },
  { value: "COLD_OR_LATE", label: "Cold or very late" },
  { value: "OTHER", label: "Something else" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<OrderIssue["kind"], string>;

/** "Something's wrong with my order": report it with a photo, see the answer, ask Feasto if the store said no */
export function OrderIssues({ orderId, items, issues, until, storeName, cash }: { orderId: string; items: EditItem[]; issues: OrderIssue[]; until: string | null; storeName: string; cash: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<OrderIssue["kind"]>("MISSING_ITEM");
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [now] = useState(() => Date.now());
  const canReport = until !== null && new Date(until).getTime() > now && !issues.some((i) => i.status === "OPEN") && issues.length < 2;
  const live = items.filter((i) => !i.removedAt);

  async function send() {
    setBusy(true);
    setError(undefined);
    setFieldErrors({});
    const result = await apiRequest(`/orders/${orderId}/issues`, { method: "POST", body: { kind, itemIds: picked, note, photoUrl: photo ?? "" } });
    setBusy(false);
    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      return setError(result.fieldErrors ? undefined : result.error);
    }
    setOpen(false);
    toast.success("Sent to the store", `${storeName} answers first. You'll get a notification.`);
    router.refresh();
  }

  async function escalate(id: string) {
    const result = await apiRequest(`/orders/${orderId}/issues/${id}/escalate`, { method: "POST" });
    if (!result.ok) return toast.error("Couldn't send it", result.error);
    toast.success("Sent to Feasto", "The admin looks at it and decides. You'll get a notification.");
    router.refresh();
  }

  if (!issues.length && !canReport) return null;
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wider text-gray-500 uppercase">Problem with this order</h2>
      <ul className="space-y-3">
        {issues.map((i) => (
          <li key={i.id} className="rounded-xl bg-canvas px-3 py-2.5 text-[0.9375rem]">
            <p className="font-semibold text-ink">{KIND_LABEL[i.kind]}</p>
            <p className="text-muted">“{i.note}”</p>
            {i.status === "OPEN" && <p className="mt-1 text-sm font-medium text-amber-800">{i.escalatedAt ? "Feasto is looking at it." : `Waiting for ${storeName} to answer.`}</p>}
            {i.status === "RESOLVED" && (
              <p className="mt-1 text-sm font-medium text-emerald-700">
                {i.given === "credit" ? `${formatPeso(Number(i.amount))} given back as Suki points (use them on your next order).` : `${formatPeso(Number(i.amount))} refunded to how you paid.`}
                {i.answer && <span className="block font-normal text-muted">“{i.answer}”</span>}
              </p>
            )}
            {i.status === "REJECTED" && (
              <div className="mt-1 text-sm">
                <p className="font-medium text-red-700">
                  {i.escalatedAt ? "Feasto" : storeName} said no: “{i.answer}”
                </p>
                {!i.escalatedAt && (
                  <button type="button" onClick={() => escalate(i.id)} className="tap mt-1 font-semibold text-brand-700 hover:underline">
                    Not fair? Ask Feasto to look
                  </button>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-muted">Sent {formatDateTime(i.createdAt)}</p>
          </li>
        ))}
      </ul>
      {canReport && (
        <>
          <Button variant="secondary" className={`w-full ${issues.length ? "mt-3" : ""}`} onClick={() => setOpen(true)}>
            <AlertTriangle className="size-[18px]" aria-hidden />
            Something wrong with your order?
          </Button>
          <p className="mt-2 text-center text-xs text-muted">You can report it until {formatDateTime(until!)}.</p>
        </>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="What went wrong?" description={`${storeName} answers first. ${cash ? "Paid in cash, what's given back comes as Suki points." : "Paid online, it's refunded to how you paid."}`}>
        <fieldset>
          <legend className="sr-only">What went wrong</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <label key={k.value} className={`tap cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium has-focus-visible:ring-4 has-focus-visible:ring-brand-500/20 ${kind === k.value ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-ink hover:bg-canvas"}`}>
                <input type="radio" name="issue-kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>
        {live.length > 1 && (
          <fieldset className="mt-4">
            <legend className="mb-1 text-sm font-medium text-ink">Which dishes? (leave empty for the whole order)</legend>
            <div className="space-y-1">
              {live.map((i) => (
                <label key={i.id} className="flex cursor-pointer items-center gap-2 text-[0.9375rem] text-ink">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={picked.includes(i.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))} />
                  {i.quantity}× {i.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="mt-4">
          <TextareaField label="What happened?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="e.g. The rice was missing, and the soup spilled in the bag." error={fieldErrors.note?.[0]} />
        </div>
        <div className="mt-4">
          <ImageUpload label="Photo of it" value={photo} onChange={setPhoto} />
          {fieldErrors.photoUrl?.[0] && <p className="mt-1 text-[0.8125rem] text-red-600">{fieldErrors.photoUrl[0]}</p>}
        </div>
        {error && (
          <div className="mt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={send}>
            <PackageOpen className="size-[18px]" aria-hidden />
            Send to the store
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
