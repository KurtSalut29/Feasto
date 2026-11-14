"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** How long closing plays (dialog.fx-dialog in globals.css): the content stays until it's gone */
const CLOSING_MS = 300;

/**
 * A pop-up built on the browser's <dialog>, which handles focus and the Esc key. Centered on bigger
 * screens; a sheet that rises from the bottom on phones (both animated in globals.css).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  // Keeps the content while the closing animation plays, so it doesn't shrink away empty
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) return;
    const timer = setTimeout(() => setShown(false), CLOSING_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onClose={onClose}
      onClick={(e) => {
        // Clicking the dimmed backdrop closes it
        if (e.target === ref.current) onClose();
      }}
      className={`fx-dialog m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/40 ${
        wide ? "max-w-2xl" : "max-w-md"
      }`}
    >
      {shown && (
        <div className="max-h-[85dvh] overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
                {title}
              </h2>
              {description && (
                <p id={`${id}-description`} className="mt-1 text-sm [overflow-wrap:anywhere] text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-2 rounded-lg p-2 text-muted hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
