"""Macro snapshot of an entry, computed from the food's values per 100 g."""

from dataclasses import dataclass
from typing import Protocol


class Per100(Protocol):
    kcal: float
    protein: float
    carbs: float
    fat: float


@dataclass(frozen=True)
class Macros:
    kcal: float
    protein: float
    carbs: float
    fat: float


def _scale(per_100: float, grams: float) -> float:
    return round(per_100 * grams / 100, 1)


def macro_snapshot(food: Per100, grams: float) -> Macros:
    """Compute kcal, protein, carbs and fat for the given amount in grams.

    Called when an entry is created and whenever its amount changes; later
    corrections to the food do not touch stored snapshots.
    """
    if grams <= 0:
        raise ValueError("grams must be positive")
    return Macros(
        kcal=_scale(food.kcal, grams),
        protein=_scale(food.protein, grams),
        carbs=_scale(food.carbs, grams),
        fat=_scale(food.fat, grams),
    )
