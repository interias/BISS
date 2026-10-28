"""Scoring of label extractions against real label photos (SPEC 8, ADR-0008); no model here.

A set (repo or local) holds `labels/<name>.<jpg|png|webp>` with a ground truth
`<name>.yaml` of flat `key: "value"` lines, the rules of parseTruth in
web/e2e/real-fixtures.ts. The values are per 100 g or 100 ml; a field missing there was
not readable in the photo and is not scored.
"""

import re
from dataclasses import dataclass
from pathlib import Path

from app.labels.draft import LabelPer100

IMAGE = re.compile(r"\.(jpe?g|png|webp)$", re.IGNORECASE)
_BLANK = re.compile(r"^\s*(#.*)?$")
_LINE = re.compile(r'^([A-Za-z0-9_]+):\s*"((?:[^"\\]|\\.)*)"\s*(#.*)?$')

ENERGY = ("energy_kj", "energy_kcal")
NUMERIC = (*ENERGY, "fat", "saturated_fat", "carbs", "sugar", "fiber", "protein", "salt")
# basis is a field of its own: a mix-up of g and ml is one of the three mistakes the
# prompt guards against (SPEC 7).
FIELDS = ("basis", *NUMERIC)

ENERGY_PCT = 5.0
OTHER_PCT = 5.0
OTHER_ABS = 0.5
THRESHOLD = 0.9
# Absorbs float noise so that exactly the tolerance still counts as ok.
_EPSILON = 1e-9


def parse_truth(text: str, file: str) -> dict[str, str]:
    """Flat `key: "value"` lines with `#` comments; anything else, a BOM too, is an error."""
    if text.startswith("﻿"):
        raise ValueError(f"{file}:1: byte order mark")
    truth: dict[str, str] = {}
    for i, line in enumerate(re.split(r"\r?\n", text), start=1):
        if _BLANK.match(line):
            continue
        match = _LINE.match(line)
        if not match:
            raise ValueError(f'{file}:{i}: expected key: "value"')
        truth[match[1]] = re.sub(r"\\(.)", r"\1", match[2])
    return truth


@dataclass(frozen=True)
class Photo:
    file: str
    path: Path
    truth: dict[str, str]


@dataclass(frozen=True)
class PhotoSet:
    dir: Path | None
    photos: list[Photo]
    problems: list[str]
    # No set there: the test is skipped, never counted as passed.
    empty: bool


def photo_set(root: Path | None, kind: str) -> PhotoSet:
    """The photos of one kind in a set with their ground truth, as photoSet in real-fixtures.ts.

    `problems` lists photos without YAML, YAML without photo, several photos with one
    name and unreadable YAML; each one fails the test.
    """
    directory = root / kind if root else None
    files = (
        sorted(p.name for p in directory.iterdir() if IMAGE.search(p.name) or p.suffix == ".yaml")
        if directory and directory.is_dir()
        else []
    )
    images = [f for f in files if IMAGE.search(f)]
    yamls = {Path(f).stem for f in files if f.endswith(".yaml")}
    photos: list[Photo] = []
    problems: list[str] = []
    for file in images:
        name = Path(file).stem
        if sum(Path(f).stem == name for f in images) > 1:
            problems.append(f"{file}: several photos named {name}")
        elif name not in yamls:
            problems.append(f"{file}: no {name}.yaml")
        else:
            yamls.discard(name)
            try:
                text = (directory / f"{name}.yaml").read_text(encoding="utf-8")
                photos.append(Photo(file, directory / file, parse_truth(text, f"{name}.yaml")))
            except (ValueError, UnicodeDecodeError) as error:
                problems.append(str(error))
    problems += [
        f"{name}.yaml: no photo"
        for name in sorted(yamls)
        if not any(Path(f).stem == name for f in images)
    ]
    return PhotoSet(directory, photos, problems, empty=not files)


def expected_values(truth: dict[str, str], file: str) -> dict[str, str | float]:
    """The scored fields of a ground truth; source, author, license and others are ignored."""
    expected: dict[str, str | float] = {}
    for field in FIELDS:
        if field not in truth:
            continue
        value = truth[field]
        if field == "basis":
            if value not in ("g", "ml"):
                raise ValueError(f'{file}: basis "{value}" is neither g nor ml')
            expected[field] = value
            continue
        try:
            expected[field] = float(value)
        except ValueError:
            raise ValueError(f'{file}: {field} "{value}" is no number with a point') from None
    return expected


def within(field: str, expected: float, actual: float) -> bool:
    """Energy ±5 %; the other values ±0.5 g or ±5 %, whichever is larger."""
    deviation = abs(actual - expected)
    pct = abs(expected) * (ENERGY_PCT if field in ENERGY else OTHER_PCT) / 100
    allowed = pct if field in ENERGY else max(OTHER_ABS, pct)
    return deviation <= allowed + _EPSILON


@dataclass(frozen=True)
class FieldScore:
    field: str
    expected: str | float
    # None: the model gave no value, or no draft at all.
    actual: str | float | None
    deviation: float | None
    deviation_pct: float | None
    ok: bool


def score(expected: dict[str, str | float], per_100: LabelPer100 | None) -> list[FieldScore]:
    """One score per expected field; without a draft every field is out of tolerance."""
    scores = []
    for field, want in expected.items():
        got = None if per_100 is None else getattr(per_100, field)
        if field == "basis" or got is None:
            scores.append(FieldScore(field, want, got, None, None, got == want))
            continue
        deviation = abs(got - want)
        pct = deviation * 100 / abs(want) if want else None
        scores.append(FieldScore(field, want, got, deviation, pct, within(field, want, got)))
    return scores


def rate(scores: list[FieldScore]) -> tuple[int, int]:
    """Fields within tolerance and scored fields."""
    return sum(s.ok for s in scores), len(scores)


def _cell(value: str | float | None) -> str:
    if value is None:
        return "-"
    return value if isinstance(value, str) else f"{value:g}"


def table(scores: list[FieldScore]) -> str:
    """A readable table: field, expected, actual, deviation absolute and relative, ok."""
    rows = [("field", "expected", "actual", "dev", "dev %", "ok")]
    for s in scores:
        pct = "-" if s.deviation_pct is None else f"{s.deviation_pct:.1f}"
        dev = "-" if s.deviation is None else f"{s.deviation:g}"
        ok = "yes" if s.ok else "NO"
        rows.append((s.field, _cell(s.expected), _cell(s.actual), dev, pct, ok))
    widths = [max(len(row[i]) for row in rows) for i in range(len(rows[0]))]
    lines = []
    for field, *cells in rows:
        right = (cell.rjust(w) for cell, w in zip(cells, widths[1:], strict=True))
        lines.append("  " + "  ".join([field.ljust(widths[0]), *right]))
    return "\n".join(lines)
