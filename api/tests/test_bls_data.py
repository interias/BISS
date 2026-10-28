"""Checks on the checked-in seed files in data/bls."""

import csv

from app.importers.bls import CSV_PATH, FIELDS, SERVINGS_PATH, _number


def read(path):
    with path.open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


def test_extract_holds_all_bls_foods() -> None:
    rows = read(CSV_PATH)
    assert list(rows[0]) == FIELDS
    assert len(rows) == 7140
    assert len({row["code"] for row in rows}) == len(rows)


def test_extract_values_are_parseable() -> None:
    for row in read(CSV_PATH):
        for field in FIELDS[2:]:
            _number(row[field])


def test_servings_refer_to_extract_and_are_estimated() -> None:
    names = {row["code"]: row["name"] for row in read(CSV_PATH)}
    servings = read(SERVINGS_PATH)
    assert 25 <= len(servings) <= 40
    assert len({row["code"] for row in servings}) == len(servings)
    for serving in servings:
        assert names[serving["code"]] == serving["name"]
        assert serving["origin"] == "estimated"
        assert float(serving["grams"]) > 0
