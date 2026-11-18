/**
 * Adding to the cart, made visible: the dish's photo pops up where it was tapped, then glides in an
 * arc into the cart icon in the top bar, which bumps as it lands. Purpose: spatial (where did my
 * food go?) and feedback. Built with WAAPI (transform and opacity only, off the main thread), so
 * nothing re-renders. Slow enough to follow: ~0.9 s in all. With reduced motion, only the bump.
 *
 * Mark the cart icon with `data-cart-target`. Three nested boxes move separately: X fast first
 * (ease-out) and Y slow first (ease-in) after a small hop, so the path curves instead of cutting
 * straight across, and it never leaves the screen; the inner box pops and shrinks.
 */

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Sideways: quick at first, settling over the cart */
const EASE_OUT_SOFT = "cubic-bezier(0.33, 1, 0.68, 1)";
const POP_MS = 220;
const FLY_MS = 700;
const SIZE = 64;

export const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

export function flyToCart(from: Element | null | undefined, imageUrl?: string | null) {
  if (typeof window === "undefined") return;
  const target = [...document.querySelectorAll<HTMLElement>("[data-cart-target]")].find(visible);
  if (!target) return;
  const bump = (delay = 0) =>
    target.animate([{ transform: "scale(1)" }, { transform: "scale(1.22)" }, { transform: "scale(1)" }], { duration: 360, delay, easing: EASE_OUT });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !from || !visible(from)) return void bump();

  const a = from.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const start = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  const dx = t.left + t.width / 2 - start.x;
  const dy = t.top + t.height / 2 - start.y;
  // A small hop up first, never above the top of the screen
  const hop = -Math.min(28, Math.max(0, start.y - SIZE / 2 - 8));

  const x = document.createElement("div");
  const y = document.createElement("div");
  const photo = document.createElement("div");
  x.setAttribute("aria-hidden", "true");
  x.style.cssText = `position:fixed;left:${start.x - SIZE / 2}px;top:${start.y - SIZE / 2}px;width:${SIZE}px;height:${SIZE}px;z-index:9999;pointer-events:none;will-change:transform`;
  y.style.cssText = "width:100%;height:100%;will-change:transform";
  photo.style.cssText = `width:100%;height:100%;border-radius:9999px;border:3px solid #fff;box-shadow:0 10px 24px rgba(16,24,40,.28);background:#ea580c center/cover no-repeat;${
    imageUrl ? `background-image:url("${encodeURI(imageUrl)}");` : ""
  }will-change:transform,opacity`;
  // A dish without a photo flies as an orange "+1"
  if (!imageUrl) {
    photo.textContent = "+1";
    photo.style.cssText += ";display:flex;align-items:center;justify-content:center;color:#fff;font:700 18px/1 system-ui,sans-serif";
  }
  y.appendChild(photo);
  x.appendChild(y);
  document.body.appendChild(x);

  // 1. Pop up where it was tapped
  photo.animate(
    [
      { transform: "scale(0.4)", opacity: 0 },
      { transform: "scale(1.12)", opacity: 1, offset: 0.7 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: POP_MS, easing: EASE_OUT, fill: "forwards" },
  );
  // 2. Glide over, up and then down into the cart, shrinking as it goes
  x.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], { duration: FLY_MS, delay: POP_MS, easing: EASE_OUT_SOFT, fill: "forwards" });
  y.animate(
    [
      { transform: "translateY(0)", easing: "cubic-bezier(0.33, 1, 0.68, 1)" },
      { transform: `translateY(${hop}px)`, offset: 0.18, easing: "cubic-bezier(0.55, 0, 0.9, 0.45)" },
      { transform: `translateY(${dy}px)` },
    ],
    { duration: FLY_MS, delay: POP_MS, fill: "forwards" },
  );
  const shrink = photo.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(0.85)", opacity: 1, offset: 0.6 },
      { transform: "scale(0.25)", opacity: 0.6 },
    ],
    { duration: FLY_MS, delay: POP_MS, easing: "linear", fill: "forwards" },
  );
  bump(POP_MS + FLY_MS - 40);
  const done = () => x.remove();
  shrink.finished.then(done, done);
}
