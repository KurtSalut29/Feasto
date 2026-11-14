/**
 * Display & accessibility: text size, contrast, motion and button size. Saved with the account
 * (so they follow the person to any phone) and kept on this device too, so the very first paint
 * of every page already has them: DISPLAY_INIT_SCRIPT runs in <head> before anything shows.
 * The look of each setting is in globals.css, keyed by data attributes on <html>.
 */

export type TextSize = "NORMAL" | "LARGE" | "XLARGE";
export type DisplayPrefs = { textSize: TextSize; highContrast: boolean; reduceMotion: boolean; largeTargets: boolean };

export const DEFAULT_DISPLAY: DisplayPrefs = { textSize: "NORMAL", highContrast: false, reduceMotion: false, largeTargets: false };

export const DISPLAY_STORAGE_KEY = "feasto-display";

/** The <html> attributes for a set of preferences (none for the defaults) */
function attributes(p: DisplayPrefs): Record<string, string | null> {
  return {
    "data-text": p.textSize === "LARGE" ? "large" : p.textSize === "XLARGE" ? "xlarge" : null,
    "data-contrast": p.highContrast ? "more" : null,
    "data-motion": p.reduceMotion ? "reduce" : null,
    "data-targets": p.largeTargets ? "large" : null,
  };
}

/** Shows the preferences right away and remembers them on this device. */
export function applyDisplay(p: DisplayPrefs) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(attributes(p))) {
    if (value) root.setAttribute(name, value);
    else root.removeAttribute(name);
  }
  try {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Private browsing: still applied for this visit
  }
}

export function storedDisplay(): DisplayPrefs | null {
  try {
    const raw = localStorage.getItem(DISPLAY_STORAGE_KEY);
    return raw ? { ...DEFAULT_DISPLAY, ...(JSON.parse(raw) as Partial<DisplayPrefs>) } : null;
  } catch {
    return null;
  }
}

/** True when animations should be left out: the phone's setting, or Feasto's own */
export function lessMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
}

/** Runs before the page paints, so a page never flashes small text before switching to large. */
export const DISPLAY_INIT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(DISPLAY_STORAGE_KEY)})||"null");if(p){var r=document.documentElement;if(p.textSize==="LARGE")r.setAttribute("data-text","large");if(p.textSize==="XLARGE")r.setAttribute("data-text","xlarge");if(p.highContrast)r.setAttribute("data-contrast","more");if(p.reduceMotion)r.setAttribute("data-motion","reduce");if(p.largeTargets)r.setAttribute("data-targets","large")}}catch(e){}`;
