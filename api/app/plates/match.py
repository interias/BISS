"""Matching the recognised ingredients onto foods with the search of SPEC 6 (ADR-0009).

An ingredient takes the best search hit that is a food and scores at least MIN_SCORE.
Without one it stays unmatched: no food, no values, nothing invented. The values of a
matched ingredient are those an entry of that amount would store (services.entries).
"""

from dataclasses import dataclass
from typing import Literal

from sqlalchemy.orm import Session

from app.domain.macros import Macros, total
from app.models import Food
from app.plates.draft import PlateDraft
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


def match_plate(session: Session, draft: PlateDraft) -> Plate:
    """Each ingredient with a positive amount, matched or not, and the totals of the matched.

    Amounts are rounded to whole grams (at least 0.1 g). An amount of 0 g or less, left in a
    draft the strong model could not replace, is no food on the plate and is left out.
    """
    items = []
    for ingredient in draft.ingredients:
        if ingredient.grams <= 0:
            continue
        grams = float(round(ingredient.grams)) or round(max(ingredient.grams, 0.1), 1)
        food = match_food(session, ingredient.name)
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
