"""Plausibility rules for the values of a label draft, checked in code (SPEC 7, ADR-0004)."""

from dataclasses import dataclass
from typing import Literal

from app.domain.atwater import Atwater, atwater
from app.labels.draft import LabelPer100

KJ_PER_KCAL = 4.184
# At most this deviation of the stated kJ from kcal · 4.184 is plausible.
MAX_ENERGY_DEVIATION_PCT = 5.0
# Absorbs float noise so that exactly 5 % still counts as ok.
_EPSILON = 1e-9

Rule = Literal["atwater", "energy", "sugar", "saturated_fat"]


@dataclass(frozen=True)
class Violation:
    rule: Rule
    detail: str


@dataclass(frozen=True)
class Check:
    atwater: Atwater
    violations: list[Violation]

    @property
    def ok(self) -> bool:
        return not self.violations


def check(per_100: LabelPer100) -> Check:
    """Atwater within 10 %, kJ ≈ kcal · 4.184 within 5 %, sugar ≤ carbs, saturated fat ≤ fat."""
    v = per_100
    result = atwater(v.energy_kcal, v.protein, v.carbs, v.fat, v.fiber)
    violations = []
    if not result.ok:
        deviation = "?" if result.deviation_pct is None else f"{result.deviation_pct:.1f} %"
        violations.append(
            Violation(
                "atwater",
                f"computed {result.computed_kcal:.0f} kcal differs by {deviation} "
                f"from {v.energy_kcal:g} kcal",
            )
        )
    expected_kj = v.energy_kcal * KJ_PER_KCAL
    if expected_kj != 0:
        energy_ok = (
            abs(v.energy_kj - expected_kj) * 100 / expected_kj
            <= MAX_ENERGY_DEVIATION_PCT + _EPSILON
        )
    else:
        energy_ok = v.energy_kj == 0
    if not energy_ok:
        violations.append(
            Violation("energy", f"{v.energy_kj:g} kJ is not {v.energy_kcal:g} kcal · 4.184")
        )
    if v.sugar is not None and v.sugar > v.carbs:
        violations.append(Violation("sugar", f"sugar {v.sugar:g} g above carbs {v.carbs:g} g"))
    if v.saturated_fat is not None and v.saturated_fat > v.fat:
        violations.append(
            Violation("saturated_fat", f"saturated fat {v.saturated_fat:g} g above fat {v.fat:g} g")
        )
    return Check(atwater=result, violations=violations)
