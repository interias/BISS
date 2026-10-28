"""Matching recognised ingredients onto foods with the search (SPEC 7a, ADR-0009)."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.domain.macros import Macros
from app.plates.draft import PlateDraft, PlateIngredient
from app.plates.match import MIN_SCORE, certainty, match_food, match_plate
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
