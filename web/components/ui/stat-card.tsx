import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  Icon,
  highlight,
}: {
  label: string;
  value: string | number;
  hint?: string;
  Icon: LucideIcon;
  /** Draws attention when the number needs action, e.g. pending approvals */
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span
          className={`flex size-9 items-center justify-center rounded-xl ${
            highlight ? "bg-brand-50 text-brand-600" : "bg-canvas text-muted"
          }`}
        >
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}
