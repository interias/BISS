"""Scoring of plate extractions against real plate photos (SPEC 8, ADR-0009); no model here.

A set (repo or local) holds `plates/<name>.<jpg|png|webp>` with a ground truth
`<name>.yaml` in the flat format of tests/label_scoring.py:

    main: "Brot|Pumpernickel; Käse|Gouda"   # ";" between main ingredients, "|" names
    kcal: "380"                             # optional, only where the dataset weighed it

A main ingredient counts as found when one of its names stands in the name of a
recognised ingredient or of the food it was matched to: normalised as the search does,
at the start of a word or, from three letters on, at its end ("Brot" in "Roggenbrot",
"Käse" in "Schnittkäse"; "Ei" only at the start, not in "Haferbrei").
"""

import math
from dataclasses import dataclass

from app.search.normalize import normalize

# The thresholds of ADR-0009, per set.
RECALL = 0.7
KCAL_PCT = 35.0
KCAL_SHARE = 0.7
P95_SECONDS = 15.0
# The shortest name that also counts at the end of a word.
_SUFFIX_MIN = 3


@dataclass(frozen=True)
class Truth:
    # Per main ingredient its names, normalised; the first is the label in the table.
    main: list[list[str]]
    kcal: float | None


def expected_plate(truth: dict[str, str], file: str) -> Truth:
    """The scored fields of a ground truth; source, author, license and others are ignored."""
    if "main" not in truth:
        raise ValueError(f"{file}: no main")
    main = []
    for part in truth["main"].split(";"):
        names = [normalize(name) for name in part.split("|")]
        if not all(names):
            raise ValueError(f'{file}: main has an empty name in "{part.strip()}"')
        main.append(names)
    kcal = None
    if "kcal" in truth:
        try:
            kcal = float(truth["kcal"])
        except ValueError:
            raise ValueError(f'{file}: kcal "{truth["kcal"]}" is no number') from None
        if kcal <= 0:
            raise ValueError(f"{file}: kcal must be positive")
    return Truth(main, kcal)


def names_match(name: str, text: str) -> bool:
    """Whether the normalised name stands in the text at a word start or, long enough, end."""
    words = normalize(text).split()
    if " " in name:
        return f" {name}" in f" {' '.join(words)}"
    return any(
        word.startswith(name) or (len(name) >= _SUFFIX_MIN and word.endswith(name))
        for word in words
    )


@dataclass(frozen=True)
class PlateScore:
    # Label of each main ingredient and whether it was found.
    found: list[tuple[str, bool]]
    kcal_expected: float | None
    kcal_actual: float | None
    deviation_pct: float | None

    @property
    def kcal_ok(self) -> bool | None:
        """None without kcal in the ground truth."""
        if self.kcal_expected is None:
            return None
        return self.deviation_pct is not None and self.deviation_pct <= KCAL_PCT + 1e-9


def score_plate(truth: Truth, texts: list[str], kcal: float | None) -> PlateScore:
    """texts: the recognised names and the names of the matched foods; kcal: the totals.

    Without a draft texts is empty and kcal None: nothing is found, kcal is off.
    """
    found = [
        (names[0], any(names_match(n, t) for n in names for t in texts)) for names in truth.main
    ]
    deviation = None
    if truth.kcal is not None and kcal is not None:
        deviation = abs(kcal - truth.kcal) * 100 / truth.kcal
    return PlateScore(found, truth.kcal, kcal, deviation)


def p95(values: list[float]) -> float:
    """The 95th percentile by the nearest rank: the value 95 % of the values do not exceed."""
    ordered = sorted(values)
    return ordered[max(0, math.ceil(0.95 * len(ordered)) - 1)]


def table(score: PlateScore) -> str:
    """A readable table: each main ingredient found or not, then kcal when there is one."""
    lines = [f"  {'yes' if ok else 'NO ':3}  {label}" for label, ok in score.found]
    if score.kcal_expected is not None:
        actual = "-" if score.kcal_actual is None else f"{score.kcal_actual:g}"
        pct = "-" if score.deviation_pct is None else f"{score.deviation_pct:.1f} %"
        ok = "yes" if score.kcal_ok else "NO "
        lines.append(f"  {ok:3}  kcal expected {score.kcal_expected:g}, actual {actual}, dev {pct}")
    return "\n".join(lines)
