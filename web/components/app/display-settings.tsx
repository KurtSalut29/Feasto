"use client";

import { Accessibility, Check, ChevronRight, Contrast, Hand, Map as MapIcon, Pause, Type } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityStatement } from "@/components/app/accessibility-statement";
import { MAP_STYLES } from "@/components/map/map-style-button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { applyDisplay, DEFAULT_DISPLAY, storedDisplay, type DisplayPrefs, type TextSize } from "@/lib/display";

/**
 * Brings this device in line with the account's Display & accessibility settings, once per visit.
 * The page already painted with what this device remembered (lib/display.ts); this only matters
 * on a new phone, or after the settings were changed on another one.
 */
export function DisplaySync() {
  useEffect(() => {
    let stopped = false;
    apiRequest<{ display: DisplayPrefs }>("/me/display").then((result) => {
      if (stopped || !result.ok) return;
      const saved = result.data.display;
      const here = storedDisplay() ?? DEFAULT_DISPLAY;
      if (JSON.stringify({ ...DEFAULT_DISPLAY, ...saved }) !== JSON.stringify(here)) applyDisplay({ ...DEFAULT_DISPLAY, ...saved });
    });
    return () => {
      stopped = true;
    };
  }, []);
  return null;
}

const SIZES: { value: TextSize; label: string; sample: string }[] = [
  { value: "NORMAL", label: "Normal", sample: "text-[1rem]" },
  { value: "LARGE", label: "Large", sample: "text-[1.125rem]" },
  { value: "XLARGE", label: "Extra large", sample: "text-[1.25rem]" },
];

/**
 * The Display & accessibility settings. Every change shows at once on the whole app (so the
 * person sees what it does) and is saved to the account, to follow them to any phone.
 */
export function DisplaySettings({ initial }: { initial: DisplayPrefs }) {
  const [prefs, setPrefs] = useState<DisplayPrefs>(initial);
  const [aboutOpen, setAboutOpen] = useState(false);

  async function change(next: Partial<DisplayPrefs>) {
    const before = prefs;
    const updated = { ...prefs, ...next };
    setPrefs(updated);
    applyDisplay(updated);
    const result = await apiRequest<{ display: DisplayPrefs }>("/me/display", { method: "PUT", body: updated });
    if (!result.ok) {
      setPrefs(before);
      applyDisplay(before);
      toast.error("Couldn't save that", result.error);
      return;
    }
    toast.success("Saved", "Your other phones use it too, next time you open Feasto there.", { duration: 2500 });
  }

  return (
    // Phone: one column. Wide screens: the settings fill the left, the preview stays in view on the right
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:gap-6">
      <div className="space-y-4">
        <Section Icon={Type} title="Text size" text="Makes all the words in Feasto bigger. Buttons and cards grow with them.">
          <fieldset>
            <legend className="sr-only">Text size</legend>
            <div className="grid grid-cols-3 gap-2">
              {SIZES.map((size) => {
                const on = prefs.textSize === size.value;
                return (
                  <label
                    key={size.value}
                    className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                      on ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-line bg-white hover:border-gray-300"
                    }`}
                  >
                    <input type="radio" name="text-size" className="sr-only" checked={on} onChange={() => change({ textSize: size.value })} />
                    <span aria-hidden className={`font-bold text-ink ${size.sample}`}>
                      Aa
                    </span>
                    <span className="text-sm font-medium text-ink">{size.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </Section>
  
        <Toggle
          Icon={Contrast}
          title="High contrast"
          text="Darker text and lines, deeper orange, a thicker outline on what you're on. Easier to read in bright sunlight."
          checked={prefs.highContrast}
          onChange={(v) => change({ highContrast: v })}
        />
        <Toggle
          Icon={Pause}
          title="Reduce motion"
          text="Turns off animations: pages, pop-ups and lists appear without moving. Feasto also follows your phone's own setting."
          checked={prefs.reduceMotion}
          onChange={(v) => change({ reduceMotion: v })}
        />
        <Toggle
          Icon={Hand}
          title="Bigger buttons"
          text="Makes everything you tap at least 44 pixels: easier with shaky hands, gloves or on a bumpy ride."
          checked={prefs.largeTargets}
          onChange={(v) => change({ largeTargets: v })}
        />

        <Section Icon={MapIcon} title="Map style" text="How every map in Feasto looks. You can also change it with the layers button on any map.">
          <fieldset>
            <legend className="sr-only">Map style</legend>
            <div className="grid grid-cols-3 gap-2">
              {MAP_STYLES.map((option) => {
                const on = prefs.mapStyle === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                      on ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-line bg-white hover:border-gray-300"
                    }`}
                  >
                    <input type="radio" name="map-style" className="sr-only" checked={on} onChange={() => change({ mapStyle: option.value })} />
                    <span aria-hidden className={`h-10 w-full max-w-16 rounded-lg ring-1 ring-black/10 ${option.swatch}`} />
                    <span className="text-sm font-medium text-ink">{option.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </Section>
      </div>

      <div className="space-y-4 xl:sticky xl:top-24">
        <section aria-labelledby="display-preview" className="rounded-2xl border border-line bg-white p-4">
          <h2 id="display-preview" className="text-sm font-semibold text-muted">
            Preview
          </h2>
          <p className="mt-0.5 text-sm text-muted">Every change shows here and on every page at once.</p>
          <div className="mt-3 rounded-xl border border-line p-3">
            <p className="font-semibold text-ink">Chicken Adobo with Rice</p>
            <p className="mt-0.5 text-sm text-muted">Tender chicken in soy and vinegar, with garlic rice.</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-bold text-ink">₱120.00</span>
              <button type="button" className="inline-flex h-9 items-center gap-1 rounded-full bg-brand-600 px-3.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                <Check className="size-4" aria-hidden />
                Add
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <Check className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">Order ready for pickup</span>
              <span className="block text-sm text-muted">McDonald&apos;s Naval · 12:45 PM</span>
            </span>
          </div>
        </section>
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          aria-haspopup="dialog"
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left transition-colors hover:border-gray-300 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <Accessibility className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">How Feasto is made accessible</span>
            <span className="mt-0.5 block text-sm text-muted">The standard we follow and how it was checked</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </button>
        <Dialog
          open={aboutOpen}
          onClose={() => setAboutOpen(false)}
          title="How Feasto is made accessible"
          description="Feasto is made to be used by everyone: residents, riders, store owners and the admin, on all kinds of phones, eyes and hands."
          wide
        >
          <AccessibilityStatement inPopup />
        </Dialog>
      </div>
    </div>
  );
}

function Section({ Icon, title, text, children }: { Icon: typeof Type; title: string; text: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{text}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A setting that's on or off: the whole row is the switch (a native checkbox, role="switch") */
function Toggle({ Icon, title, text, checked, onChange }: { Icon: typeof Type; title: string; text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-line bg-white p-4 has-focus-visible:outline-2 has-focus-visible:outline-brand-500">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative mt-1 h-7 w-12 shrink-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-brand-600 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}
