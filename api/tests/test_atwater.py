import pytest

from app.domain.atwater import atwater


@pytest.mark.parametrize(
    ("carbs", "deviation", "ok"),
    [
        (27.475, 9.9, True),  # computed 109.9 kcal
        (27.5, 10.0, True),  # exactly 10 % is still ok
        (27.525, 10.1, False),  # computed 110.1 kcal
        (22.525, 9.9, True),  # computed 90.1 kcal, below the stated value
        (22.475, 10.1, False),  # computed 89.9 kcal
    ],
)
def test_deviation_limit_is_10_percent_of_kcal(carbs: float, deviation: float, ok: bool) -> None:
    result = atwater(kcal=100, protein=0, carbs=carbs, fat=0)
    assert result.deviation_pct == pytest.approx(deviation)
    assert result.ok is ok


def test_formula_counts_fiber_twice_and_fat_nine_times() -> None:
    result = atwater(kcal=79, protein=1.3, carbs=15.9, fat=0.4, fiber=2)
    assert result.computed_kcal == pytest.approx(4 * 15.9 + 4 * 1.3 + 9 * 0.4 + 2 * 2)
    assert result.ok


def test_missing_fiber_counts_as_0() -> None:
    assert atwater(100, 5, 10, 5).computed_kcal == atwater(100, 5, 10, 5, fiber=0).computed_kcal


def test_zero_kcal() -> None:
    assert atwater(0, 0, 0, 0) == atwater(0, 0, 0, 0, None)
    assert (atwater(0, 0, 0, 0).deviation_pct, atwater(0, 0, 0, 0).ok) == (0.0, True)
    # No percentage of 0 kcal; a few kcal from "< 0,5 g" values are still plausible.
    assert (atwater(0, 0, 1, 0).deviation_pct, atwater(0, 0, 1, 0).ok) == (None, True)
    assert (atwater(0, 0, 3, 0).deviation_pct, atwater(0, 0, 3, 0).ok) == (None, False)


def test_a_difference_up_to_10_kcal_is_plausible_for_small_values() -> None:
    # Monster Zero (tests/fixtures/real/labels): 2 kcal stated, 0.9 g carbs.
    zero_drink = atwater(kcal=2, protein=0, carbs=0.9, fat=0)
    assert zero_drink.deviation_pct == pytest.approx(80)
    assert zero_drink.ok
    assert atwater(kcal=20, protein=0, carbs=7.5, fat=0).ok  # 30 computed
    assert not atwater(kcal=20, protein=0, carbs=7.6, fat=0).ok  # 30.4 computed


def test_alcohol_counts_7_kcal_per_gram() -> None:
    # Bitburger Winterbock (tests/fixtures/real/labels): 63 kcal, 6 g carbs, 0.5 g protein.
    assert not atwater(kcal=63, protein=0.5, carbs=6, fat=0).ok
    beer = atwater(kcal=63, protein=0.5, carbs=6, fat=0, alcohol_vol=7)
    assert beer.computed_kcal == pytest.approx(26 + 7 * 0.789 * 7)
    assert beer.ok
