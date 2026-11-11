"""Builds server/naval/stores.json and server/naval/photos/ from the Feasto_Categories folder.
Menus come from the .docx tables and from menu photos typed out by hand (menus.txt).

    pip install python-docx Pillow openlocationcode
    python server/naval/source/build_naval.py [path/to/Feasto_Categories]
"""
import json, os, re, shutil, sys, tempfile
import docx
from docx.oxml.ns import qn
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from present import present, save as save_presented

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "web", "public", "Feasto_Categories")
OUT = os.path.join(ROOT, "server", "naval")
PHOTOS = os.path.join(OUT, "photos")
SCRATCH = HERE  # menus.txt lives next to this script
DOCX_IMG = tempfile.mkdtemp()


def extract_docx_images():
    """The Milk Tea and Snacks files only have pictures: save each, named after the store heading above it."""
    files = [("RESTAURANTS/Milk Tea & Drinks/Milk Tea & Drinks.docx", "milk"), ("RESTAURANTS/Snacks & Street Foods  Desserts/Snacks & Street Foods.docx", "snack")]
    for f, tag in files:
        d = docx.Document(os.path.join(SRC, f))
        rels = d.part.related_parts
        heading, n = "start", 0
        for p in d.paragraphs:
            t = p.text.strip()
            if t and t.lower() not in ("menu", "menu details:", "mune"):
                heading = t
            for b in p._p.findall(".//" + qn("a:blip")):
                part = rels[b.get(qn("r:embed"))]
                n += 1
                ext = os.path.splitext(part.partname)[1]
                name = f"{tag}-{n:02d}-{re.sub(r'[^A-Za-z0-9]+', '_', heading)[:28]}{ext}"
                open(os.path.join(DOCX_IMG, name), "wb").write(part.blob)


extract_docx_images()

shutil.rmtree(PHOTOS, ignore_errors=True)
os.makedirs(PHOTOS)

def photo(src, name):
    """Copies a photo, at most 1000 px, as JPEG. Returns the file name."""
    path = src if os.path.isabs(src) else os.path.join(SRC, src)
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((1000, 1000))
    file = f"{name}.jpg"
    # Fitted for the app's frames (logos kept whole, posters uncut): see present.py
    shown = present(im, file)
    if shown:
        save_presented(shown, os.path.join(PHOTOS, file))
    else:
        im.save(os.path.join(PHOTOS, file), quality=80, optimize=True)
    return file

def money(text):
    m = re.search(r"([\d,]+(?:\.\d+)?)", text or "")
    return float(m.group(1).replace(",", "")) if m else None

def docx_tables(path):
    return [[[c.text.strip() for c in r.cells] for r in t.rows] for t in docx.Document(os.path.join(SRC, path)).tables]

BAKERY = docx_tables("Bakery/bakery).docx")
CARINDERIA = docx_tables("Carinderia/Naval Carenderia.docx")
HOME = docx_tables("Home kitchen/HOME KITCHEN.docx")
RESTO = docx_tables("name, type, desc, addr, open and close hrs.docx")

def from_table(rows, order=("name", "section", "price", "description")):
    """A docx menu table -> dishes. Columns differ between files, so `order` names them."""
    out = []
    for row in rows[1:]:
        r = dict(zip(order, row))
        out.append({"name": r["name"], "category": r["section"].strip() or "Menu", "price": money(r["price"]), "description": r["description"].strip() or None})
    return out

# Menus typed from photos: "## slug" then "Category|Name|Price|Description[@photo]"
TYPED = {}
slug = None
for line in open(os.path.join(SCRATCH, "menus.txt"), encoding="utf-8"):
    line = line.rstrip("\n")
    if line.startswith("## "):
        slug = line[3:].strip(); TYPED[slug] = []
    elif line.strip():
        cat, name, price, desc = line.split("|", 3)
        desc, _, pic = desc.partition("@")
        TYPED[slug].append({"category": cat, "name": name, "price": float(price), "description": desc.strip() or None, "photoSrc": pic or None})

