import { formatTime } from "@/lib/format";

type Hours = { opensAt: string; closesAt: string; isTemporarilyClosed: boolean };

/** Same rule as the server: open inside opening hours (Manila time) unless switched to temporarily closed. */
export function storeState(store: Hours) {
  if (store.isTemporarilyClosed) return { open: false, label: "Temporarily closed" };
  const now = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (now >= store.opensAt && now < store.closesAt) return { open: true, label: `Open now · until ${formatTime(store.closesAt)}` };
  return { open: false, label: `Closed · opens ${formatTime(store.opensAt)}` };
}

/** "● Open now · until 8:00 PM" pill for the vendor's page headers. */
export function StoreStatusPill({ store }: { store: Hours }) {
  const { open, label } = storeState(store);
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
        open ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line bg-white text-muted"
      }`}
    >
      <span className="relative flex size-2">
        {open && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-70" />}
        <span className={`relative size-2 rounded-full ${open ? "bg-emerald-500" : "bg-gray-400"}`} />
      </span>
      {label}
    </span>
  );
}
