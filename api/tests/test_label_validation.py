"""Plausibility rules of a label draft (SPEC 7), each with a passing and a failing case."""

import pytest

from app.labels.draft import LabelPer100
from app.labels.validation import check


def per_100(**values: float | None) -> LabelPer100:
    """100 kcal from 25 g carbs, 418.4 kJ: passes every rule unless overridden."""
    base = {
        "basis": "g",
        "state": "as_sold",
        "energy_kj": 418.4,
        "energy_kcal": 100,
        "fat": 0,
        "saturated_fat": 0,
        "carbs": 25,
        "sugar": 0,
        "fiber": 0,
        "protein": 0,
        "salt": 0,
    }
    return LabelPer100.model_validate(base | values)


def rules(values: LabelPer100) -> list[str]:
    return [violation.rule for violation in check(values).violations]


def test_plausible_values_pass() -> None:
    result = check(per_100())
    assert result.ok
    assert result.violations == []
    assert result.atwater.computed_kcal == pytest.approx(100)


@pytest.mark.parametrize(
    ("carbs", "ok"),
    [
        (27.5, True),  # computed 110 kcal: exactly 10 % is still ok
        (27.525, False),  # 110.1 kcal
        (22.5, True),  # 90 kcal
        (22.475, False),  # 89.9 kcal
    ],
)
def test_atwater_allows_10_percent(carbs: float, ok: bool) -> None:
    assert rules(per_100(carbs=carbs)) == ([] if ok else ["atwater"])


def test_atwater_counts_fiber_and_fat() -> None:
    values = per_100(energy_kcal=200, energy_kj=836.8, carbs=25, fat=10, fiber=5)
    assert check(values).atwater.computed_kcal == pytest.approx(200)
    assert rules(values) == []


@pytest.mark.parametrize(
    ("kj", "ok"),
    [
        (439.32, True),  # exactly 5 % above 100 kcal · 4.184
        (439.4, False),
        (397.48, True),  # exactly 5 % below
        (397.4, False),
    ],
)
def test_kj_within_5_percent_of_kcal_times_4_184(kj: float, ok: bool) -> None:
    assert rules(per_100(energy_kj=kj)) == ([] if ok else ["energy"])


def test_kj_and_kcal_swapped_is_caught() -> None:
    assert "energy" in rules(per_100(energy_kj=100, energy_kcal=418))


def test_zero_energy_needs_zero_kj() -> None:
    assert rules(per_100(energy_kcal=0, energy_kj=0, carbs=0)) == []
    assert rules(per_100(energy_kcal=0, energy_kj=5, carbs=0)) == ["energy"]


@pytest.mark.parametrize(("sugar", "ok"), [(25, True), (25.1, False), (None, True)])
def test_sugar_at_most_carbs(sugar: float | None, ok: bool) -> None:
    assert rules(per_100(sugar=sugar)) == ([] if ok else ["sugar"])


@pytest.mark.parametrize(("saturated_fat", "ok"), [(5, True), (5.1, False), (None, True)])
def test_saturated_fat_at_most_fat(saturated_fat: float | None, ok: bool) -> None:
    values = per_100(energy_kcal=145, energy_kj=606.68, fat=5, saturated_fat=saturated_fat)
    assert rules(values) == ([] if ok else ["saturated_fat"])


def test_several_violations_are_all_reported() -> None:
    values = per_100(energy_kj=900, carbs=40, sugar=50, fat=1, saturated_fat=2)
    assert rules(values) == ["atwater", "energy", "sugar", "saturated_fat"]
    assert not check(values).ok
