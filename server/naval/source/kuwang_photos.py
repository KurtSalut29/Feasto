"""Dish photos that came later, in web/public/Kuwang ("kuwang" = what was missing).

Used by build_naval.py (when rebuilding everything) and by apply_kuwang.py (to add them to
stores.json, photos/ and a running database without starting over).
"""
import os

KUWANG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "web", "public", "Kuwang")

# slug -> (folder inside Kuwang, {dish name in the menu: photo file})
KUWANG_PICS = {
    "big-bu": ("Big Bu/Menu", {
        "Pinakbet": "pinakbet.jpg", "Ginisang Sayote": "ginisang Sayote.jpg", "Tortang Talong": "tortang talong.jpg",
        "Pork Afritada": "pork afritada.jpg", "Bicol Express": "bicol Express. jpg", "Chicken Adobo": "chicken adobo.jpg",
        "Ginataang Isda": "ginataang isda.jpg",
    }),
    "cusina-de-salas": ("Restaurants/Cusina De Salas", {
        "Lomi": "Lomi.jpg", "Bulalo": "Bulalo.jpg", "Chicken Inasal": "chicken inasal.jpg", "Pancit Canton": "pancit canton.jpg",
        "Chicken Liver": "chickem liver.jpg", "Pork Adobo": "pork adobo.jpg", "Pork Sisig": "pork sisig.jpg",
        "Fried Chicken": "fried chicken.jpg", "Chopsuey": "chopsuey.jpg", "Garlic Rice": "garlic rice.jpg",
        "Plain Rice": "plain rice.jpg", "Iced Tea": "iced tea.jpg", "Mango Shake": "mango shake.jpg",
        "Soft Drinks": "soft drinks.jpg", "Bottled Water": "bottled water.jpg",
    }),
    "khloe": ("Restaurants/Khloe", {
        "Chicken Adobo": "Chicken Adobo.jpg", "Pork Menudo": "pork menudo.jpg", "Beef Caldereta": "beef caldereta.jpg",
        "Fried Chicken Meal": "fried chicken.jpg", "Pork Sisig Meal": "pork sisig meal.jpg", "Pancit Canton": "pancit canton.jpg",
        "Spaghetti": "spaghetti.jpg", "Burger": "burger.jpg", "French Fries": "french fries.jpg", "Halo-Halo": "halo halo.jpg",
        "Chocolate Cake": "chocolate cake.jpg", "Hot Coffee": "hot coffee.jpg", "Iced Coffee": "iced coffee.jpg",
        "Milk Tea": "milktea.jpg", "Fruit Shake": "fruit shake.jpg",
    }),
    # The file names are random, so each picture was matched by looking at it
    "weluisa": ("Weluisa/menu pictures", {
        "Lechon Manok": "95d97a54a9de043aae9f6f86069e7020.jpg", "Liempo": "6939dde0d69630c52d86eede90ef5a8d.jpg",
        "Pork Adobo": "799300904b8a5cd5703f0fb4158cd073 (1).jpg", "Chicken Curry": "c06fa6cfa34207a63aeec8e3bbe9df40.jpg",
        "Pork Menudo": "1414bd21e9f5689e7526793736cadb0f.jpg", "Pancit Bam-i": "6c52eeab6c435a91dfda4a02d7259c6c.jpg",
        "Pancit Canton": "cbf05a13a9eacb70508bcd1a5415df7f.jpg", "Suman Balintawak": "357279cdc6b77807fabe69ad7e74d56d.jpg",
        "Custard Cake": "0de442eb9ee81e7685c5734abc77303a.jpg", "Cupcakes": "dabe0ee18e8dec73b6c17d90f58ff954.jpg",
        "Crema de Fruita": "87efc25610dd498c382d0246407bc2f6.jpg", "Yema Cake": "373eb607917ac11a8517dc392dbf3da5.jpg",
        "Deep Dark Chocolate Cake": "4c2acaaf77cdd79e9e4c2108d53fe7e8.jpg", "Black Forest Cake": "a3a113f06405982ce996486b31276840.jpg",
        "Plain Rice": "2089b8049b7024ff095ed034d9060bfd.jpg", "Iced Tea": "e396093d4cdc58b5406dea93e54a41f5 (2).jpg",
        "Soft Drinks": "54cbb6a7df479c452c0b8ef7c122f0a8.jpg", "Bottled Water": "12a730c7d6121283ad2963270dbedbd5.jpg",
    }),
    "la-maison": ("Cafe/La Maison Cafe", {
        "Café Americano": "Café Americano.jpg", "Café Latte": "café latte.jpg", "Cappuccino": "cappuccino.jpg",
        "Caramel Macchiato": "caramel macchiato.jpg", "Spanish Latte": "Spanish latte.jpg", "Iced Mocha": "Iced Mocha.jpg",
        "Matcha Latte": "matcha latte.jpg", "Hot Chocolate": "hot chocolate.jpg", "Chicken Alfredo Pasta": "chicken Alfredo pasta.jpg",
        "Carbonara": "carbonara.jpg", "Spaghetti Bolognese": "spaghetti Bolognese.jpg", "Clubhouse Sandwich": "clubhouse sandwich.jpg",
        "Chicken Sandwich": "chicken sandwich.jpg", "Chicken Wings": "chicken wings.jpg", "French Fries": "french fries.jpg",
        "Chocolate Cake": "chocolate cake.jpg", "Blueberry Cheesecake": "blueberry cheesecake.jpg", "Brownies": "brownies.jpg",
        "Mango Shake": "mango shake.jpg", "Strawberry Smoothie": "strawberry smoothie.jpg",
    }),
    "juanitas": ("Cafe/Juanita_s Cafe", {
        "Biscoff Latte": "biscoff latte.jpg", "Buttercream Latte": "buttercream latte.jpg", "Spanish Latte": "Spanish latte.jpg",
        "Sea Salt Latte": "sea salt latte.jpg", "Cinnamon Cream": "cinnamon cream.jpg",
        "Sea Salt Oat Latte": "sea salt oat latte.jpg", "Spanish Oat": "Spanish oat.jpg", "Hazelnut Oat": "hazelnut oat.jpg",
        "Matcha Oat Latte": "matcha oat latte.jpg", "Sea Salt Matcha Oat": "sea salt matcha oat.jpg", "Biscoff Oat Latte": "biscoff oat latte.jpg",
        "Matcha Latte": "matcha latte.jpg", "Sea Salt Matcha": "sea salt matcha.jpg", "Matcha Espresso": "matcha Expresso.jpg",
        "Blueberry Matcha": "blueberry matcha.jpg", "Strawberry Matcha": "strawberry matcha.jpg",
        "Strawberry Latte": "strawberry latte.jpg", "Blueberry Latte": "blueberry latte.jpg", "Choco Berry": "choco berry.jpg",
        "Ice Chocolate": "ice chocolate.jpg", "Biscoff": "biscoff.jpg",
        "Americano": "americano.jpg", "Latte": "latte.jpg", "Cappuccino": "cappuccino.jpg", "Caramel Macchiato": "caramel macchiato.jpg",
        "Mocha": "mocha.jpg", "White Mocha": "white mocha.jpg",
        "Vienna Coffee": "Vienna coffee.jpg", "Cinnamon Toast": "cinnamon toast.jpg", "Pistachio Latte": "pistachio latte.jpg",
        "Soy Garlic Chicken": "soy garlic chicken.jpg", "Salted Egg Wings": "salted egg.jpg",
        "Chicken Alfredo": "chicken Alfredo.jpg", "Pesto Chicken": "pesto chicken.jpg", "Bolognese": "Bolognese.jpg",
        "Truffle Carbonara": "truffle carbonara.jpg",
        "Korean Ramen": "Korean ramen.jpg", "Regular Fries": "regular fries.jpg", "Cheese Fries": "cheese fries.jpg",
        "Garlic Bread": "garlic bread.jpg", "Kimchi Rice": "kimchi rice.jpg",
    }),
    "cup-stop": ("Cafe/Cup stop", {
        "Taro Milktea (16 oz)": "Taro Milktea.jpg", "Matcha Tea Milktea (16 oz)": "Matcha Tea Milktea.jpg",
        "Wintermelon Milktea (16 oz)": "Wintermelon Milktea.jpg", "Chocolate Milktea (16 oz)": "Chocolate Milktea.jpg",
        "Caramel Milktea (16 oz)": "Caramel Milktea.jpg", "Biscoff Frappe (16 oz)": "Biscoff.jpg",
        "Dark Choco w/ Oreo (16 oz)": "Dark Choco w_ Oreo.jpg", "Oreo Dreams (16 oz)": "Oreo Dreams.jpg",
        "Matcha": "Matcha.jpg", "Matcha Dream": "Matcha Dream.jpg", "Matcha Berry": "Matcha Berry.jpg",
        "Green Matcha": "Green Matcha.jpg", "Matcha Chocolate": "Matcha Chocolate.jpg",
        "Cookies & Cream (16 oz)": "Cookies & Cream.jpg", "Dark Chocolate (16 oz)": "Dark Chocolate.jpg",
        "Red Velvet Chocolate (16 oz)": "Red Velvet Chocolate.jpg", "Winter Choco (16 oz)": "Winter Choco.jpg",
        "Chocolate (16 oz)": "Chocolate.jpg", "Mango Matcha (16 oz)": "Mango Matcha.jpg",
        "Strawberry (16 oz)": "Strawberry.jpg", "Blueberry (16 oz)": "Blueberry.jpg",
    }),
}

# Big Bu had no picture of its own: like the other carinderias, a food photo stands in for it
BIG_BU_COVER = os.path.join(KUWANG, "Big Bu/Menu/pinakbet.jpg")


def kuwang_photo(slug, dish_name):
    """The full path of a Kuwang photo for this dish, or None."""
    folder, pics = KUWANG_PICS.get(slug, (None, {}))
    return os.path.join(KUWANG, folder, pics[dish_name]) if dish_name in pics else None