# Carinderia prices weren't given; these are typical Naval carinderia prices (see README)
EST = {
    "jam-jay": {"Ginataang Langka": 25, "Kalabasa": 25, "Paklay": 55, "Ampalaya": 25, "Bicol Express": 50, "Paksiw Bangus": 55, "Adobong Atay": 45, "Hotdog": 20, "Sunny Egg": 20, "Tortang Hipon": 40},
    "antonios": {"Egg": 20, "Hotdog": 20, "Turtang Talong": 25, "Chopsuey": 30, "Pansit": 30, "Sitaw": 25, "Kalabasa": 25, "Menudo": 55, "Bangus": 60, "Adobong Baboy": 55},
    "marb-marb": {"Guisadong Sitaw": 25, "Ginataang Kalabasa": 25, "Monggo": 25, "Pork Menudo": 55, "Pork Adobo": 55, "Dinuguan": 50, "Chicken Curry": 55, "Fried Chicken": 55, "Paksiw na Bangus": 55, "Fried Tulingan": 45, "Fried Hotdog": 20, "Fried Egg": 20},
    "kunis": {"Guisadong Ampalaya": 25, "Guisadong Petchay": 25, "Chopsuey": 30, "Tortang Talong": 25, "Pork Adobo": 55, "Pork Dinuguan": 50, "Chicken Curry": 55, "Paksiw na Tulingan": 45, "Boiled Egg": 15},
}

def with_prices(slug, dishes):
    for d in dishes:
        if d["price"] is None:
            d["price"] = EST[slug][d["name"]]
            d["estimated"] = True
    return dishes

# Dish photos by dish name, per store folder
PICS = {
    "dayka": ("Bakery/dayka", {"Spanish bread": "Spanish bread.jpg", "Cheese bread": "cheese bread.jpg", "Pande Coco": "pan de coco.jpg", "Everlasting": "everlasting.jpg", "Bohol": "Bohol.jpg", "Hopia": "hopia.jpg", "Crinkles": "crinkles.jpg", "Ensaymada": "ensaymada.jpg", "Banana cake": "banana cake.jpg", "Donut": "donut.jpg", "Shakoy": "shakoy.jpg", "Slice Bread": "slice bread.jpg"}),
    "sophias": ("Bakery/Sophias", {"Pan de Sal": "pandesal.jpg", "Spanish Bread": "Spanish.jpg", "Ensaymada": "ensaymada.jpg", "Pan de Coco": "pan de coco.jpg", "Sliced Loaf Bread": "slice bread.jpg"}),
    "tj": ("Bakery/TJ", {"Cheese Cupcakes": "cheesecake.jpg", "Ensaymada": "ensaymada.jpg", "Pineapple Pie": "pineapple pie.jpg", "Pig Pie": "pigpie.jpg", "Peanut Butter": "peanut butter.jpg"}),
    "purple-yam": ("Bakery/Purple yam", {"Ube Cake (Whole)": "ube cake.jpg", "Ube Halaya Jar": "Ube halaya jar.jpg", "Ube Ensaymada": "ube ensaymada.jpg"}),
    "belles": ("Bakery/Belles", {"Customized Birthday Cake": "customized birthday cake/1794209471899.jpg", "Assorted Cupcakes (Box of 6)": "assorted cupcakes/1794209845035.jpg", "Dessert Buffet Package": "dessert buffet/1794209350743.jpg"}),
    "antonios": ("Carinderia/Antonio_s Travelers Eatery", {"Egg": "egg.jpg", "Hotdog": "hotdog.jpg", "Turtang Talong": "turtang talong.jpg", "Chopsuey": "chopsuey.jpg", "Pansit": "pansit.jpg", "Sitaw": "ginisang sitaw.jpg", "Kalabasa": "ginisang kalabasa.jpg", "Menudo": "pork menudo.jpg", "Bangus": "fried bangus.jpg", "Adobong Baboy": "pork adobo.jpg"}),
    "marb-marb": ("Carinderia/Marb Marb Eatery", {"Guisadong Sitaw": "sitaw.webp", "Ginataang Kalabasa": "ginataang kalabasa.jpg", "Monggo": "monggo.jpg", "Pork Menudo": "menudo.jpg", "Pork Adobo": "pork adobo.jpg", "Dinuguan": "dinuguan.jpg", "Chicken Curry": "chicken curry.jpg", "Fried Chicken": "fried chicken.jpg", "Paksiw na Bangus": "bangus paksiw.jpg", "Fried Hotdog": "hotfog.jpg", "Fried Egg": "egg.jpg"}),
    "jam-jay": ("Carinderia/JAM JAY JABBY EATERY", {"Sunny Egg": "00b03437e79f7f5e4043085ab9f95593.jpg", "Ampalaya": "07ee29937e988d26e4ebb0f2b3018ed7.jpg", "Tortang Hipon": "3a3f850ad97091ac021e3f2a4d0fb74a.jpg", "Paksiw Bangus": "62bcb228a43e057bd2f456c1f1bfe095.jpg", "Bicol Express": "9bd5a8f5ab688adc4d599b5d2e5d7e8c.jpg", "Adobong Atay": "9e2b034b9a4c580787848ed7bf1048e5.jpg", "Kalabasa": "IMG_e34dcc00-7659-47bd-9933-2518eac06f43.jpg", "Paklay": "ac706ad9080f3910a46d4945fedeebaf.jpg", "Hotdog": "cffcd22d483f756576a7de27e6f490e2.jpg", "Ginataang Langka": "ed41dc9aaa0b00ce98442b1cc198bbca.jpg"}),
    "kunis": ("Carinderia/Kunis Eatery", {"Pork Dinuguan": "65c04aca54a3cdfdd7156065d3c6bd9a.jpg", "Guisadong Ampalaya": "75284c0926375a8c0fe86671d035d618.jpg", "Chopsuey": "88f975872dc79470073bed2a61e70fe7.jpg", "Chicken Curry": "8c7b17b54f8ce604c0fb541de232a8b9.jpg", "Guisadong Petchay": "IMG_487740cb-cabc-4fb6-847d-83325cf38e24.jpg", "Paksiw na Tulingan": "IMG_6533ccab-ed4c-40c2-b050-e72a01ef2197.jpg", "Pork Adobo": "a375f42f6dc752b176c92997a7fa1a8d.jpg", "Boiled Egg": "dda9cd45cfdc2e388023ce435b8a250a.jpg", "Tortang Talong": "f68c4a8daf471ba75928803763681608.jpg"}),
    "paul-beth": ("Home kitchen/Paul & Beth Eatery", {"Special Chopsuey": "chopsuey.jpg", "Guisadong Ampalaya": "ampalaya.jpg", "Guisadong Sitaw at Kalabasa": "sitaw at kalbasa.jpg", "Tortang Talong": "talong.jpg", "Pork Adobo": "adobo.jpg", "Pork Dinuguan": "Dinuguan2.jpg", "Crispy Fried Chicken": "friedchicken.jpg", "Fried Tulingan": "tulingan.jpg", "Omelet / Fried Egg": "omelet.jpg"}),
    "marelous": ("Home kitchen/Marelous Eatery", {"Ginataang Kalabasa at Sitaw": "ginataang kalabasa at sitaw.jpg", "Pork Menudo": "pork menudo.jpg", "Fried Chicken": "fried chicken.jpg", "Chicken Adobo": "adobong manok.jpg", "Fried Tulingan": "fried tulingan.jpg", "Paksiw na Bangus": "paksiw na bangus_.jpg", "Jumbo Hotdog": "jumbo hotdog.jpg", "Sunny-Side Up Egg": "sunny side up egg.jpg"}),
}

