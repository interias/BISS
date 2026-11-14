"""Matching recognised ingredients onto foods with the search (SPEC 7a, ADR-0009)."""

import asyncio
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.domain.macros import Macros
from app.plates.draft import PlateDraft, PlateIngredient
from app.plates.extract import pick_foods
from app.plates.extractor import ExtractionFailed, FakePlateExtractor
from app.plates.match import MIN_SCORE, certainty, match_food, match_plate, plate_asks
from app.search.search import search_foods
from tests.factories import add_cached, add_food


def plate(*ingredients: tuple[str, float, float]) -> PlateDraft:
    items = [PlateIngredient(name=n, grams=g, confidence=c) for n, g, c in ingredients]
    return PlateDraft(dish="Hähnchen mit Reis", ingredients=items, notes="Soße unsicher")


def test_ingredient_takes_the_best_food_of_the_search(session: Session) -> None:
    rice = add_food(session, "Reis gekocht", kcal=112, source="bls")
    add_food(session, "Reis Mehl", kcal=347, source="bls")
    assert match_food(session, "Reis gekocht") == rice


def test_ingredient_without_a_hit_is_unmatched(session: Session) -> None:
    add_food(session, "Reis gekocht", kcal=112)
    assert match_food(session, "Seetang") is None


def test_a_similar_name_below_the_minimum_score_is_no_match(session: Session) -> None:
    add_food(session, "Seeteufel roh", kcal=66, source="bls")
    [hit] = search_foods(session, "Seetang")
    assert hit.score < MIN_SCORE
    assert match_food(session, "Seetang") is None


def test_a_cached_product_is_passed_over_for_the_next_food(session: Session) -> None:
    add_cached(
        session, "2000000000015", datetime.now(UTC), product_name_de="Reis gekocht", brands=None
    )
    food = add_food(session, "Reis gekocht mit Butter", kcal=140, source="bls")
    hits = search_foods(session, "Reis gekocht")
    assert [h.id for h in hits] == [None, food.id]
    assert match_food(session, "Reis gekocht") == food


def test_certainty_from_confidence_0_7_on() -> None:
    assert [certainty(c) for c in (0.69, 0.7, 1.0)] == ["guessed", "recognized", "recognized"]


def test_plate_items_values_and_totals_over_the_matched(session: Session) -> None:
    rice = add_food(session, "Reis gekocht", kcal=112, protein=2.4, carbs=24.5, fat=0.4)
    chicken = add_food(
        session, "Hähnchen Brustfilet, gegrillt", kcal=140, protein=29, carbs=0, fat=2.4
    )
    found = match_plate(
        session,
        plate(
            ("Reis gekocht", 150.4, 0.9),
            ("Hähnchen Brustfilet, gegrillt", 120, 0.6),
            ("Seetang", 10, 0.4),
        ),
    )
    assert (found.dish, found.notes) == ("Hähnchen mit Reis", "Soße unsicher")
    rice_item, chicken_item, unmatched = found.items
    assert (rice_item.food, rice_item.grams, rice_item.certainty) == (rice, 150, "recognized")
    assert rice_item.macros == Macros(kcal=168.0, protein=3.6, carbs=36.8, fat=0.6)
    assert (chicken_item.food, chicken_item.certainty) == (chicken, "guessed")
    assert chicken_item.macros == Macros(kcal=168.0, protein=34.8, carbs=0.0, fat=2.9)
    assert (unmatched.name, unmatched.food, unmatched.macros) == ("Seetang", None, None)
    assert (unmatched.grams, unmatched.certainty) == (10, "guessed")
    assert found.totals == Macros(kcal=336.0, protein=38.4, carbs=36.8, fat=3.5)


def test_plate_leaves_out_amounts_of_zero_and_keeps_small_ones(session: Session) -> None:
    add_food(session, "Sesam", kcal=565)
    found = match_plate(session, plate(("Sesam", 0, 0.9), ("Sesam", 0.3, 0.9)))
    [item] = found.items
    assert item.grams == 0.3


def test_plate_without_any_match_totals_zero(session: Session) -> None:
    found = match_plate(session, plate(("Seetang", 10, 0.9)))
    assert found.totals == Macros(kcal=0, protein=0, carbs=0, fat=0)


def test_asks_only_where_the_best_hit_does_not_carry_the_name(session: Session) -> None:
    rice = add_food(session, "Reis gekocht", kcal=112, source="bls")
    falafel = add_food(session, "Falafel (Kichererbsenbällchen) frittiert", kcal=330, source="bls")
    truffle = add_food(session, "Trüffel gebraten ohne Fett", kcal=30, source="bls")
    draft = plate(("Reis gekocht", 150, 0.9), ("Falafel gebraten", 80, 0.9), ("Tempeh", 50, 0.6))

    asks = plate_asks(session, draft)

    # Rice is certain, tempeh has no candidate at all: only the falafel is asked.
    assert list(asks) == [1]
    ask = asks[1]
    assert ask.name == "Falafel gebraten"
    # The first word alone finds the falafel the whole name misses.
    assert falafel in ask.candidates
    assert rice not in ask.candidates
    best = match_food(session, "Falafel gebraten")
    assert ask.default == (None if best is None else ask.candidates.index(best))
    assert best in (None, truffle)


def test_picked_foods_replace_the_search_and_none_leaves_the_ingredient_unmatched(
    session: Session,
) -> None:
    rice = add_food(session, "Reis gekocht", kcal=112, source="bls")
    stew = add_food(session, "Kichererbsen-Eintopf", kcal=62, source="bls")
    peas = add_food(session, "Kichererbse reif, gekocht", kcal=120, source="bls")
    draft = plate(("Reis gekocht", 150, 0.9), ("Kichererbsen", 70, 0.9), ("Kichererbsen", 30, 0.9))

    found = match_plate(session, draft, {1: peas, 2: None})

    assert [item.food for item in found.items] == [rice, peas, None]
    assert found.items[1].macros.kcal == 84.0
    assert stew not in [item.food for item in found.items]


def test_pick_foods_asks_once_and_falls_back_to_the_search(session: Session) -> None:
    add_food(session, "Kichererbsen-Eintopf", kcal=62, source="bls")
    peas = add_food(session, "Kichererbse reif, gekocht", kcal=120, source="bls")
    asks = plate_asks(session, plate(("Kichererbsen gewürzt", 70, 0.9)))
    [ask] = asks.values()

    class Picker(FakePlateExtractor):
        def __init__(self, answer) -> None:
            super().__init__()
            self.answer = answer

        async def pick(self, asks, model):
            if isinstance(self.answer, Exception):
                raise self.answer
            return self.answer

    def pick(answer):
        return asyncio.run(pick_foods(Picker(answer), asks, "fast-model"))

    assert pick([ask.candidates.index(peas)]) == {0: peas}
    assert pick([None]) == {0: None}
    # No usable answer: what the search alone takes.
    fallback = None if ask.default is None else ask.candidates[ask.default]
    assert pick(ExtractionFailed("cli gone")) == {0: fallback}
    assert pick([]) == {0: fallback}
    # Nothing to ask: no call at all.
    assert asyncio.run(pick_foods(Picker(ExtractionFailed("never")), {}, "m")) == {}
