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
    assert (atwater(0, 0, 1, 0).deviation_pct, atwater(0, 0, 1, 0).ok) == (None, False)
