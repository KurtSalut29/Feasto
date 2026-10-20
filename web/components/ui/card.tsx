import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A white panel. Give it a title to get a header row with optional actions on the right, and a footer row below. */
export function Card({
  title,
  description,
  Icon,
  actions,
  footer,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Small icon tile before the title */
  Icon?: LucideIcon;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted ring-1 ring-line/70">
                <Icon className="size-[18px]" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="font-semibold text-ink">{title}</h2>
              {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
            </div>
          </div>
          {actions}
        </header>
      )}
      {children}
      {footer && <footer className="mt-auto border-t border-line bg-canvas/40 px-5 py-3 text-sm">{footer}</footer>}
    </section>
  );
}

/** "See all →" style link for a card footer or header. */
export const CARD_LINK =
  "inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500";