def plus(code):
    from openlocationcode import openlocationcode as o
    d = o.decode(o.recoverNearest(code, 11.56, 124.39))
    return [round(d.latitudeCenter, 6), round(d.longitudeCenter, 6)]

D = lambda f: os.path.join(DOCX_IMG, f)
NAVAL = "Naval, Biliran"
UNKNOWN = True  # address not in the files; the store should set its pin

# slug, name, type, description, address, opens, closes, pin, cover, menu, extra
S = [
    # ----- Bakeries and cake shops -----
    ("dayka", "Dayka Bakeshop", "BAKERY", "A popular regional bakery known for freshly baked local Filipino breads and pastries straight from the oven.", "P. Inocentes Street, Naval, Biliran", "05:00", "21:00", [11.5611, 124.3936], "Bakery/dayka/dayka.jpg", from_table(BAKERY[0]), {}),
    ("sophias", "Sophia's Bread & Pastries", "BAKERY", "A well-known local bakeshop in Naval offering freshly baked breads, pastries and daily breakfast items.", "Vicentillo Street, Naval, Biliran", "09:00", "19:00", [11.5626, 124.3955], "Bakery/Sophias/sophias.jpg", from_table(BAKERY[1]), {}),
    ("tj", "TJ Breadhaus and Cafe", "BAKERY", "A cozy neighborhood bakeshop and cafe offering specialty coffees, baked goods, light snacks and customized cakes.", "Corner Magallanes Street, Naval, Biliran", "07:00", "20:00", [11.5606, 124.3944], D("snack-22-TJ_Breadhaus_and_Cafe.jpeg"), from_table(BAKERY[2]), {}),
    ("purple-yam", "Purple Yam Naval", "DESSERTS", "Famous for ube-flavored cakes, pastries and sweet desserts made from real purple yam. Open Monday to Saturday.", "Vicentillo Street, Naval, Biliran", "08:00", "18:30", [11.5631, 124.3964], "Bakery/Purple yam/purpleyamlogo.jpg", from_table(BAKERY[3]), {}),
    ("belles", "Belle's Cakes and Pastries", "DESSERTS", "A custom cake boutique for personalized celebration cakes, cupcakes, dessert buffets and handcrafted pastries. Open Monday to Saturday.", "P.I. Garcia Street, Naval, Biliran", "08:00", "18:00", [11.5598, 124.3958], "Bakery/Belles/belles logo.png", from_table(BAKERY[4]), {}),
    # ----- Carinderias -----
    ("jam-jay", "JAM JAY JABBY Eatery", "CARINDERIA", "Popular local eatery in Naval serving affordable, authentic home-cooked Filipino viands (lutong bahay), vegetable dishes and traditional main courses.", "Padre Inocentes Garcia St, Naval, Biliran", "06:00", "19:00", [11.5601, 124.3949], "Carinderia/JAM JAY JABBY EATERY/9bd5a8f5ab688adc4d599b5d2e5d7e8c.jpg", with_prices("jam-jay", from_table(CARINDERIA[1])), {}),
    ("antonios", "Antonio's Travelers Eatery", "CARINDERIA", "A convenient dining spot for travelers and locals with budget-friendly breakfast specials, classic Filipino stews and vegetable dishes.", "P. Inocentes St, Padre Inocentes Garcia, Naval, Biliran", "07:00", "20:00", [11.5608, 124.3925], "Carinderia/Antonio_s Travelers Eatery/pork adobo.jpg", with_prices("antonios", from_table(CARINDERIA[3])), {}),
    ("marb-marb", "Marb Marb Eatery", "CARINDERIA", "A well-known neighborhood eatery along P.I. Garcia Street with hearty Filipino homestyle cooking, fresh fish specials and budget meals.", "P.I. Garcia St, Naval, Biliran", "06:00", "19:30", [11.5594, 124.3951], "Carinderia/Marb Marb Eatery/fried chicken.jpg", with_prices("marb-marb", from_table(CARINDERIA[5])), {}),
    ("kunis", "Kunis Eatery", "CARINDERIA", "A friendly roadside eatery serving fresh home-style ulam, soup dishes and affordable vegetable options for student and worker budgets.", "P.I. Garcia St, Naval, Biliran", "06:30", "19:00", [11.5590, 124.3944], "Carinderia/Kunis Eatery/a375f42f6dc752b176c92997a7fa1a8d.jpg", with_prices("kunis", from_table(CARINDERIA[7])), {}),
    ("big-bu", "Big Bu Meals And Snacks", "CARINDERIA", "A casual neighborhood carinderia along Caibiran Cross-Country Road offering affordable Filipino lutong-bahay viands, fresh vegetable dishes and budget meals.", "Caibiran Cross-Country Road, Naval, Biliran", "06:30", "19:30", plus("HC72+H6X"), None, from_table(CARINDERIA[8]), {}),
    # ----- Home kitchens -----
    ("paul-beth", "Paul & Beth Eatery", "HOME_KITCHEN", "A cozy family-operated eatery offering homemade Filipino dishes, fresh seafood, savory soups and affordable rice meals.", "Caneja St, Naval, Biliran", "06:00", "17:00", [11.5617, 124.3947], "Home kitchen/Paul & Beth Eatery/adobo.jpg", from_table(HOME[1]), {}),
    ("marelous", "Marelous Eatery", "HOME_KITCHEN", "A popular eatery in Naval known for generous meal portions, flavorful meat stews, fried fish and tasty vegetable viands.", "Vicentillo St, Naval, Biliran", "06:00", "19:00", [11.5636, 124.3972], "Home kitchen/Marelous Eatery/fried chicken.jpg", from_table(HOME[3]), {}),
    # ----- Restaurants -----
    ("cusina-de-salas", "Cusina De Salas", "RESTAURANT", "A long-running casual restaurant centered on affordable, uncomplicated meals, for breakfast, lunch, takeout and delivery.", "Ballesteros St, corner Santissimo Rosario, Naval, Biliran", "06:00", "22:00", [11.56112, 124.39252], "RESTAURANTS/Cusina De Salas/Cusina De Salas.jpg", from_table(RESTO[0], ("name", "section", "description", "price")), {}),
    ("el-pomar", "El Pomar Bistro Café", "RESTAURANT", "A casual restaurant in a converted house serving Filipino comfort food, café fare and drinks. Open until 9 PM on Fridays and Saturdays.", "Sabenorio Street, Brgy. Santissimo Rosario, Naval, Biliran", "09:00", "19:30", [11.5622, 124.3929], "RESTAURANTS/El Pomar/El Pomar.jpg", TYPED["elpomar"], {}),
    ("diovannis", "Diovanni's Pizza House", "RESTAURANT", "A homemade Italian-style pizzeria specializing in pizza with pasta, chicken, burgers and other comfort food. Call for delivery: 0945 876 7221.", "Caraycaray, Naval, Biliran", "10:00", "18:30", [11.5746, 124.3984], "RESTAURANTS/Diovanni_s/Diovanni_s.jpg", TYPED["diovanni"], {}),
    ("mareola", "MAREOLA Filipino Resto", "RESTAURANT", "A Taste of Home, Your Great Choice. Traditional, affordable Filipino food in front of the BiPSU first gate.", "Padre Inocentes Street, in front of BiPSU first gate, Naval, Biliran", "09:00", "21:00", [11.5639, 124.4009], "RESTAURANTS/MAREOLA/Mareola.jpg", TYPED["mareola"], {}),
    ("dadaone", "D'Adaone Bar and Restaurant", "RESTAURANT", "A bar and restaurant serving Filipino, Asian, grilled and fusion food, for group dining and small occasions.", "2nd Floor, D'Mei Residence Inn, Caibiran Cross-Country Road, Naval, Biliran", "11:00", "23:00", plus("H97X+54J"), "RESTAURANTS/D_Adaone/D_Adaone.jpg", TYPED["dadaone"], {}),
    ("khloe", "Khloe Cafeteria + Café", "RESTAURANT", "A small, affordable cafeteria and café serving Asian-style meals, snacks and drinks, convenient for locals and students. Closes 3 PM on Sundays.", "P. Inocentes Street, Naval, Biliran", "07:00", "20:00", [11.5615, 124.3963], "RESTAURANTS/Khloe/Khloe.jpg", from_table(RESTO[1], ("name", "section", "description", "price")), {}),
    ("talyer-belly", "Talyer Belly", "RESTAURANT", "Best known for lechon belly. Closes at noon on Sundays.", "Vicentillo Street, Naval, Biliran", "08:00", "19:00", plus("H96V+VVH"), "RESTAURANTS/Talyer Belly/Talyer belly.jpg", [{"category": "Lechon", "name": "Lechon Belly (1/4 kg)", "price": 180.0, "description": "Crispy roasted pork belly, the house specialty.", "estimated": True, "photoSrc": "RESTAURANTS/Talyer Belly/Talyer belly.jpg"}], {}),
    ("jelos-place", "Jelo's Place", "RESTAURANT", "Hot meals since 2010: soups, pancit, pasta, sizzling plates and burgers. Shares its space with Lushan Tea.", NAVAL, "09:00", "21:00", [11.5627, 124.3990], D("milk-39-Jelo_s_Place.png"), TYPED["jelos"], {"unknownAddress": True}),
    ("rabak", "Rabak Food Station", "RESTAURANT", "Specialist of seafood: grilled, sinigang and tinola fish, pancit and Filipino favorites for sharing.", NAVAL, "10:00", "21:00", [11.5585, 124.3933], D("snack-12-Rabak_Food_Station.jpeg"), TYPED["rabak"], {"unknownAddress": True}),
    ("rallions", "Rallion's", "RESTAURANT", "Serving Naval since 2005: soups, pancit bilao, siopao, sandwiches and refreshing drinks.", NAVAL, "08:00", "20:00", [11.5603, 124.3978], D("snack-02-Rallion_s.jpeg"), TYPED["rallions"], {"unknownAddress": True}),
    # ----- Fast food -----
    ("jollibee", "Jollibee Naval", "FAST_FOOD", "Filipino fast food: Chickenjoy, burgers, Jolly Spaghetti and rice meals. A popular stop for families, students and travelers.", "P. Inocentes St, corner Magallanes Street, Naval, Biliran", "06:00", "22:00", [11.5609, 124.3941], "FAST FOOD/Jollibee/Jollibee.jpg", TYPED["jollibee"], {}),
    ("mcdonalds", "McDonald's Naval", "FAST_FOOD", "Burgers, chicken, fries, rice meals, desserts and breakfast. Open until midnight (1 AM on Saturdays).", "Sagrada Familia, Naval, Biliran", "07:00", "23:59", [11.5566, 124.3992], "FAST FOOD/McDonald_s/mcdo.jpg", TYPED["mcdo"], {}),
    ("mang-inasal", "Mang Inasal Naval", "FAST_FOOD", "Grilled chicken inasal, rice meals with unli-rice and Filipino desserts.", "P. Inocentes Street, corner Ballesteros Street, Naval, Biliran", "09:00", "21:00", plus("H96V+74J"), "FAST FOOD/Mang Inasal/Inasal.jpg", TYPED["inasal"], {}),
    ("weluisa", "Weluisa Food Court", "FAST_FOOD", "A well-known local dining hub since 1998 serving Filipino comfort food, cakes, snacks and affordable meals.", "P. Inocentes St, Naval, Biliran", "06:00", "20:00", plus("H96V+99X"), "FAST FOOD/Weluisa/Weluisa.jpg", from_table(RESTO[2], ("name", "section", "description", "price")), {}),
    ("cloud-burger", "Cloud Burger Pitstop", "FAST_FOOD", "Freshly made burgers and sides, buy one get one. Open late; on Thursdays to Saturdays until 4 AM.", "P. Inocentes Street, Brgy. Padre Inocentes Garcia, Naval, Biliran", "08:00", "23:59", [11.5619, 124.3971], "FAST FOOD/Cloud Burger/Cloud Burger.jpg", TYPED["cloudburger"], {}),
    # ----- Cafés -----
    ("lub-dub", "Lub Dub Café", "CAFE", "A trendy café serving signature coffee, matcha, frappes, all-day meals, pasta and desserts. Popular with students and young professionals.", "Gov. Sabonsolin Road, Sitio Lupa, Brgy. Calumpang, Naval, Biliran", "09:00", "20:00", [11.57064, 124.40171], "CAFES/Lub Dub/Lub Dub.jpg", TYPED["lubdub"], {}),
    ("forever", "Forever Café & Lounge", "CAFE", "Good food, good mood: coffee, milk tea, pizza, pasta, rice meals and comfort food in a cozy hangout.", "Forever Cafe Bldg, P. Inocentes St, Naval, Biliran", "09:00", "21:00", plus("H96W+P3W"), "CAFES/Forever/Forever.jpg", TYPED["forever"], {}),
    ("backyard-brews", "Backyard Brews Café", "CAFE", "A cozy, affordable café and dining spot with coffee, ramen, dumplings, rice meals, silog and snacks. Also does catering.", "Caraycaray, Naval, Biliran", "10:00", "21:00", [11.5752, 124.3992], "CAFES/Backyard Brews/Backyard Brews.jpg", TYPED["backyard"], {}),
    ("juanitas", "Juanita's Café", "CAFE", "A homey café for coffee, matcha, rice bowls, wings and pasta, frequented by students, families and travelers. Closed on Sundays.", "Padre Inocentes Garcia, Naval, Biliran", "07:00", "22:00", [11.5604, 124.3957], "CAFES/Juanita_s/Juanita_s.jpg", TYPED["juanita"], {}),
    ("la-maison", "La Maison Café", "CAFE", "A French-inspired café serving coffee, pastries, pasta, sandwiches and light meals in a cozy, stylish space.", "Corner Vicentillo and Castin Streets, Brgy. P.I. Garcia, Naval, Biliran", "08:00", "20:00", [11.5589, 124.3963], "CAFES/La Maison/La Maison.jpg", from_table(RESTO[3], ("name", "section", "description", "price")), {"hoursGuessed": True}),
    ("jusas", "JUSA's Tropical Smoothie Café", "CAFE", "Fresh fruit smoothies with combo meals, all-day breakfast, sizzling plates and snacks. A relaxed, affordable hangout.", "P. Inocentes St, Naval, Biliran", "08:00", "20:00", plus("H97X+7FW"), "CAFES/JUSA_s/JUSA_s.jpg", TYPED["jusa"], {"hoursGuessed": True}),
    ("max-cafe", "Max Café", "CAFE", "Coffee, fruit milk and fruit soda at pocket-friendly prices.", NAVAL, "08:00", "20:00", [11.5596, 124.3986], D("milk-43-Max_Cafe.jpeg"), TYPED["maxcafe"], {"unknownAddress": True, "hoursGuessed": True}),
    # ----- Milk tea and drinks -----
    ("cup-stop", "Cup Stop", "MILK_TEA_DRINKS", "Milk tea and coffee with budget rice meals and snacks. Closed on Sundays.", "P. Inocentes St, Naval, Biliran", "11:00", "20:00", plus("H97X+695"), "CAFES/Cup Stop/Cup Stop.jpg", TYPED["cupstop"], {}),
    ("sebu-cha", "Sebu Cha Milk Tea Station", "MILK_TEA_DRINKS", "Milk tea station with classic, premium, latte and frappe series, iced coffee and healthy fruit tea.", "P. Inocentes St, Brgy. P.I. Garcia, Naval, Biliran", "10:00", "21:00", [11.5613, 124.3952], D("milk-01-Sebu_Cha_Naval_Biliran.jpeg"), TYPED["sebucha"], {"hoursGuessed": True}),
    ("lushan", "Lushan Tea", "MILK_TEA_DRINKS", "Milk tea made of real tea leaves, brewed fresh daily: red, green, assam and oolong teas, smoothies and fresh juice. At Jelo's Place.", NAVAL, "09:00", "21:00", [11.5628, 124.3992], D("milk-37-Lushan_Tea.jpeg"), TYPED["lushan"], {"unknownAddress": True, "hoursGuessed": True}),
    # ----- Snacks and street food -----
    ("street-bites", "Street Bites Snack Bar", "SNACKS_STREET_FOOD", "Budget rice meals, takoyaki and milk tea.", NAVAL, "10:00", "20:00", [11.5581, 124.3967], D("milk-46-Streetbites_Snack_Bar.jpeg"), TYPED["streetbites"], {"unknownAddress": True, "hoursGuessed": True}),
    ("ja-snack", "J&A Snack Corner", "SNACKS_STREET_FOOD", "Milk tea, waffles, sushi rolls and Korean favorites. Korean dishes are on Fridays.", NAVAL, "10:00", "20:00", [11.5577, 124.3951], D("snack-16-J_and_A_Snack_Corner.jpeg"), TYPED["jasnack"], {"unknownAddress": True, "hoursGuessed": True}),
]

