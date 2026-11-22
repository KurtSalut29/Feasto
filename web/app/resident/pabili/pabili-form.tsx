"use client";

import {
  LoaderCircle,
  ScanText,
  Apple,
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  Clock,
  Croissant,
  Droplets,
  Ellipsis,
  Fish,
  Flame,
  Hammer,
  MapPin,
  PawPrint,
  PencilRuler,
  Pill,
  Plus,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  TriangleAlert,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DocumentPicker, documentBody } from "@/components/app/document-upload";
import { RiderPicker, type ChoosableRider } from "@/components/app/rider-picker";
import { useApiData } from "@/components/app/use-api-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { SwitchField } from "@/components/ui/switch-field";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import {
  BANNED_WHY,
  DEFAULT_UNIT,
  EXAMPLE,
  IF_MISSING,
  RULE_TEXT,
  rulesIn,
  UNIT_LABEL,
  UNITS,
  type IfMissing,
  type RestrictRule,
  type ShopCategory,
  type Term,
  type Unit,
} from "@/lib/pabili";
import type { Address } from "@/lib/types";

type Item = { key: number; name: string; quantity: string; unit: Unit; note: string; estimate: string; ifMissing: IfMissing; replacement: string; prescription: boolean };
type Shop = { id: string; name: string; category: ShopCategory; barangay: string | null; landmark: string; hours: string | null; onFeasto: { id: string; name: string } | null };
type Rules = { terms: Term[]; liquorBan: boolean; categories: Record<ShopCategory, string>; me: { idVerified: boolean; hasBirthDate: boolean; adult: boolean | null }; listReader?: boolean };
type ReadLine = { name: string; quantity: number; unit: Unit; note: string | null; estimate: number | null };

let nextKey = 1;
const blankItem = (unit: Unit = "pc"): Item => ({ key: nextKey++, name: "", quantity: "1", unit, note: "", estimate: "", ifMissing: "CALL", replacement: "", prescription: false });

const CATEGORY_ICON: Record<ShopCategory, LucideIcon> = {
  GROCERY: ShoppingCart,
  SARI_SARI: Store,
  MARKET: Fish,
  RICE: Wheat,
  BAKERY: Croissant,
  PHARMACY: Pill,
  HARDWARE: Hammer,
  SCHOOL_SUPPLIES: PencilRuler,
  WATER: Droplets,
  LPG: Flame,
  AGRI_PET: PawPrint,
  PERSONAL_CARE: Sparkles,
  GADGETS: Smartphone,
  FRUITS: Apple,
  OTHER: Ellipsis,
};
const CATEGORY_ORDER: ShopCategory[] = ["MARKET", "GROCERY", "SARI_SARI", "PHARMACY", "RICE", "BAKERY", "FRUITS", "WATER", "LPG", "HARDWARE", "SCHOOL_SUPPLIES", "AGRI_PET", "PERSONAL_CARE", "GADGETS", "OTHER"];
/** Short names for the grid; the full one is in the list's heading */
const SHORT: Record<ShopCategory, string> = {
  MARKET: "Palengke",
  GROCERY: "Grocery",
  SARI_SARI: "Sari-sari",
  PHARMACY: "Botika",
  RICE: "Bigasan",
  BAKERY: "Bakery",
  FRUITS: "Fruits",
  WATER: "Water",
  LPG: "LPG",
  HARDWARE: "Hardware",
  SCHOOL_SUPPLIES: "School supplies",
  AGRI_PET: "Agri and pets",
  PERSONAL_CARE: "Personal care",
  GADGETS: "Gadgets",
  OTHER: "Other",
};

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`pabili-${n}`} className="rounded-2xl border border-line bg-white p-4">
      <h2 id={`pabili-${n}`} className="mb-3 flex items-center gap-2 font-semibold text-ink">
        <span className="flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white" aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const money = (v: string) => (Number(v) > 0 ? Number(v) : 0);

