"use client";

import { Check, Layers } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { apiRequest } from "@/lib/browser-api";
import { applyDisplay, currentMapStyle, DEFAULT_DISPLAY, MAP_STYLE_EVENT, storedDisplay, type MapStyle } from "@/lib/display";

/** The looks a map can have, with a tiny picture of each (drawn in CSS, nothing to download) */
export const MAP_STYLES: { value: MapStyle; name: string; text: string; swatch: string }[] = [
  {
    value: "DEFAULT",
    name: "Default",
    text: "Streets and places",
    swatch: "bg-[linear-gradient(135deg,#eef1ec_0%,#eef1ec_42%,#ffffff_42%,#ffffff_50%,#d6ecd2_50%,#d6ecd2_74%,#bfe0f5_74%)]",
  },
  {
    value: "SATELLITE",
    name: "Satellite",
    text: "Photos from above",
    swatch: "bg-[linear-gradient(135deg,#4f6b3a_0%,#6e8a4b_38%,#e9e3cf_38%,#e9e3cf_46%,#3f5a33_46%,#5c7844_70%,#2f5d78_70%)]",
  },
  {
    value: "NIGHT",
    name: "Night",
    text: "Dark, easy on the eyes",
    swatch: "bg-[linear-gradient(135deg,#1c2433_0%,#1c2433_42%,#56627a_42%,#56627a_50%,#232d3f_50%,#232d3f_74%,#121a29_74%)]",
  },
];

/**
 * Picks how every map looks. The choice shows at once on all the maps on the page, stays on this
 * phone, and is saved with the account (Display & accessibility has the same setting).
 */
export async function chooseMapStyle(style: MapStyle) {
  applyDisplay({ ...(storedDisplay() ?? DEFAULT_DISPLAY), mapStyle: style });
  // Signed out (a new store pinning its spot): it's still kept on this device
  await apiRequest("/me/display", { method: "PUT", body: { mapStyle: style } });
}

function subscribe(onChange: () => void) {
  window.addEventListener(MAP_STYLE_EVENT, onChange);
  return () => window.removeEventListener(MAP_STYLE_EVENT, onChange);
}

/** The map style in use, kept up to date when it changes anywhere */
export function useMapStyle(): MapStyle {
  return useSyncExternalStore(subscribe, currentMapStyle, () => "DEFAULT");
}

/**
 * A button in a map's corner that opens the three looks. `big` is the full-screen map's version,
 * with its name written out; `inline` sits in a page's own column of map buttons (the stores and
 * jobs maps), the same size as them. The menu opens below the button, from its corner.
 */
export function MapStyleButton({
  side = "left",
  big = false,
  inline = false,
  className = "",
}: {
  side?: "left" | "right";
  big?: boolean;
  inline?: boolean;
  className?: string;
}) {
  const style = useMapStyle();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Closes on a tap outside or Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && (event.stopPropagation(), setOpen(false));
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={box} className={`${inline ? "relative" : "absolute"} z-10 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={big ? undefined : "Map style"}
        title="Map style"
        className={`flex items-center justify-center gap-2 rounded-full bg-white text-ink shadow-md ring-1 ring-black/5 transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 ${
          big ? "h-11 pr-4 pl-3.5 text-sm font-semibold shadow-lg" : inline ? "size-11" : "size-9"
        } ${open ? "bg-brand-50 text-brand-700" : ""}`}
      >
        <Layers className={big ? "size-[18px]" : inline ? "size-5" : "size-4"} aria-hidden />
        {big && "Map style"}
      </button>
      <div
        id={menuId}
        role="group"
        aria-label="Map style"
        className={`absolute top-full mt-2 w-60 rounded-2xl bg-white p-1.5 shadow-[0_18px_40px_-14px_rgba(31,45,61,0.45)] ring-1 ring-black/5 transition-[opacity,transform,visibility] duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
          side === "left" ? "left-0 origin-top-left" : "right-0 origin-top-right"
        } ${open ? "visible scale-100 opacity-100" : "invisible scale-95 -translate-y-1 opacity-0"}`}
      >
        {MAP_STYLES.map((option) => {
          const on = style === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                setOpen(false);
                if (!on) void chooseMapStyle(option.value);
              }}
              className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${on ? "bg-brand-50" : "hover:bg-canvas"}`}
            >
              <span aria-hidden className={`size-11 shrink-0 rounded-lg ring-1 ring-black/10 ${option.swatch} ${on ? "ring-2 ring-brand-600" : ""}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{option.name}</span>
                <span className="block text-xs text-muted">{option.text}</span>
              </span>
              {on && <Check className="size-4 shrink-0 text-brand-600" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
