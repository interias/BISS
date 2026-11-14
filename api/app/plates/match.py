"""Matching the recognised ingredients onto foods with the search of SPEC 6 (ADR-0009).

An ingredient takes the best search hit that is a food and scores at least MIN_SCORE.
Without one it stays unmatched: no food, no values, nothing invented. The values of a
matched ingredient are those an entry of that amount would store (services.entries).

The search goes by letters, so it takes "Trüffel gebraten" for "Falafel gebraten" and a
"Kichererbsen-Eintopf" for seasoned chickpeas. Where the best hit does not carry the very
name of the ingredient, plate_asks() lists candidates and the model chooses among them or
none (extract.pick_foods); it still cannot invent a food. The candidates come from several
searches (_queries), because the BLS names many foods differently than the model does.
"""

import re
from dataclasses import dataclass
from typing import Literal

from sqlalchemy.orm import Session

from app.domain.macros import Macros, total
from app.models import Food
from app.plates.draft import PlateDraft
from app.search.normalize import normalize
from app.search.search import search_foods
from app.services.entries import snapshot

# Score of the search: text similarity up to 3 plus a little for source and completeness.
# Probed on the full BLS: below 1.6 the best hit was nearly always another food
# ("Seetang" -> "Seeteufel", "Edamame gekocht" -> "Eier gekocht"); see ADR-0009.
MIN_SCORE = 1.6
# Hits looked at; a cached Open Food Facts product (not yet a food) is passed over.
CANDIDATES = 5
# From this confidence on an ingredient counts as recognised, below it as guessed.
RECOGNIZED = 0.7

Certainty = Literal["recognized", "guessed"]


@dataclass(frozen=True)
class PlateItem:
    name: str
    grams: float
    confidence: float
    certainty: Certainty
    # None: no food matched, and then no macros either.
    food: Food | None
    macros: Macros | None


@dataclass(frozen=True)
class Plate:
    dish: str
    items: list[PlateItem]
    # Over the matched items only.
    totals: Macros
    notes: str


def match_food(session: Session, name: str) -> Food | None:
    """The best food of the search for the name, if it scores at least MIN_SCORE."""
    for hit in search_foods(session, name, limit=CANDIDATES):
        if hit.score < MIN_SCORE:
            return None
        if hit.id is not None:
            return session.get(Food, hit.id)
    return None


def certainty(confidence: float) -> Certainty:
    return "recognized" if confidence >= RECOGNIZED else "guessed"


@dataclass(frozen=True)
class Ask:
    """An ingredient whose food is not certain: candidates, and what match_food would take."""

    name: str
    candidates: list[Food]
    # Index into candidates; None: match_food finds no food.
    default: int | None


# Words of a name that say how the food is prepared or served, not which food it is
# (normalised as the search does).
_PREPARATION = frozenset(
    {"roh", "gekocht", "gebraten", "gegrillt", "gebacken", "geduenstet", "gegart"}
    | {"frittiert", "geschmort", "gewuerzt", "geraeuchert", "geschaelt", "getrocknet"}
    | {"gemischt", "paniert", "mit", "ohne", "und", "aus", "haut", "fett", "salz"}
)
# What the BLS calls the food a word ends in: "Aprikosenkonfitüre" is a "Konfitüre".
_HEADS = {
    "konfituere": "Konfitüre",
    "marmelade": "Konfitüre",
    "haferbrei": "Porridge",
    "broetchen": "Brötchen",
}
# Words of a name searched on their own.
_WORDS = 4


def _queries(name: str) -> list[str]:
    """What to search for a name: the whole name and its first word ("Falafel" of "Falafel
    gebraten"), then what finds a food the BLS names differently: the name without the
    preparation, its first two words as one ("Hähnchen Schenkel" is "Hähnchenschenkel"),
    each word ("Pesto" of "Basilikum-Pesto") and the food a word ends in. A sauce is
    searched in both spellings: the BLS has "Champignonsauce" and "Bratensoße"."""
    name = name.strip()
    head = re.split(r"[ ,]", name, maxsplit=1)[0]
    words = [
        word
        for word in re.split(r"[ ,/-]+", name)
        if len(normalize(word)) >= 3 and normalize(word) not in _PREPARATION
    ][:_WORDS]
    heads = [
        food for word in words for end, food in _HEADS.items() if normalize(word).endswith(end)
    ]
    queries = [name, head, " ".join(words), "".join(words[:2]), *words, *heads]
    queries += [_SAUCE.sub(_respell, query) for query in queries]
    return list(dict.fromkeys(queries))


_SAUCE = re.compile("sauce|soße|sosse", re.IGNORECASE)


def _respell(match: re.Match[str]) -> str:
    return "soße" if match[0].lower() == "sauce" else "sauce"


def _candidates(session: Session, name: str) -> list[Food]:
    """Foods the searches of _queries() find, those for the whole name first."""
    found: dict[int, Food] = {}
    for query in _queries(name):
        if not normalize(query):
            continue
        for hit in search_foods(session, query, limit=CANDIDATES):
            if hit.id is not None and hit.id not in found:
                found[hit.id] = session.get(Food, hit.id)
    return list(found.values())


def plate_asks(session: Session, draft: PlateDraft) -> dict[int, Ask]:
    """Per index of an ingredient the question for the model; none where the best hit has
    the very name of the ingredient, and none without any candidate."""
    asks = {}
    for index, ingredient in enumerate(draft.ingredients):
        best = match_food(session, ingredient.name)
        if best is not None and normalize(best.name) == normalize(ingredient.name):
            continue
        candidates = _candidates(session, ingredient.name)
        if best is not None and best not in candidates:
            candidates.insert(0, best)
        if candidates:
            default = None if best is None else candidates.index(best)
            asks[index] = Ask(ingredient.name, candidates, default)
    return asks


def match_plate(
    session: Session, draft: PlateDraft, picked: dict[int, Food | None] | None = None
) -> Plate:
    """Each ingredient with a positive amount, matched or not, and the totals of the matched.

    `picked` gives the food per index of an ingredient where the model chose it (None: no
    food); the others take the best search hit. Amounts are rounded to whole grams (at least
    0.1 g). An amount of 0 g or less, left in a draft the strong model could not replace, is
    no food on the plate and is left out.
    """
    picked = picked or {}
    items = []
    for index, ingredient in enumerate(draft.ingredients):
        if ingredient.grams <= 0:
            continue
        grams = float(round(ingredient.grams)) or round(max(ingredient.grams, 0.1), 1)
        food = picked[index] if index in picked else match_food(session, ingredient.name)
        items.append(
            PlateItem(
                name=ingredient.name,
                grams=grams,
                confidence=ingredient.confidence,
                certainty=certainty(ingredient.confidence),
                food=food,
                macros=None if food is None else snapshot(food, grams),
            )
        )
    totals = total(item.macros for item in items if item.macros is not None)
    return Plate(draft.dish, items, totals, draft.notes)
