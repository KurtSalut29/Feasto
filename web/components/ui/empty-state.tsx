import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Shown where a list will appear once there's something in it. */
export function EmptyState({
  Icon,
  title,
  text,
  action,
}: {
  Icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-canvas text-muted">
        <Icon className="size-7" aria-hidden />
      </span>
      <p className="mt-4 font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-balance text-sm leading-relaxed text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
