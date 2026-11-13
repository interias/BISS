"""Atwater check of a food's values per 100 g (SPEC 7)."""

from dataclasses import dataclass

# At most this deviation of the computed energy from the stated kcal is plausible.
MAX_DEVIATION_PCT = 10.0
# A difference up to this many kcal is plausible whatever the percentage: labels round, and
# "< 0,5 g" of fat, carbs and protein alone are up to 8.5 kcal. Without it every drink of a
# few kcal (2 kcal stated, 3.6 computed) counted as implausible.
MAX_DEVIATION_KCAL = 10.0
# Energy of alcohol; labels state it in % vol, so the caller converts with its density.
KCAL_PER_G_ALCOHOL = 7.0
ALCOHOL_G_PER_ML = 0.789
# Absorbs float noise so that exactly 10 % still counts as ok.
_EPSILON = 1e-9


@dataclass(frozen=True)
class Atwater:
    computed_kcal: float
    # |computed - kcal| / kcal in percent; None when kcal is 0 and computed is not.
    deviation_pct: float | None
    ok: bool


def atwater(
    kcal: float,
    protein: float,
    carbs: float,
    fat: float,
    fiber: float | None = None,
    alcohol_vol: float | None = None,
) -> Atwater:
    """Compare 4·carbs + 4·protein + 9·fat + 2·fiber + 7·alcohol with the stated kcal.

    The deviation is measured against the stated kcal; missing fiber counts as 0. Alcohol
    is given in % vol as on the label (g per 100 ml = % vol · 0.789). Plausible is a
    deviation of at most 10 % or at most 10 kcal.
    """
    alcohol = KCAL_PER_G_ALCOHOL * ALCOHOL_G_PER_ML * (alcohol_vol or 0.0)
    computed = 4 * carbs + 4 * protein + 9 * fat + 2 * (fiber or 0.0) + alcohol
    if kcal != 0:
        deviation = abs(computed - kcal) * 100 / kcal
    elif computed == 0:
        deviation = 0.0
    else:
        deviation = None
    ok = (deviation is not None and deviation <= MAX_DEVIATION_PCT + _EPSILON) or abs(
        computed - kcal
    ) <= MAX_DEVIATION_KCAL + _EPSILON
    return Atwater(computed_kcal=computed, deviation_pct=deviation, ok=ok)