/**
 * Asking for a Pabili: the kind of shop, then a shop from Feasto's list of Naval shops (or one
 * that isn't listed yet), the list with how much of each and in what unit, the details, a
 * guess at the price and what to do if it's not there; then the budget (from the guesses),
 * where to bring it and, if they like, which rider. Things that can't be bought are pointed out
 * while typing; medicine with a prescription needs its photo, and alcohol or cigarettes a
 * verified adult.
 */
export function PabiliForm({ addresses, budgetMax, prepaidMax, waitMinutes }: { addresses: Address[]; budgetMax: number; prepaidMax: number; waitMinutes: number }) {
  const router = useRouter();
  const { data: rules } = useApiData<Rules>("/errands/rules");
  const [category, setCategory] = useState<ShopCategory | null>(null);
  const { data: shopList } = useApiData<{ shops: Shop[]; counts: Partial<Record<ShopCategory, number>> }>(category ? `/errands/shops?category=${category}` : "/errands/shops");
  const [shopId, setShopId] = useState<string | "other" | null>(null);
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [notes, setNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [budgetTouched, setBudgetTouched] = useState(false);
  // Paid online first: needed above the cash limit, or chosen
  const [chosePayOnline, setChosePayOnline] = useState(false);
  const [prescription, setPrescription] = useState<File | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
  const [rider, setRider] = useState<ChoosableRider | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const home = addresses.find((a) => a.id === addressId);
  const near = home?.latitude != null && home.longitude != null ? { lat: home.latitude, lng: home.longitude } : null;
  const { data: quote } = useApiData<{ min: number; max: number; maxKm: number; busyFee: number; busy: string | null; rainFee: number }>("/errands/quote");
  const shops = shopList?.shops ?? [];
  const shop = shops.find((s) => s.id === shopId) ?? null;
  const typed = shopId === "other";

  // The same check the server runs, while typing
  const terms = rules?.terms;
  const flags = useMemo(
    () =>
      items.map((i) => {
        const found = terms ? rulesIn([i.name, i.note, i.ifMissing === "REPLACE" ? i.replacement : ""].join(" "), terms) : [];
        const banned = found.find((t) => t.rule === "BANNED");
        const ruleSet = new Set<RestrictRule>(found.map((t) => t.rule));
        if (i.prescription) ruleSet.add("PRESCRIPTION");
        return { banned: banned?.term ?? null, rules: [...ruleSet].filter((r) => r !== "BANNED") as Exclude<RestrictRule, "BANNED">[] };
      }),
    [items, terms],
  );
  const notesBanned = terms && notes ? (rulesIn(notes, terms).find((t) => t.rule === "BANNED")?.term ?? null) : null;
  const needsPrescription = flags.some((f) => f.rules.includes("PRESCRIPTION"));
  const alcohol = flags.some((f) => f.rules.includes("ALCOHOL"));
  const adult = alcohol || flags.some((f) => f.rules.includes("TOBACCO"));
  const anyBanned = flags.some((f) => f.banned) || Boolean(notesBanned) || (alcohol && rules?.liquorBan);
  const shopCategory = typed ? category : (shop?.category ?? null);

  const estimate = items.reduce((sum, i) => sum + (i.name.trim() ? money(i.estimate) : 0), 0);
  // The budget follows the estimates (rounded up to ₱10) until it's typed in
  const shownBudget = budgetTouched ? budget : estimate > 0 ? String(Math.ceil(estimate / 10) * 10) : budget;
  const spend = Number(shownBudget) || 0;
  const most = `₱${budgetMax.toLocaleString("en-PH")}`;
  const mostOnline = `₱${prepaidMax.toLocaleString("en-PH")}`;
  const mustPayOnline = spend > budgetMax && spend <= prepaidMax;
  const payOnline = chosePayOnline || mustPayOnline;
  const overLimit =
    spend > prepaidMax
      ? `${prepaidMax > budgetMax ? mostOnline : most} is the most for one Pabili${prepaidMax > budgetMax ? ", paid online" : ", because the rider pays at the shop with their own money"}. Lower the budget, or split your list into two Pabili.`
      : undefined;
  const underEstimate = estimate > 0 && spend > 0 && spend < estimate ? `Your estimates add up to ${formatPeso(estimate)}. Raise the budget to at least that.` : undefined;

  const update = (key: number, change: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)));
  const err = (name: string) => fieldErrors[name]?.[0];

  function chooseCategory(next: ShopCategory) {
    setCategory(next);
    setShopId(null);
    // Empty lines take the usual unit of this kind of shop (kg at the palengke)
    setItems((list) => list.map((i) => (i.name.trim() ? i : { ...i, unit: DEFAULT_UNIT[next] })));
    setFieldErrors((e) => ({ ...e, shopId: undefined, shopCategory: undefined }));
  }

  // A list read from a photo, PDF or Word file: its lines go in the form, to check before sending
  const [readingList, setReadingList] = useState(false);
  const [listNote, setListNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  async function readListFile(file: File) {
    setReadingList(true);
    setListNote(null);
    try {
      const docx = file.name.toLowerCase().endsWith(".docx");
      const pdf = file.type === "application/pdf";
      const body = docx || pdf ? file : await documentBody(file);
      const type = docx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : pdf ? "application/pdf" : "image/jpeg";
      const response = await fetch("/api/errands/read-list", { method: "POST", headers: { "Content-Type": type }, body });
      const data = await response.json().catch(() => null);
      if (!response.ok) return setListNote({ tone: "error", text: data?.error ?? "The list couldn't be read. Type the items instead." });
      const read = (data.items as ReadLine[]).map((l) => ({ ...blankItem(l.unit), name: l.name, quantity: String(l.quantity), note: l.note ?? "", estimate: l.estimate ? String(l.estimate) : "" }));
      setItems((list) => [...list.filter((i) => i.name.trim()), ...read].slice(0, 20));
      const missed = (data.unreadable as string[]).length;
      setListNote({ tone: "ok", text: `${read.length} ${read.length === 1 ? "item" : "items"} read from your list. Check each one (name, amount, unit) before sending.${missed ? ` ${missed} ${missed === 1 ? "line" : "lines"} couldn't be read: add ${missed === 1 ? "it" : "them"} yourself.` : ""}` });
    } finally {
      setReadingList(false);
    }
  }

  async function uploadPrescription(): Promise<string> {
    const body = await documentBody(prescription!);
    const response = await fetch("/api/errands/prescription", { method: "PUT", headers: { "Content-Type": prescription!.type === "application/pdf" ? "application/pdf" : "image/jpeg" }, body });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "The prescription didn't upload. Try again.");
    return data.file;
  }

  async function send() {
    setError(undefined);
    const filled = items.filter((i) => i.name.trim());
    const problems: FieldErrors = {
      ...(!category && { shopCategory: ["Choose what kind of shop."] }),
      ...(category && !shopId && { shopId: ["Choose a shop, or “Not on the list”."] }),
      ...(typed && shopName.trim().length < 2 && { shopName: ["Enter the shop's name."] }),
      ...(typed && shopAddress.trim().length < 3 && { shopAddress: ["Say where the shop is, like the street or a landmark."] }),
      ...(filled.length === 0 && { items: ["Add at least one thing to buy."] }),
      ...(spend < 20 && { budget: ["Enter at least ₱20."] }),
      ...((overLimit || underEstimate) && { budget: [overLimit ?? underEstimate!] }),
      ...(!addressId && { addressId: ["Choose where to deliver it."] }),
      ...(needsPrescription && !prescription && { prescription: ["Add a photo of the prescription."] }),
      ...(needsPrescription && shopCategory !== "PHARMACY" && { shopCategory: ["Medicine that needs a prescription is bought only at a botika."] }),
      ...(adult && rules && !rules.me.hasBirthDate && !birthDate && { birthDate: ["Enter your birth date, as on your ID."] }),
    };
    filled.forEach((i) => {
      if (!(Number(i.quantity) > 0)) problems[`quantity.${i.key}`] = ["Enter how much."];
      if (i.ifMissing === "REPLACE" && !i.replacement.trim()) problems[`replacement.${i.key}`] = ["Say what to get instead."];
    });
    setFieldErrors(problems);
    if (Object.keys(problems).length || anyBanned) {
      if (anyBanned) setError("Take off what Feasto riders can't buy (marked in red), then send it.");
      return;
    }

    setSending(true);
    let prescriptionFile: string | undefined;
    try {
      if (needsPrescription && prescription) prescriptionFile = await uploadPrescription();
    } catch (e) {
      setSending(false);
      return setFieldErrors({ prescription: [e instanceof Error ? e.message : "The prescription didn't upload."] });
    }
    const result = await apiRequest<{ errand: { id: string }; paymentUrl?: string | null }>("/errands", {
      method: "POST",
      body: {
        ...(typed ? { shopName, shopAddress, shopCategory: category } : { shopId }),
        items: filled.map((i) => ({
          name: i.name,
          quantity: Number(i.quantity),
          unit: i.unit,
          note: i.note || undefined,
          estimate: money(i.estimate) || null,
          ifMissing: i.ifMissing,
          replacement: i.ifMissing === "REPLACE" ? i.replacement : null,
          prescription: i.prescription,
        })),
        notes: notes || undefined,
        budget: spend,
        payOnline,
        addressId,
        preferredRiderId: rider?.id,
        expectedFee: quote?.min,
        prescriptionFile,
        birthDate: birthDate || undefined,
      },
    });
    setSending(false);
    if (!result.ok) {
      // A line the server turned back is shown on that line
      const fields = result.fieldErrors ?? {};
      const mapped: FieldErrors = {};
      for (const [key, value] of Object.entries(fields)) {
        const m = /^items\.(\d+)/.exec(key);
        mapped[m ? `item.${filled[Number(m[1])]?.key}` : key] = value;
      }
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(mapped);
      return;
    }
    if (result.data.paymentUrl) {
      // Paid online first: riders see it once Xendit says it's paid
      window.location.href = result.data.paymentUrl;
      return;
    }
    toast.success("Pabili sent", rider ? `${rider.name} gets it first. We'll tell you when a rider takes it.` : "The riders nearby can see it now. We'll tell you when one takes it.");
    router.push(`/resident/pabili/${result.data.errand.id}`);
  }

  if (addresses.length === 0) {
    return (
      <Alert tone="pending">
        Add a delivery address first, so the rider knows where to bring it.{" "}
        <Link href="/resident/addresses" className="font-semibold underline">
          Add an address
        </Link>
      </Alert>
    );
  }

  const counts = shopList?.counts ?? {};
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Section n={1} title="Where to buy">
        <p id="kind-label" className="mb-2 text-sm font-medium text-ink">
          What kind of shop?
        </p>
        <div role="radiogroup" aria-labelledby="kind-label" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {CATEGORY_ORDER.map((c) => {
            const Icon = CATEGORY_ICON[c];
            const on = category === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => chooseCategory(c)}
                className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center text-[0.8125rem] leading-tight font-semibold transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                  on ? "border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500" : "border-line text-ink hover:bg-canvas"
                }`}
              >
                <Icon className={`size-5 ${on ? "text-brand-600" : "text-gray-500"}`} aria-hidden />
                {SHORT[c]}
                {counts[c] ? <span className="sr-only">, {counts[c]} shops</span> : null}
              </button>
            );
          })}
        </div>
        {err("shopCategory") && <p className="mt-2 text-sm text-red-600">{err("shopCategory")}</p>}

        {category && (
          <div className="mt-4">
            <p id="shop-label" className="mb-2 text-sm font-medium text-ink">
              {rules?.categories[category] ?? SHORT[category]}
            </p>
            <div role="radiogroup" aria-labelledby="shop-label" className="space-y-2">
              {shops.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${
                    shopId === s.id ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-line hover:bg-canvas"
                  }`}
                >
                  <input type="radio" name="shop" className="sr-only" checked={shopId === s.id} onChange={() => setShopId(s.id)} />
                  <MapPin className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{s.name}</span>
                    <span className="block text-sm text-muted">{[s.landmark, s.barangay].filter(Boolean).join(", ")}</span>
                    {s.hours && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                        <Clock className="size-3.5" aria-hidden />
                        {s.hours}
                      </span>
                    )}
                  </span>
                  {shopId === s.id && <Check className="size-5 shrink-0 text-brand-600" aria-hidden />}
                </label>
              ))}
              {shopList && shops.length === 0 && <p className="rounded-xl bg-canvas px-3 py-2.5 text-sm text-muted">No shops of this kind are listed yet.</p>}
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border border-dashed p-3 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${
                  typed ? "border-brand-500 bg-brand-50/60" : "border-gray-300 hover:bg-canvas"
                }`}
              >
                <input type="radio" name="shop" className="sr-only" checked={typed} onChange={() => setShopId("other")} />
                <Plus className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">Not on the list</span>
                  <span className="block text-sm text-muted">Type the shop. We&apos;ll also ask the admin to add it.</span>
                </span>
              </label>
            </div>
            {err("shopId") && <p className="mt-2 text-sm text-red-600">{err("shopId")}</p>}
            {shop?.onFeasto && <OnFeastoNote store={shop.onFeasto} />}
            {typed && (
              <div className="mt-3 space-y-3">
                <TextField label="Shop name" name="shopName" icon={Store} value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Aling Rosa's Sari-sari Store" required error={err("shopName")} />
                <OnFeasto name={shopName} />
                <TextField
                  label="Where it is"
                  name="shopAddress"
                  icon={MapPin}
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  placeholder="Across the plaza, beside the bakery"
                  hint="A street, barangay or landmark the rider will know. No map needed."
                  required
                  error={err("shopAddress")}
                />
              </div>
            )}
          </div>
        )}
      </Section>

      <Section n={2} title="What to buy">
        {rules?.listReader && (
          <div className="mb-3">
            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 px-4 py-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${readingList ? "pointer-events-none opacity-70" : ""}`}
            >
              {readingList ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ScanText className="size-4" aria-hidden />}
              {readingList ? "Reading your list…" : "Upload a photo of your list (or a PDF or Word file)"}
              <input
                type="file"
                accept="image/*,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void readListFile(file);
                }}
              />
            </label>
            {listNote && (
              <p role="status" className={`mt-2 rounded-xl px-3 py-2 text-sm ${listNote.tone === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
                {listNote.text}
              </p>
            )}
          </div>
        )}
        <ul className="space-y-3">
          {items.map((item, index) => {
            const f = flags[index]!;
            const lineError = err(`item.${item.key}`);
            return (
              <li key={item.key} className={`rounded-xl border p-3 ${f.banned || lineError ? "border-red-300 bg-red-50/40" : "border-line"}`}>
                <div className="flex items-end gap-2">
                  <TextField
                    className="min-w-0 flex-1"
                    label={`Item ${index + 1}`}
                    value={item.name}
                    onChange={(e) => update(item.key, { name: e.target.value })}
                    placeholder={index === 0 && category ? EXAMPLE[category] : "What else?"}
                    error={index === 0 ? err("items") : undefined}
                    maxLength={80}
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                      aria-label={`Remove item ${index + 1}`}
                      className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] gap-2">
                  <TextField
                    label="How much"
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step="any"
                    value={item.quantity}
                    onChange={(e) => update(item.key, { quantity: e.target.value })}
                    error={err(`quantity.${item.key}`)}
                  />
                  <SelectField
                    label="Unit"
                    placeholder="Unit"
                    options={UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u].many }))}
                    value={item.unit}
                    onChange={(e) => update(item.key, { unit: e.target.value as Unit })}
                  />
                </div>
                <input
                  value={item.note}
                  onChange={(e) => update(item.key, { note: e.target.value })}
                  placeholder={category === "MARKET" ? "Details, like “big ones, cleaned”" : "Details, like the brand or size (optional)"}
                  aria-label={`Details for item ${index + 1}`}
                  maxLength={120}
                  className="mt-2 h-10 w-full rounded-xl border border-line bg-canvas/60 px-3 text-sm text-ink placeholder:text-gray-500 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                />
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,6.5rem)] gap-2 max-[479px]:grid-cols-1">
                  <SelectField
                    label="If it's not there"
                    placeholder="Choose"
                    options={IF_MISSING.map((o) => ({ value: o.value, label: o.label }))}
                    value={item.ifMissing}
                    onChange={(e) => update(item.key, { ifMissing: e.target.value as IfMissing })}
                  />
                  <TextField
                    label="Costs about"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={item.estimate}
                    onChange={(e) => update(item.key, { estimate: e.target.value })}
                    placeholder="₱"
                  />
                  {item.ifMissing === "REPLACE" && (
                    <TextField className="col-span-2" label="Get this instead" value={item.replacement} onChange={(e) => update(item.key, { replacement: e.target.value })} placeholder="Royal 1.5L" maxLength={80} error={err(`replacement.${item.key}`)} />
                  )}
                </div>
                {category === "PHARMACY" && (
                  <label className="mt-2 flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" className="size-4 accent-brand-600" checked={item.prescription} onChange={(e) => update(item.key, { prescription: e.target.checked })} />
                    This medicine needs a prescription
                  </label>
                )}
                {(f.banned || lineError) && (
                  <p role="alert" className="mt-2 flex gap-2 text-sm text-red-700">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{lineError ?? `“${f.banned}”: ${BANNED_WHY}`}</span>
                  </p>
                )}
                {!f.banned && f.rules.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {[...new Set(f.rules.map((r) => (r === "TOBACCO" ? "ALCOHOL" : r)))].map((r) => (
                      <li key={r} className="flex gap-2 text-[0.8125rem] text-amber-900">
                        <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold">{RULE_TEXT[r].label}</span>
                        <span>{r === "ALCOHOL" && rules?.liquorBan ? "There's a liquor ban now: alcohol can't be bought until it's lifted." : RULE_TEXT[r].text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {items.length < 20 && (
          <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => setItems((list) => [...list, blankItem(category ? DEFAULT_UNIT[category] : "pc")])}>
            <Plus className="size-4" aria-hidden />
            Add another item
          </Button>
        )}
        <TextareaField className="mt-3" label="Anything else the rider should know (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} rows={2} placeholder="Ask for a receipt with the store's name." />
        {notesBanned && <p className="mt-1 text-sm text-red-700">“{notesBanned}”: {BANNED_WHY}</p>}

        {needsPrescription && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-900">
              <Pill className="size-4" aria-hidden />
              Medicine that needs a prescription
            </p>
            <DocumentPicker
              label="Photo of the prescription"
              hint="With the doctor's name and PRC number, the date and your name. Only the rider and the botika see it."
              file={prescription}
              camera
              onChange={setPrescription}
              error={err("prescription")}
            />
            {shopCategory && shopCategory !== "PHARMACY" && <p className="mt-2 text-sm text-red-700">This is bought only at a botika. Choose a botika above.</p>}
          </div>
        )}
        {adult && rules && (
          <div className={`mt-4 rounded-xl border p-3 text-sm ${!rules.me.idVerified || rules.me.adult === false ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50/70 text-amber-900"}`}>
            <p className="font-semibold">Alcohol and cigarettes: 18 and older</p>
            <p className="mt-0.5">
              {rules.me.adult === false
                ? "They can't be on your Pabili. Take them off the list."
                : !rules.me.idVerified
                  ? "Your ID isn't verified yet, so they can't be bought for you. Take them off the list for now."
                  : "The rider will ask to see your ID at the door."}
            </p>
            {rules.me.idVerified && !rules.me.hasBirthDate && (
              <TextField className="mt-2" label="Your birth date, as on your ID" type="date" icon={CalendarDays} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} error={err("birthDate")} />
            )}
          </div>
        )}
      </Section>

      <Section n={3} title="Budget">
        <TextField
          label="The most the rider may spend on the items"
          name="budget"
          type="number"
          inputMode="decimal"
          icon={Banknote}
          min={20}
          max={prepaidMax}
          value={shownBudget}
          onChange={(e) => {
            setBudgetTouched(true);
            setBudget(e.target.value);
          }}
          placeholder="500"
          required
          error={overLimit ?? underEstimate ?? err("budget")}
          hint={
            estimate > 0
              ? `Your estimates add up to ${formatPeso(estimate)}${budgetTouched ? "" : ", rounded up here"}. Add a little in case prices are higher. The most is ${most}.`
              : `₱20 to ${most} in cash${prepaidMax > budgetMax ? `, or up to ${mostOnline} paid online first` : ""}. The rider pays at the shop and shows you the receipt.`
          }
        />
        {prepaidMax > budgetMax && (
          <div className="mt-3 rounded-2xl border border-line p-1">
            <SwitchField
              label="Pay online first"
              description={
                mustPayOnline
                  ? `Above ${most}, a Pabili is paid online first: the rider can't lend that much. What isn't used comes back to you once they buy.`
                  : "Pay the budget and the most fee now (GCash, Maya or card). Nothing to pay at the door; what isn't used comes back once the rider buys."
              }
              checked={payOnline}
              onChange={(v) => setChosePayOnline(v)}
            />
          </div>
        )}
      </Section>

      <Section n={4} title="Deliver to">
        <div className="space-y-2" role="radiogroup" aria-label="Delivery address">
          {addresses.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${
                addressId === a.id ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-line hover:bg-canvas"
              }`}
            >
              <input type="radio" name="address" className="sr-only" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
              <MapPin className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{a.label}</span>
                <span className="block text-sm text-muted">{[a.details, a.landmark].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section n={5} title="Who buys it">
        <RiderPicker near={near} value={rider} onChange={setRider} />
      </Section>

      <div className="rounded-2xl border border-line bg-canvas/60 p-4 text-sm">
        <dl className="space-y-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Items, at most</dt>
            <dd className="font-semibold text-ink tabular-nums">{spend ? formatPeso(spend) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Delivery fee</dt>
            <dd className="font-semibold text-ink tabular-nums">{quote ? `${formatPeso(quote.min)} to ${formatPeso(quote.max)}` : "…"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-1 text-[0.9375rem] font-bold text-ink">
            <dt>{payOnline ? "Paid online now, at most" : "Cash to have ready, at most"}</dt>
            <dd className="tabular-nums">{spend && quote ? formatPeso(spend + quote.max) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-muted">
          {quote && quote.busyFee + quote.rainFee > 0 && (
            <>
              It includes {formatPeso(quote.busyFee + quote.rainFee)} for the rider {quote.busyFee > 0 && quote.rainFee > 0 ? "because riders are busy and it's raining" : quote.busyFee > 0 ? `because riders are busy (${quote.busy})` : "because it's raining"}.{" "}
            </>
          )}
          The delivery fee is set when the rider buys, from where the shop is to you, and never more than {quote ? formatPeso(quote.max) : "the most shown"}. You pay what the receipt says, not the whole budget{payOnline ? ": the rest comes back to you" : ""}. If no rider takes it in {waitMinutes} minutes, it&apos;s cancelled and {payOnline ? "all of it comes back" : "you pay nothing"}.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" className="w-full" loading={sending}>
        {payOnline ? "Pay and send Pabili" : "Send Pabili"}
      </Button>
    </form>
  );
}

function OnFeastoNote({ store }: { store: { id: string; name: string } }) {
  return (
    <div className="mt-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-3">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <UtensilsCrossed className="size-4 shrink-0 text-brand-600" aria-hidden />
        {store.name} is on Feasto
      </p>
      <p className="mt-1 text-sm text-muted">Order from its menu instead: the store gets your order right away, and you can still choose your rider at checkout.</p>
      <Link
        href={`/resident/stores/${store.id}`}
        className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        See the menu
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

type FeastoStore = { id: string; name: string; address: string };

/**
 * When the shop being typed is a Feasto store, point to its menu instead: ordering there reaches
 * the store right away, and the resident can still choose their rider at checkout.
 */
function OnFeasto({ name }: { name: string }) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(name.trim()), 300);
    return () => clearTimeout(t);
  }, [name]);
  const { data } = useApiData<{ stores: FeastoStore[] }>(search.length >= 3 ? `/errands/on-feasto?q=${encodeURIComponent(search)}` : null);
  const stores = search.length >= 3 ? (data?.stores ?? []) : [];
  if (stores.length === 0) return null;
  return (
    <div aria-live="polite" className="space-y-2">
      {stores.map((s) => (
        <OnFeastoNote key={s.id} store={s} />
      ))}
    </div>
  );
}
