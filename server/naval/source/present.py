"""
Makes the store logos and dish photos look right in every frame the app shows them in.

The app shows one store picture in circles (the store page), squares (lists), 4:3 cards and
16:9 banners, always filling the frame. A logo dropped in as it is gets its edges cut off, or
gets blown up when it's wide (Dayka) or sits in a big empty frame (Cusina De Salas). So:

- **Logos** are trimmed to what's drawn, then centred on a 16:9 canvas of their own background
  colour, small enough to stay whole inside the circle cut from the middle of it. Every frame
  then crops only plain background.
- **Badges** are logos printed on a busy rectangle (a photo or a gradient that runs to the edge,
  like Dayka's or TJ's). They're shown whole as a rounded card on their own edge colour.
- **Photos** (a store using a food photo) stay as they are: cropping a photo is fine.
- **Dish photos** go in 4:3 cards. Food photos stay as they are: a cropped photo of food still
  looks good. Posters with names and prices on them, and very tall or very wide pictures (a
  9:16 screenshot), are shown whole over a blurred copy of themselves, so nothing is cut off.

The same rules run in the browser for photos stores upload later (web/lib/present-photo.ts).

    python server/naval/source/present.py <originals folder> <output folder>   # redo every photo
"""
import os, shutil, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

COVER_SIZE = (1600, 900)
DISH_SIZE = (1200, 900)
# The farthest drawn pixel stays within this share of the canvas height from the centre, so a
# circle cut from the middle (its diameter = the canvas height) never touches the logo
SAFE_RADIUS = 0.42

# Stores whose picture is a food photo, not a logo
PHOTOS = {"jam-jay", "antonios", "marb-marb", "kunis", "paul-beth", "marelous", "talyer-belly", "lub-dub"}
# Cut first: the useful part of a picture that came with a frame or a bar (left, top, right, bottom)
CROPS = {
    "cusina-de-salas": (255, 232, 755, 735),  # the round logo, without the empty frame around it
    "tj": (0, 6, 141, 108),  # without the black bar under it
}
# Dish pictures that are posters (text and prices on them): always shown whole
POSTERS = {"el-pomar-", "dayka-17", "sophias-05", "belles-01", "belles-03"}


