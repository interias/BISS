"""Food category: the group whose symbol a food without a photo shows (SPEC 4).

BLS foods take it from their code, Open Food Facts products from categories_tags, own
foods from the editor. The client only picks the symbol (ADR-0003).
"""

from collections.abc import Iterable
from enum import StrEnum


class Category(StrEnum):
    BREAD = "bread"
    GRAINS = "grains"
    FRUIT = "fruit"
    VEGETABLES = "vegetables"
    LEGUMES = "legumes"
    POTATOES = "potatoes"
    DAIRY = "dairy"
    EGGS = "eggs"
    MEAT = "meat"
    SAUSAGE = "sausage"
    FISH = "fish"
    FATS = "fats"
    SWEETS = "sweets"
    DRINKS = "drinks"
    DISHES = "dishes"
    OTHER = "other"


# BLS 4.0 main group (first letter of the code) -> category, checked against
# data/bls/bls_4_0_extract.csv. E and K hold two kinds each, split by the second character.
BLS_GROUPS = {
    "B": Category.BREAD,  # Brot und Kleingebäck
    "C": Category.GRAINS,  # Getreide, Mehl, Flocken, Reis, Cerealien
    "D": Category.SWEETS,  # Feine Backwaren: Kuchen, Kekse, Gebäck
    "E": Category.GRAINS,  # Teigwaren (E4–E9); Eier are E1–E3
    "F": Category.FRUIT,
    "G": Category.VEGETABLES,
    "H": Category.LEGUMES,  # Hülsenfrüchte, Nüsse, Samen, Soja, Tofu
    "K": Category.POTATOES,  # Kartoffeln, Stärke, Wurzeln (K1–K5); Pilze are K7–K8
    "M": Category.DAIRY,  # Milch, Milchprodukte, Käse
    "N": Category.DRINKS,  # alkoholfreie Getränke
    "P": Category.DRINKS,  # alkoholische Getränke
    "Q": Category.FATS,  # Fette und Öle
    "R": Category.OTHER,  # Gewürze, Salz, Würzmittel, Brühen, Backzutaten
    "S": Category.SWEETS,  # Süßwaren, Zucker, Speiseeis
    "T": Category.FISH,  # Fisch, Krusten- und Weichtiere
    "U": Category.MEAT,  # Fleisch
    "V": Category.MEAT,  # Wild, Geflügel, Innereien
    "W": Category.SAUSAGE,  # Wurst und Schinken
    "X": Category.DISHES,  # Gerichte, Suppen, Soßen
    "Y": Category.DISHES,  # Gerichte mit Zubereitung
}
BLS_SUBGROUPS = {
    "E1": Category.EGGS,
    "E2": Category.EGGS,
    "E3": Category.EGGS,
    "K7": Category.VEGETABLES,  # Pilze
    "K8": Category.VEGETABLES,  # Pilzerzeugnisse
}


def bls_category(code: str | None) -> Category | None:
    """The category of a BLS code such as "F503100"; None for an empty or unknown code."""
    if not code:
        return None
    return BLS_SUBGROUPS.get(code[:2]) or BLS_GROUPS.get(code[0])


# Open Food Facts categories_tags, in order: the first rule with a tag of the product wins,
# so milk before drinks and dairy desserts before sweets.
OFF_TAGS: tuple[tuple[Category, frozenset[str]], ...] = (
    (Category.EGGS, frozenset({"en:eggs", "en:chicken-eggs"})),
    (Category.DAIRY, frozenset({"en:dairies", "en:cheeses", "en:milks", "en:yogurts"})),
    (Category.SAUSAGE, frozenset({"en:sausages", "en:hams", "en:prepared-meats"})),
    (Category.MEAT, frozenset({"en:meats", "en:poultries"})),
    (Category.FISH, frozenset({"en:fishes", "en:seafood"})),
    (Category.FATS, frozenset({"en:fats", "en:vegetable-oils", "en:butters", "en:margarines"})),
    (Category.BREAD, frozenset({"en:breads"})),
    (
        Category.SWEETS,
        frozenset(
            {
                "en:sweet-snacks",
                "en:confectioneries",
                "en:chocolates",
                "en:biscuits-and-cakes",
                "en:sweet-spreads",
                "en:desserts",
                "en:ice-creams",
                "en:sugars",
            }
        ),
    ),
    (Category.DRINKS, frozenset({"en:beverages"})),
    (Category.POTATOES, frozenset({"en:potatoes"})),
    (
        Category.GRAINS,
        frozenset(
            {"en:cereals-and-their-products", "en:breakfast-cereals", "en:pastas", "en:rices"}
        ),
    ),
    (Category.LEGUMES, frozenset({"en:legumes", "en:nuts", "en:seeds"})),
    (Category.FRUIT, frozenset({"en:fruits"})),
    (Category.VEGETABLES, frozenset({"en:vegetables", "en:mushrooms"})),
    (Category.DISHES, frozenset({"en:meals", "en:soups", "en:pizzas"})),
)


def off_category(tags: Iterable[str] | None) -> Category:
    """The category of an Open Food Facts product by its categories_tags; else other."""
    found = {tag for tag in tags or () if isinstance(tag, str)}
    for category, known in OFF_TAGS:
        if found & known:
            return category
    return Category.OTHER
