"""Atwater check of a food's values per 100 g (SPEC 7)."""

from dataclasses import dataclass

# At most this deviation of the computed energy from the stated kcal is plausible.
MAX_DEVIATION_PCT = 10.0
# Absorbs float noise so that exactly 10 % still counts as ok.
_EPSILON = 1e-9


@dataclass(frozen=True)
class Atwater:
    computed_kcal: float
    # |computed - kcal| / kcal in percent; None when kcal is 0 and computed is not.
    deviation_pct: float | None
    ok: bool


def atwater(
    kcal: float, protein: float, carbs: float, fat: float, fiber: float | None = None
) -> Atwater:
    """Compare 4·carbs + 4·protein + 9·fat + 2·fiber with the stated kcal.

    The deviation is measured against the stated kcal; missing fiber counts as 0.
    """
    computed = 4 * carbs + 4 * protein + 9 * fat + 2 * (fiber or 0.0)
    if kcal != 0:
        deviation = abs(computed - kcal) * 100 / kcal
    elif computed == 0:
        deviation = 0.0
    else:
        deviation = None
    ok = deviation is not None and deviation <= MAX_DEVIATION_PCT + _EPSILON
    return Atwater(computed_kcal=computed, deviation_pct=deviation, ok=ok)
