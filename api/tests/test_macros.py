from dataclasses import dataclass

import pytest

from app.domain.macros import Macros, macro_snapshot


@dataclass
class FoodValues:
    kcal: float
    protein: float
    carbs: float
    fat: float


BANANA = FoodValues(kcal=79, protein=1.14, carbs=18.8, fat=0.17)


def test_snapshot_scales_values_per_100_g() -> None:
    assert macro_snapshot(BANANA, 120) == Macros(kcal=94.8, protein=1.4, carbs=22.6, fat=0.2)


def test_snapshot_for_100_g_equals_values_per_100_g() -> None:
    assert macro_snapshot(BANANA, 100) == Macros(kcal=79, protein=1.1, carbs=18.8, fat=0.2)


def test_changed_amount_gives_new_snapshot() -> None:
    before = macro_snapshot(BANANA, 120)
    after = macro_snapshot(BANANA, 240)
    assert after.kcal == pytest.approx(2 * before.kcal)
    assert after == Macros(kcal=189.6, protein=2.7, carbs=45.1, fat=0.4)


@pytest.mark.parametrize("grams", [0, -5])
def test_amount_must_be_positive(grams: float) -> None:
    with pytest.raises(ValueError):
        macro_snapshot(BANANA, grams)
