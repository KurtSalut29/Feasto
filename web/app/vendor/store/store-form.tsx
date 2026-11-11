"use client";

import { ArrowRight, Banknote, CalendarDays, Check, CircleCheck, Clock, CreditCard, Eye, FileCheck2, MapPin, MapPinned, Store, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { PAYMENT_OPTIONS, PaymentLogo, type PaymentOption } from "@/components/app/payment-brands";
import { StoreCover } from "@/components/app/store-card";
import { storeState } from "@/components/app/store-status";
import { LocationPicker } from "@/components/map/location-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { SwitchField } from "@/components/ui/switch-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import { formatTime } from "@/lib/format";
import { pinOf } from "@/lib/geo";
import { STORE_TYPE_LABEL, STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { OnlinePayment, StoreType } from "@/lib/types";
import { CoverPhotoField } from "./cover-photo-field";

export type StoreSettings = {
  name: string;
  description: string | null;
  address: string;
  storeType: StoreType;
  acceptsReservations: boolean;
  opensAt: string;
  closesAt: string;
  isTemporarilyClosed: boolean;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  acceptsCash: boolean;
  onlinePayments: OnlinePayment[];
};

const FORM_ID = "store-settings";
const WALLETS = PAYMENT_OPTIONS.filter((o) => o.group === "E-wallets");
const CARDS = PAYMENT_OPTIONS.filter((o) => o.group === "Cards");
const ONLINE_COUNT = WALLETS.length + CARDS.length;

/** The page's sections, for the "On this page" list */
const SECTIONS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "details", label: "Store details", Icon: Store },
  { id: "location", label: "Location", Icon: MapPinned },
  { id: "hours", label: "Opening hours", Icon: Clock },
  { id: "payments", label: "Payments", Icon: Wallet },
  { id: "reservations", label: "Table reservations", Icon: CalendarDays },
];

/** "08:00"–"21:00" -> 13 (hours), for the summary under the hours */
function hoursOpen(opensAt: string, closesAt: string) {
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const minutes = toMinutes(closesAt) - toMinutes(opensAt);
  return minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : null;
}

/** Roughly how the store's card looks on the residents' home page, updated as the vendor types. */
function Preview({ values }: { values: StoreSettings }) {
  const { open, label } = storeState(values);
  const online = PAYMENT_OPTIONS.filter((o) => o.value !== "COD" && values.onlinePayments.includes(o.value as OnlinePayment));
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="relative">
        <StoreCover imageUrl={values.imageUrl} className="aspect-[16/9]" />
        <span
          className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${
            open ? "bg-white text-emerald-700" : "bg-white/95 text-gray-700"
          }`}
        >
          <span aria-hidden className={`size-1.5 rounded-full ${open ? "bg-emerald-500" : "bg-gray-400"}`} />
          {open ? "Open" : label.split(" · ")[0]}
        </span>
      </div>
      <div className="p-3.5">
        <p className="truncate font-semibold text-ink">{values.name || "Your store name"}</p>
        <p className="text-xs text-muted">
          {STORE_TYPE_LABEL[values.storeType]} · {formatTime(values.opensAt)} – {formatTime(values.closesAt)}
        </p>
        {values.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{values.description}</p>}
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <MapPin className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-1">{values.address || "Your address"}</span>
        </p>
        {values.acceptsReservations && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
            <CalendarDays className="size-3.5" aria-hidden /> Takes bookings
          </span>
        )}
        <div className="mt-3 border-t border-line pt-2.5">
          <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">Pays with</p>
          <p className="flex flex-wrap items-center gap-1.5">
            {values.acceptsCash && (
              <span className="inline-flex h-6 items-center gap-1 rounded-md bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <Banknote className="size-3.5" aria-hidden />
                Cash
              </span>
            )}
            {online.map((o) => (
              <span key={o.value} title={o.name} className="flex h-6 w-10 items-center justify-center rounded-md bg-white ring-1 ring-line">
                {o.tile && <PaymentLogo file={o.tile} tint={o.brand} className="h-4 w-8" />}
                <span className="sr-only">{o.name}</span>
              </span>
            ))}
            {!values.acceptsCash && online.length === 0 && <span className="text-xs font-semibold text-red-700">No way to pay yet</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

/** One wallet or card the store can take: its logo on a tile, ticked when taken. */
function PaymentTile({ option, on, onToggle }: { option: PaymentOption; on: boolean; onToggle: () => void }) {
  const card = option.group === "Cards";
  return (
    <label
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-500 ${
        on ? "border-brand-500 ring-1 ring-brand-500" : "border-line hover:border-gray-300"
      }`}
    >
      <input type="checkbox" checked={on} onChange={onToggle} className="sr-only" />
      {card ? (
        // A small card face in the brand's colors
        <span aria-hidden className={`relative flex aspect-[1.586] flex-col justify-between bg-gradient-to-br p-2.5 text-white ${option.face} ${on ? "" : "opacity-55 grayscale"}`}>
          <span className="block h-3.5 w-5 rounded-[3px] bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500" />
          <span className="flex items-end justify-between gap-1">
            <span className="font-mono text-[10px] tracking-wider text-white/85">{option.number?.slice(-4)}</span>
            {option.card && <PaymentLogo file={option.card} tint="#ffffff" className="h-5 w-9" />}
          </span>
        </span>
      ) : (
        <span aria-hidden className={`flex h-16 items-center justify-center bg-white ${on ? "" : "opacity-55 grayscale"}`}>
          {option.tile && <PaymentLogo file={option.tile} tint={option.brand} className="h-7 w-16" />}
        </span>
      )}
      <span className={`flex items-center justify-between gap-2 border-t px-2.5 py-2 text-sm font-semibold ${on ? "border-brand-100 bg-brand-50 text-ink" : "border-line bg-canvas/60 text-muted"}`}>
        <span className="truncate">{option.name}</span>
        <span
          aria-hidden
          className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition ${on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white"}`}
        >
          {on && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </span>
    </label>
  );
}

