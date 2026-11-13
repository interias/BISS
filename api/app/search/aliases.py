"""Everyday names of staple foods (SPEC 6): "Ei" means the BLS food "Hühnerei roh".

data/bls/aliases.csv lists per alias the BLS codes it stands for, the first one first in the
search. The BLS names its foods systematically, so the plain word otherwise ranks dishes that
contain it ("Ei-Einlauf") before the food itself.
"""

import csv
from functools import cache
from pathlib import Path

from app.importers.bls import DATA_DIR
from app.search.normalize import normalize

ALIASES_PATH = DATA_DIR / "aliases.csv"


@cache
def _aliases(path: Path) -> dict[str, tuple[str, ...]]:
    found: dict[str, tuple[str, ...]] = {}
    with path.open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            alias = normalize(row["alias"])
            found[alias] = (*found.get(alias, ()), row["code"])
    return found


def alias_codes(q: str, q_stem: str, path: Path = ALIASES_PATH) -> list[str]:
    """The BLS codes the normalised query, or its plural stem, is an everyday name of."""
    aliases = _aliases(path)
    return list(aliases.get(q) or aliases.get(q_stem) or ())
