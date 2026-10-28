"""The Python normalisation must match biss_normalize() character for character (SPEC 6)."""

import unicodedata
from pathlib import Path

import pytest
from sqlalchemy import Engine, text

from app.importers.bls import CSV_PATH, _read
from app.search.normalize import normalize

NAMES = [
    "Banane roh",
    "Karotte/Möhre, roh",
    "MÖHRE",
    "Weißbrot",
    "STRASSE Straße",
    "Hühnerei Eigelb, roh",
    "Wald-Erdbeere roh",
    "Café au lait",
    "Crème fraîche",
    "Gouda 48 % Fett i. Tr.",
    "Vollmilch frisch, 3,5 % Fett, pasteurisiert",
    "Mineralwasser 1,5 l",
    "Haferflocken 500 g",
    "Cola 0.33L Dose",
    "Salami 250g",
    "Zucker 1kg",
    "Saft 200 ml / 2 cl",
    "500 g",
    "Glas 5x200g",
    "Smørrebrød, Œuf, Æble",
    "Naïve Piñata ½ l",
    "Moehre",
    "Mo\u0308hre",  # decomposed umlaut (NFD)
    "  leading, trailing!  ",
    "K\u00e4se\u00a0200\u00a0g",
    "Tafelsüße (Süßstoffe: Cyclamat, Saccharin)",
    "",
]


def sql_normalize(engine: Engine, values: list[str]) -> list[str]:
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT biss_normalize(v) FROM unnest(CAST(:values AS text[]))"
                " WITH ORDINALITY AS t(v, n) ORDER BY n"
            ),
            {"values": values},
        )
        return list(rows.scalars())


def mismatches(engine: Engine, values: list[str]) -> list[tuple[str, str, str]]:
    # The database receives NFC input as well, as the docstring of normalize() requires.
    values = [unicodedata.normalize("NFC", v) for v in values]
    expected = sql_normalize(engine, values)
    pairs = zip(values, expected, strict=True)
    return [(v, e, normalize(v)) for v, e in pairs if e != normalize(v)]


def test_examples(engine: Engine) -> None:
    assert mismatches(engine, NAMES) == []


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("Karotte/Möhre, roh", "karotte moehre roh"),
        ("Weißbrot", "weissbrot"),
        ("Café", "cafe"),
        ("Wald-Erdbeere", "wald erdbeere"),
        ("Haferflocken 500 g", "haferflocken"),
        ("Mineralwasser 1,5 l", "mineralwasser"),
        ("Gouda 48 % Fett i. Tr.", "gouda 48 fett i tr"),
        ("Mo\u0308hre", "moehre"),
    ],
)
def test_rules(value: str, expected: str) -> None:
    assert normalize(value) == expected


def test_all_bls_names(engine: Engine) -> None:
    names = [row["name"] for row in _read(Path(CSV_PATH))]
    assert len(names) > 7000
    assert mismatches(engine, names) == []


def assigned(ranges: list[tuple[int, int]]) -> list[str]:
    chars = (chr(code) for first, last in ranges for code in range(first, last + 1))
    return [char for char in chars if unicodedata.category(char) not in {"Cn", "Cs"}]


def test_every_code_point_maps_alike(engine: Engine) -> None:
    """unaccent, lower case and separators for every assigned code point up to U+2FFFF."""
    values = [f"x{char}x" for char in assigned([(1, 0x2FFFF)])]
    assert mismatches(engine, values)[:20] == []


# Blocks for European food names: Latin, Greek, Cyrillic, punctuation, symbols, fullwidth.
# Rarer code points count as word characters differently in the database's libc (see
# app/search/normalize.py); they only matter directly next to a quantity.
NAME_BLOCKS = [
    (0x20, 0x362),
    (0x370, 0x482),
    (0x48A, 0x52F),
    (0x1E00, 0x1EFF),
    (0x2000, 0x20CF),
    (0x2100, 0x218F),
    (0x2C60, 0x2C7F),
    (0xA720, 0xA7BF),
    (0xFB00, 0xFB4F),
    (0xFF00, 0xFFEF),
]


@pytest.mark.parametrize("template", ["5{}g", "{}5 g", "1,5 l{}"])
def test_quantity_boundaries(engine: Engine, template: str) -> None:
    values = [template.format(char) for char in assigned(NAME_BLOCKS)]
    assert mismatches(engine, values)[:20] == []