def flat(im):
    """RGB on white, whatever came in."""
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def edge_pixels(im, band=3):
    w, h = im.size
    px = im.load()
    step = max(1, (w + h) // 400)
    out = []
    for x in range(0, w, step):
        for y in list(range(band)) + list(range(h - band, h)):
            out.append(px[x, y])
    for y in range(0, h, step):
        for x in list(range(band)) + list(range(w - band, w)):
            out.append(px[x, y])
    return out


def edge_color(im):
    """The median colour around the picture's edge: its background."""
    pixels = edge_pixels(im)
    return tuple(sorted(p[i] for p in pixels)[len(pixels) // 2] for i in range(3))


def close(a, b, tol):
    return max(abs(a[i] - b[i]) for i in range(3)) <= tol


def plain_edges(im, color, tol=36, share=0.6):
    """True when most of the edge is one colour: a logo on a plain background (round logos touch
    the edge in places, so not all of it)."""
    pixels = edge_pixels(im)
    return sum(close(p, color, tol) for p in pixels) >= share * len(pixels)


def content_mask(im, color, tol=34):
    """White where the picture differs from its background."""
    diff = ImageChops.difference(im, Image.new("RGB", im.size, color)).convert("L")
    mask = diff.point(lambda v: 255 if v > tol else 0)
    # Leave out hairlines and specks (a thin frame line, JPEG noise): they aren't the logo
    return mask.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))


def reach(mask, box):
    """How far the farthest drawn pixel is from the middle of `box`, in pixels."""
    small = mask.crop(box)
    w, h = small.size
    k = max(1, max(w, h) // 160)  # measure on a small copy: plenty precise, and fast
    small = small.resize((max(1, w // k), max(1, h // k)))
    sw, sh = small.size
    cx, cy = sw / 2, sh / 2
    px = small.load()
    far = 0.0
    for y in range(sh):
        for x in range(sw):
            if px[x, y]:
                far = max(far, ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5)
    return far * k


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=radius, fill=255)
    return mask


def place(canvas, im, mask, far, shadow=False):
    """Scales `im` so its farthest drawn pixel sits within SAFE_RADIUS, and centres it."""
    W, H = canvas.size
    scale = min(SAFE_RADIUS * H / max(far, 1), 0.84 * H / im.height, 0.9 * W / im.width)
    size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    im = im.resize(size, Image.LANCZOS)
    mask = mask.resize(size, Image.LANCZOS) if mask else None
    at = ((W - size[0]) // 2, (H - size[1]) // 2)
    if shadow:
        blur = max(8, H // 45)
        shade = Image.new("L", canvas.size, 0)
        shade.paste(mask or Image.new("L", size, 255), (at[0], at[1] + blur // 2))
        shade = shade.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: v * 0.35)
        canvas.paste(Image.new("RGB", canvas.size, (20, 24, 32)), mask=shade)
    canvas.paste(im, at, mask)
    return canvas


def present_cover(im, slug):
    """The store picture for every frame, or None to keep it as it is."""
    if slug in PHOTOS:
        return None
    im = flat(im)
    if slug in CROPS:
        im = im.crop(CROPS[slug])
    color = edge_color(im)
    canvas = Image.new("RGB", COVER_SIZE, color)
    if plain_edges(im, color):
        mask = content_mask(im, color)
        box = mask.getbbox() or (0, 0, im.width, im.height)
        pad = max(2, min(im.size) // 100)
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
        far = reach(mask, box)
        return place(canvas, im.crop(box), None, far)
    # A badge: the whole rectangle, as a rounded card with a soft shadow
    radius = round(min(im.size) * 0.08)
    card = rounded(im, radius)
    # The rounded corners pull the farthest point in a little
    far = (im.width ** 2 + im.height ** 2) ** 0.5 / 2 * 0.9
    return place(canvas, im, card, far, shadow=True)


def present_dish(im, name):
    """The dish card picture, or None to keep it as it is."""
    ratio = im.width / im.height
    poster = any(name.startswith(p) for p in POSTERS)
    if not poster and 0.6 <= ratio <= 2.0:
        return None
    im = flat(im)
    W, H = DISH_SIZE
    # Behind: the same photo, filling the card, blurred and a little darker
    back = ImageOps.fit(im, DISH_SIZE, Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
    back = Image.blend(back, Image.new("RGB", DISH_SIZE, (16, 20, 28)), 0.22)
    # In front: the whole photo
    scale = min(W / im.width, H / im.height)
    size = (round(im.width * scale), round(im.height * scale))
    front = im.resize(size, Image.LANCZOS)
    at = ((W - size[0]) // 2, (H - size[1]) // 2)
    shade = Image.new("L", DISH_SIZE, 0)
    shade.paste(255, (at[0], at[1], at[0] + size[0], at[1] + size[1]))
    shade = shade.filter(ImageFilter.GaussianBlur(22)).point(lambda v: v * 0.4)
    back.paste(Image.new("RGB", DISH_SIZE, (0, 0, 0)), mask=shade)
    back.paste(front, at)
    return back


def present(im, file):
    """The right treatment for a photo of naval/photos, by its file name (None: keep it as it is)."""
    stem = os.path.splitext(file)[0]
    if stem.endswith("-cover"):
        return present_cover(im, stem[: -len("-cover")])
    return present_dish(im, stem)


def save(im, path):
    im.save(path, quality=84, optimize=True, progressive=True)


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    changed = 0
    for file in sorted(os.listdir(src)):
        if not file.lower().endswith(".jpg"):
            continue
        done = present(Image.open(os.path.join(src, file)), file)
        if done:
            save(done, os.path.join(out, file))
            changed += 1
        else:
            shutil.copyfile(os.path.join(src, file), os.path.join(out, file))
    print(changed, "photos changed")