/** A heading over a group of payment tiles, with one button to take or drop them all. */
function GroupHeading({ title, Icon, taken, options, onAll }: { title: string; Icon: LucideIcon; taken: number; options: PaymentOption[]; onAll: (on: boolean) => void }) {
  const all = taken === options.length;
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className="size-4 text-muted" aria-hidden />
        {title}
        <span className="text-xs font-medium text-muted">
          {taken} of {options.length}
        </span>
      </p>
      <button type="button" onClick={() => onAll(!all)} className="text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500">
        {all ? "Clear all" : "Take all"}
      </button>
    </div>
  );
}

export function StoreForm({ initial, permit, account }: { initial: StoreSettings; permit?: ReactNode; account?: ReactNode }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [savedValues, setSavedValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const dirty = JSON.stringify(values) !== JSON.stringify(savedValues);
  const hours = hoursOpen(values.opensAt, values.closesAt);
  const noPayment = !values.acceptsCash && values.onlinePayments.length === 0;

  function set<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setJustSaved(false);
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  function setOnline(methods: OnlinePayment[], on: boolean) {
    const next = on ? [...new Set([...values.onlinePayments, ...methods])] : values.onlinePayments.filter((m) => !methods.includes(m));
    // Keep Feasto's order, so the saved list doesn't depend on the order of the clicks
    set(
      "onlinePayments",
      PAYMENT_OPTIONS.map((o) => o.value).filter((m): m is OnlinePayment => m !== "COD" && next.includes(m)),
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (noPayment) {
      setError("Take at least one way to pay, so residents can order.");
      document.getElementById("payments")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSaving(true);
    setError(undefined);
    const result = await apiRequest("/vendor/store", { method: "PATCH", body: values });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? "Please fix the highlighted fields." : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      toast.error("Your store wasn't saved", result.fieldErrors ? "Some fields need fixing. They're marked in red." : result.error);
      return;
    }
    toast.success("Store saved", "Residents see the changes right away.");
    setSavedValues(values);
    setJustSaved(true);
    router.refresh();
  }

  const err = (k: keyof StoreSettings) => fieldErrors[k]?.[0];
  const sections = permit ? [...SECTIONS, { id: "permit", label: "Business permit", Icon: FileCheck2 }] : SECTIONS;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        {/* Below big screens: jump to a section */}
        <nav aria-label="On this page" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 xl:hidden">
          <ul className="flex w-max gap-2">
            {sections.map(({ id, label, Icon }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-medium whitespace-nowrap text-ink transition hover:border-gray-300 focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  <Icon className="size-4 text-muted" aria-hidden />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <form id={FORM_ID} onSubmit={save} noValidate className="space-y-6">
          <div id="details" className="scroll-mt-6">
            <Card title="Store details" description="What residents see on your store page." Icon={Store}>
              <div className="border-b border-line p-5">
                <CoverPhotoField value={values.imageUrl} onChange={(url) => set("imageUrl", url)} storeName={values.name} />
              </div>
              <div className="p-5">
                <div className="min-w-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField label="Store name" value={values.name} onChange={(e) => set("name", e.target.value)} error={err("name")} />
                    <SelectField
                      label="Store type"
                      placeholder="Choose the closest match"
                      options={STORE_TYPE_OPTIONS}
                      value={values.storeType}
                      onChange={(e) => set("storeType", e.target.value as StoreType)}
                      error={err("storeType")}
                    />
                  </div>
                  <TextareaField
                    label="Description"
                    value={values.description ?? ""}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="What makes your food special? e.g. Lutong bahay since 1998."
                    maxLength={300}
                    hint={`${(values.description ?? "").length} of 300 characters`}
                    error={err("description")}
                  />
                  <TextField
                    label="Address"
                    value={values.address}
                    onChange={(e) => set("address", e.target.value)}
                    autoComplete="street-address"
                    error={err("address")}
                  />
                </div>
              </div>
            </Card>
          </div>

          <div id="location" className="scroll-mt-6">
            <Card title="Location on the map" description="Riders use this pin to find you, and residents see how far you are." Icon={MapPinned}>
              <div className="p-5">
                <LocationPicker
                  value={pinOf(values.latitude, values.longitude)}
                  onChange={(at) => {
                    set("latitude", at.lat);
                    set("longitude", at.lng);
                  }}
                  label="Store pin"
                  hint="Move the map so the pin is on your store's entrance."
                  error={err("latitude")}
                />
              </div>
            </Card>
          </div>

          <div id="hours" className="scroll-mt-6">
            <Card title="Opening hours" description="Philippine time. Residents can only order while you're open." Icon={Clock}>
              <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-start">
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Opens" type="time" value={values.opensAt} onChange={(e) => set("opensAt", e.target.value)} error={err("opensAt")} />
                    <TextField label="Closes" type="time" value={values.closesAt} onChange={(e) => set("closesAt", e.target.value)} error={err("closesAt")} />
                  </div>
                  {hours !== null && (
                    <p className="mt-2 text-sm text-muted">
                      Open every day, {formatTime(values.opensAt)} – {formatTime(values.closesAt)}{" "}
                      <span className="font-semibold whitespace-nowrap text-ink">
                        ({hours} {hours === 1 ? "hour" : "hours"})
                      </span>
                    </p>
                  )}
                </div>
                <div className="md:pt-6">
                  <SwitchField
                    label="Temporarily closed"
                    description="Stop new orders, even during opening hours."
                    checked={values.isTemporarilyClosed}
                    onChange={(v) => set("isTemporarilyClosed", v)}
                  />
                </div>
              </div>
            </Card>
          </div>

          <div id="payments" className="scroll-mt-6">
            <Card
              title="Payments"
              description="Choose how residents can pay you. Online payments are simulated in this project; no real money moves."
              Icon={Wallet}
            >
              <div className="space-y-5 p-5">
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                    values.acceptsCash ? "border-emerald-300 bg-emerald-50/60" : "border-line"
                  }`}
                >
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${values.acceptsCash ? "bg-emerald-600 text-white" : "bg-canvas text-muted"}`}>
                    <Banknote className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">Cash</span>
                    <span className="block text-sm text-muted">Paid to the rider on delivery, or at your counter for pickup.</span>
                  </span>
                  <input type="checkbox" checked={values.acceptsCash} onChange={(e) => set("acceptsCash", e.target.checked)} className="sr-only" />
                  <span
                    aria-hidden
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${values.acceptsCash ? "bg-emerald-600" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition ${values.acceptsCash ? "translate-x-5" : ""}`} />
                  </span>
                </label>

                <fieldset>
                  <legend className="sr-only">E-wallets</legend>
                  <GroupHeading
                    title="E-wallets"
                    Icon={Wallet}
                    taken={WALLETS.filter((o) => values.onlinePayments.includes(o.value as OnlinePayment)).length}
                    options={WALLETS}
                    onAll={(on) => setOnline(WALLETS.map((o) => o.value as OnlinePayment), on)}
                  />
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                    {WALLETS.map((option) => (
                      <PaymentTile
                        key={option.value}
                        option={option}
                        on={values.onlinePayments.includes(option.value as OnlinePayment)}
                        onToggle={() => setOnline([option.value as OnlinePayment], !values.onlinePayments.includes(option.value as OnlinePayment))}
                      />
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="sr-only">Cards</legend>
                  <GroupHeading
                    title="Debit and credit cards"
                    Icon={CreditCard}
                    taken={CARDS.filter((o) => values.onlinePayments.includes(o.value as OnlinePayment)).length}
                    options={CARDS}
                    onAll={(on) => setOnline(CARDS.map((o) => o.value as OnlinePayment), on)}
                  />
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {CARDS.map((option) => (
                      <PaymentTile
                        key={option.value}
                        option={option}
                        on={values.onlinePayments.includes(option.value as OnlinePayment)}
                        onToggle={() => setOnline([option.value as OnlinePayment], !values.onlinePayments.includes(option.value as OnlinePayment))}
                      />
                    ))}
                  </div>
                </fieldset>

                <p
                  role="status"
                  className={`rounded-xl px-3.5 py-2.5 text-sm ${noPayment || err("onlinePayments") ? "bg-red-50 font-semibold text-red-700" : "bg-canvas text-muted"}`}
                >
                  {noPayment
                    ? "Take at least one way to pay, so residents can order."
                    : `Residents can pay with ${[values.acceptsCash ? "cash" : null, values.onlinePayments.length ? `${values.onlinePayments.length} of ${ONLINE_COUNT} online ways` : null]
                        .filter(Boolean)
                        .join(" and ")}. A cart with dishes from several stores only offers the ways every one of them takes.`}
                </p>
              </div>
            </Card>
          </div>

          <div id="reservations" className="scroll-mt-6">
            <Card title="Table reservations" description="Let residents book a table ahead of time." Icon={CalendarDays}>
              <div className="space-y-3 p-5">
                <SwitchField
                  label="Accepts table reservations"
                  description="Residents can book a table here."
                  checked={values.acceptsReservations}
                  onChange={(v) => set("acceptsReservations", v)}
                />
                {savedValues.acceptsReservations && (
                  <Link href="/vendor/reservations" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                    Set up your tables and see bookings
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                )}
              </div>
            </Card>
          </div>
        </form>

        {permit}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6">
        {/* On phones and tablets, unsaved changes keep Save in reach at the bottom of the screen */}
        <div
          className={`rounded-2xl border border-line bg-white p-4 ${
            dirty
              ? "max-xl:fixed max-xl:inset-x-3 max-xl:bottom-[calc(var(--tabbar-h)+0.75rem+env(safe-area-inset-bottom))] max-xl:z-30 max-xl:mx-auto max-xl:max-w-xl max-xl:shadow-[0_18px_40px_-12px_rgba(31,45,61,0.45)] xl:shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
              : justSaved
                ? "shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                : "shadow-[0_1px_2px_rgba(16,24,40,0.04)] max-xl:hidden"
          }`}
        >
          {error && (
            <div className="mb-3">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
          <p role="status" className="mb-3 flex items-center gap-2 text-sm">
            {dirty ? (
              <>
                <span aria-hidden className="size-2 rounded-full bg-amber-500" />
                <span className="font-medium text-ink">You have unsaved changes</span>
              </>
            ) : justSaved ? (
              <>
                <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                <span className="font-medium text-emerald-700">Saved</span>
              </>
            ) : (
              <span className="text-muted">Everything is up to date.</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 whitespace-nowrap"
              disabled={!dirty || saving}
              onClick={() => {
                setValues(savedValues);
                setFieldErrors({});
                setError(undefined);
              }}
            >
              Discard
            </Button>
            <Button type="submit" form={FORM_ID} loading={saving} disabled={!dirty} className="flex-1 whitespace-nowrap px-3">
              Save changes
            </Button>
          </div>
        </div>

        <nav aria-label="On this page" className="hidden rounded-2xl border border-line bg-white p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)] xl:block">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">On this page</p>
          <ul>
            {sections.map(({ id, label, Icon }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted transition hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                  {id === "payments" && noPayment && <span className="ml-auto size-2 rounded-full bg-red-500" aria-label="Needs attention" />}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Card title="Preview" description="Your card on the residents' home page" Icon={Eye}>
          <div className="bg-canvas/60 p-4">
            <Preview values={values} />
          </div>
        </Card>
        {account}
        {/* Room so the floating Save bar never covers the preview */}
        {dirty && <div aria-hidden className="h-32 xl:hidden" />}
      </aside>
    </div>
  );
}
