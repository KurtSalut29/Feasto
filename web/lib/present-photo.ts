/**
 * Fits a photo a store uploads to the frames the app shows it in, before it's uploaded.
 * The same rules as server/naval/source/present.py (which prepared the Naval stores' photos):
 *
 * - A store logo on a plain background is trimmed to what's drawn and centred on a 16:9 canvas of
 *   that background colour, small enough to stay whole in the circle cut from its middle. Circles,
 *   squares, 4:3 cards and 16:9 banners then only ever crop plain background.
 *   Anything else (a photo of the food or the shop) is left as it is: cropping a photo is fine.
 *   A logo is told from a photo by its few flat colours: in the Naval stores' pictures, at least
 *   half of every logo is its 12 commonest colours, and at most 43% of every food photo.
 * - A dish picture that's a very tall or very wide (a 9:16 poster or screenshot) is shown whole on a
 *   4:3 card over a blurred copy of itself, so its text and prices aren't cut off.
 */

export type PhotoUse = "store" | "dish";

const COVER = { w: 1600, h: 900 };
const DISH = { w: 1200, h: 900 };
const SAFE_RADIUS = 0.42;

type Rgb = [number, number, number];

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

/** The picture at a small size, to measure it quickly. */
function sample(source: CanvasImageSource, w: number, h: number, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * k));
  const sh = Math.max(1, Math.round(h * k));
  const { ctx } = canvas(sw, sh);
  ctx.drawImage(source, 0, 0, sw, sh);
  return { data: ctx.getImageData(0, 0, sw, sh).data, sw, sh, k };
}

function edge(data: Uint8ClampedArray, sw: number, sh: number): Rgb[] {
  const out: Rgb[] = [];
  const at = (x: number, y: number): Rgb => {
    const i = (y * sw + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  for (let x = 0; x < sw; x++) out.push(at(x, 0), at(x, 1), at(x, sh - 1), at(x, sh - 2));
  for (let y = 0; y < sh; y++) out.push(at(0, y), at(1, y), at(sw - 1, y), at(sw - 2, y));
  return out;
}

const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];
const near = (a: Rgb, b: Rgb, tol: number) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <= tol;

function fitStore(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
  const { data, sw, sh, k } = sample(source, w, h, 480);
  const border = edge(data, sw, sh);
  const bg: Rgb = [0, 1, 2].map((i) => median(border.map((p) => p[i]))) as Rgb;
  // Most of the edge one colour: a logo on a plain background (round logos touch the edge in places)
  if (border.filter((p) => near(p, bg, 36)).length < 0.6 * border.length) return null;
  // Few flat colours, or it's a photo (a plate on a plain table has a plain edge too)
  const bins = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const bin = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  const flat = [...bins.values()].sort((a, b) => b - a).slice(0, 12).reduce((n, v) => n + v, 0);
  if (flat < 0.5 * sw * sh) return null;

  // What's drawn: pixels unlike the background, without hairlines and specks
  let mask = new Uint8Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) mask[i] = near([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]], bg, 34) ? 0 : 1;
  const morph = (m: Uint8Array, keep: (count: number) => boolean) => {
    const out = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.min(sw - 1, Math.max(0, x + dx));
            const ny = Math.min(sh - 1, Math.max(0, y + dy));
            count += m[ny * sw + nx];
          }
        out[y * sw + x] = keep(count) ? 1 : 0;
      }
    return out;
  };
  // Shrink, then grow back: hairlines and specks disappear (more would eat thin script lettering)
  mask = morph(morph(mask, (n) => n === 9), (n) => n > 0);

  let [x0, y0, x1, y1] = [sw, sh, -1, -1];
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++)
      if (mask[y * sw + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return null; // nothing drawn: leave it
  const cx = (x0 + x1 + 1) / 2;
  const cy = (y0 + y1 + 1) / 2;
  let far = 1;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (mask[y * sw + x]) far = Math.max(far, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));

  // Back to full size, with a little room around the drawing
  const pad = 1;
  const box = {
    x: Math.max(0, (x0 - pad) / k),
    y: Math.max(0, (y0 - pad) / k),
    w: Math.min(w, (x1 + 1 + pad) / k) - Math.max(0, (x0 - pad) / k),
    h: Math.min(h, (y1 + 1 + pad) / k) - Math.max(0, (y0 - pad) / k),
  };
  const scale = Math.min((SAFE_RADIUS * COVER.h) / (far / k), (0.84 * COVER.h) / box.h, (0.9 * COVER.w) / box.w);
  const { c, ctx } = canvas(COVER.w, COVER.h);
  ctx.fillStyle = `rgb(${bg.join(",")})`;
  ctx.fillRect(0, 0, COVER.w, COVER.h);
  ctx.imageSmoothingQuality = "high";
  const dw = box.w * scale;
  const dh = box.h * scale;
  ctx.drawImage(source, box.x, box.y, box.w, box.h, (COVER.w - dw) / 2, (COVER.h - dh) / 2, dw, dh);
  return c;
}

function fitDish(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
  const ratio = w / h;
  if (ratio >= 0.6 && ratio <= 2) return null;
  const { c, ctx } = canvas(DISH.w, DISH.h);
  // Behind: the photo filling the card, blurred (drawn tiny, then stretched) and a little darker
  const cover = Math.max(DISH.w / w, DISH.h / h);
  const tiny = canvas(40, 30);
  tiny.ctx.drawImage(source, (40 - (w * cover * 40) / DISH.w) / 2, (30 - (h * cover * 30) / DISH.h) / 2, (w * cover * 40) / DISH.w, (h * cover * 30) / DISH.h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tiny.c, 0, 0, DISH.w, DISH.h);
  ctx.fillStyle = "rgba(16,20,28,0.22)";
  ctx.fillRect(0, 0, DISH.w, DISH.h);
  // In front: the whole photo, with a soft shadow
  const fit = Math.min(DISH.w / w, DISH.h / h);
  const dw = w * fit;
  const dh = h * fit;
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 40;
  ctx.drawImage(source, (DISH.w - dw) / 2, (DISH.h - dh) / 2, dw, dh);
  return c;
}

/** The photo fitted for its use, or null when it's best left as it is. */
export function presentPhoto(source: CanvasImageSource, w: number, h: number, use: PhotoUse) {
  try {
    return use === "store" ? fitStore(source, w, h) : fitDish(source, w, h);
  } catch {
    return null; // a picture the browser can't read pixels from: upload it as it is
  }
}