stores = []
seen = set()
for slug, name, kind, desc, address, opens, closes, pin, cover, menu, extra in S:
    assert slug not in seen, slug; seen.add(slug)
    folder, pics = PICS.get(slug, (None, {}))
    dishes = []
    for i, d in enumerate(menu):
        assert d["price"] is not None and d["price"] > 0, (slug, d)
        src = d.pop("photoSrc", None) or (os.path.join(folder, pics[d["name"]]) if d["name"] in pics else None)
        d["photo"] = photo(src, f"{slug}-{i + 1:02d}") if src else None
        dishes.append(d)
    stores.append({
        "slug": slug, "email": f"{slug}@feasto.com", "name": name, "storeType": kind, "description": desc,
        "address": address, "opensAt": opens, "closesAt": closes, "latitude": pin[0], "longitude": pin[1],
        "cover": photo(cover, f"{slug}-cover") if cover else None, "menu": dishes, **extra,
    })

json.dump(stores, open(os.path.join(OUT, "stores.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(stores), "stores,", sum(len(s["menu"]) for s in stores), "dishes,", sum(1 for s in stores for d in s["menu"] if d["photo"]), "with photos")
for s in stores:
    print(f"  {s['storeType']:<19} {s['name']:<34} {len(s['menu']):>3} dishes  {'(address?)' if s.get('unknownAddress') else ''}")
