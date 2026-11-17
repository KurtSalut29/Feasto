"""Adds the dish photos in web/public/Kuwang (see kuwang_photos.py) without starting over.

    python server/naval/source/apply_kuwang.py          # stores.json and photos/ only
    python server/naval/source/apply_kuwang.py --live   # also the running Feasto (Docker)

- Every matching dish gets its photo, and Big Bu gets a cover.
- Juanita's and Cup Stop get their full menus from menus.txt (dishes that were missing, with the
  sections of their own menu boards), since the new photos show those dishes.
- With --live it also updates the database of the running Docker setup: it fills in photos only
  where a dish has none (a photo a store uploaded itself stays), adds the missing dishes, and
  keeps every order, account and sale. Nothing is deleted.
"""
import json, os, subprocess, sys, uuid
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from present import present, save as save_presented
from kuwang_photos import BIG_BU_COVER, KUWANG_PICS, kuwang_photo

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..")
PHOTOS = os.path.join(OUT, "photos")
STORES = os.path.join(OUT, "stores.json")
TYPED_SLUG = {"juanitas": "juanita", "cup-stop": "cupstop"}  # store slug -> section in menus.txt
LIVE = "--live" in sys.argv


def photo(src, name):
    """The same treatment as build_naval.py: at most 1000 px, fitted by present.py, as JPEG."""
    im = Image.open(src)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((1000, 1000))
    file = f"{name}.jpg"
    shown = present(im, file)
    if shown:
        save_presented(shown, os.path.join(PHOTOS, file))
    else:
        im.save(os.path.join(PHOTOS, file), quality=80, optimize=True)
    return file


def typed(section):
    dishes, current = [], None
    for line in open(os.path.join(HERE, "menus.txt"), encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("## "):
            current = line[3:].strip()
        elif line.strip() and current == section:
            cat, name, price, desc = line.split("|", 3)
            dishes.append({"category": cat, "name": name, "price": float(price), "description": desc.strip() or None})
    return dishes


# ---------- stores.json and photos/ ----------

stores = json.load(open(STORES, encoding="utf-8"))
changed = []
for s in stores:
    slug = s["slug"]
    if slug in TYPED_SLUG:
        s["menu"] = typed(TYPED_SLUG[slug])
    if slug not in KUWANG_PICS:
        continue
    for i, d in enumerate(s["menu"]):
        src = kuwang_photo(slug, d["name"])
        if src:
            d["photo"] = photo(src, f"{slug}-{i + 1:02d}")
            changed.append((slug, d))
        else:
            d.setdefault("photo", None)
    missing = set(KUWANG_PICS[slug][1]) - {d["name"] for d in s["menu"]}
    assert not missing, (slug, missing)  # every Kuwang photo found its dish
    if slug == "big-bu" and not s["cover"]:
        s["cover"] = photo(BIG_BU_COVER, "big-bu-cover")

json.dump(stores, open(STORES, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"stores.json: {len(changed)} dish photos added")
for slug in KUWANG_PICS:
    s = next(x for x in stores if x["slug"] == slug)
    print(f"  {s['name']:<28} {sum(1 for d in s['menu'] if d['photo']):>3} of {len(s['menu']):>3} dishes have a photo")

if not LIVE:
    sys.exit(0)

# ---------- The running Feasto ----------

def sql(query):
    out = subprocess.run(["docker", "exec", "-i", "feasto-postgres-1", "psql", "-U", "feasto", "-d", "feasto", "-tA", "-v", "ON_ERROR_STOP=1"],
                         input=query, capture_output=True, text=True, encoding="utf-8")
    if out.returncode:
        raise RuntimeError(out.stderr.strip())
    return out.stdout.strip()

q = lambda v: "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"

def upload(file):
    """Copies a photo into the uploads volume that every API copy and Nginx share."""
    subprocess.run(["docker", "cp", os.path.join(PHOTOS, file), f"feasto-api-1-1:/app/uploads/naval-{file}"], check=True, capture_output=True)
    return f"/uploads/naval-{file}"

added = filled = moved = 0
for slug in KUWANG_PICS:
    s = next(x for x in stores if x["slug"] == slug)
    vendor = sql(f"""SELECT v.id FROM "Vendor" v JOIN "User" u ON u.id = v."ownerId" WHERE u.email = {q(s['email'])}""")
    if not vendor:
        print(f"  {s['name']}: not in this database, skipped")
        continue
    live = {}
    for row in sql(f"""SELECT id, name, category, coalesce("imageUrl", '') FROM "MenuItem" WHERE "vendorId" = {q(vendor)} AND "deletedAt" IS NULL""").splitlines():
        id_, name, cat, img = row.split("|", 3)
        live[name] = (id_, cat, img)
    statements = []
    for d in s["menu"]:
        url = upload(d["photo"]) if d["photo"] else None
        if d["name"] in live:
            id_, cat, img = live[d["name"]]
            if url and not img:
                statements.append(f"""UPDATE "MenuItem" SET "imageUrl" = {q(url)} WHERE id = {q(id_)};"""); filled += 1
            if slug in TYPED_SLUG and cat != d["category"]:
                statements.append(f"""UPDATE "MenuItem" SET category = {q(d['category'])} WHERE id = {q(id_)};"""); moved += 1
        elif slug in TYPED_SLUG:
            statements.append(f"""INSERT INTO "MenuItem" (id, "vendorId", name, category, description, price, "imageUrl")
                VALUES ({q('kw' + uuid.uuid4().hex[:23])}, {q(vendor)}, {q(d['name'])}, {q(d['category'])}, {q(d['description'])}, {d['price']}, {q(url)});"""); added += 1
    if s.get("cover"):
        statements.append(f"""UPDATE "Vendor" SET "imageUrl" = {q(upload(s['cover']))} WHERE id = {q(vendor)} AND "imageUrl" IS NULL;""")
    if statements:
        sql("BEGIN;\n" + "\n".join(statements) + "\nCOMMIT;")
    # Residents see the new menu at once, not when the cache runs out
    subprocess.run(["docker", "exec", "feasto-redis-1", "redis-cli", "DEL", "cache:stores:list", f"cache:store:v2:{vendor}"], capture_output=True)
print(f"Running Feasto: {filled} photos filled in, {added} dishes added, {moved} dishes moved to their menu section")
