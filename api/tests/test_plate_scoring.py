"""The scoring of real plate photos without a model (tests/plate_scoring.py, SPEC 8)."""

from pathlib import Path

import pytest

from tests.label_scoring import photo_set
from tests.plate_scoring import (
    Truth,
    expected_plate,
    names_match,
    p95,
    score_plate,
    table,
)

REPO = Path(__file__).resolve().parent / "fixtures" / "real"


def test_expected_plate_reads_main_ingredients_and_kcal() -> None:
    truth = {"main": "Brot|Pumpernickel; Käse", "kcal": "380", "source": "x", "license": "CC0"}
    assert expected_plate(truth, "x.yaml") == Truth([["brot", "pumpernickel"], ["kaese"]], 380.0)
    assert expected_plate({"main": "Apfel"}, "x.yaml").kcal is None


@pytest.mark.parametrize(
    "truth",
    [
        {"kcal": "100"},
        {"main": "Brot; ;Käse"},
        {"main": "Brot|"},
        {"main": "Brot", "kcal": "1,5"},
        {"main": "Brot", "kcal": "0"},
    ],
)
def test_expected_plate_refuses_a_broken_ground_truth(truth: dict[str, str]) -> None:
    with pytest.raises(ValueError, match="x.yaml"):
        expected_plate(truth, "x.yaml")


@pytest.mark.parametrize(
    ("name", "text", "ok"),
    [
        ("brot", "Roggenbrot", True),
        ("kaese", "Schnittkäse mind. 45 % Fett i. Tr.", True),
        ("broetchen", "Weizenbrötchen", True),
        ("ei", "Hühnerei gebraten", False),
        ("ei", "Eier gekocht", True),
        ("ei", "Haferbrei", False),
        ("huehnerei", "Hühnerei gebraten", True),
        ("linse", "Linsen-Eintopf mit Speck", True),
        ("pak choi", "Pak Choi gekocht", True),
        ("pak choi", "Pak Choiseul", True),
        ("tomate", "Gurke roh", False),
    ],
)
def test_names_match_at_word_start_or_long_enough_at_word_end(
    name: str, text: str, ok: bool
) -> None:
    assert names_match(name, text) is ok


def test_score_finds_main_ingredients_in_recognised_and_matched_names() -> None:
    truth = Truth([["brot"], ["kaese", "gouda"], ["gurke"]], 400.0)
    score = score_plate(truth, ["Vollkornbrot", "Gouda 48 % Fett i. Tr.", "Butter"], 520.0)
    assert score.found == [("brot", True), ("kaese", True), ("gurke", False)]
    assert (score.deviation_pct, score.kcal_ok) == (30.0, True)


def test_kcal_at_exactly_35_percent_is_ok_above_not() -> None:
    truth = Truth([["apfel"]], 100.0)
    assert score_plate(truth, [], 135.0).kcal_ok is True
    assert score_plate(truth, [], 135.1).kcal_ok is False
    assert score_plate(truth, [], 65.0).kcal_ok is True


def test_without_draft_nothing_is_found_and_kcal_is_off() -> None:
    score = score_plate(Truth([["apfel"]], 74.0), [], None)
    assert (score.found, score.kcal_ok) == ([("apfel", False)], False)
    assert score_plate(Truth([["apfel"]], None), [], None).kcal_ok is None


def test_p95_by_nearest_rank() -> None:
    assert p95([5.0]) == 5.0
    assert p95([float(i) for i in range(1, 21)]) == 19.0
    assert p95([float(i) for i in range(1, 11)]) == 10.0


def test_table_lists_ingredients_and_kcal() -> None:
    score = score_plate(Truth([["brot"], ["kaese"]], 200.0), ["Roggenbrot"], 150.0)
    assert table(score).splitlines() == [
        "  yes  brot",
        "  NO   kaese",
        "  yes  kcal expected 200, actual 150, dev 25.0 %",
    ]


def test_repo_plate_set_is_complete_and_its_ground_truth_reads() -> None:
    plates = photo_set(REPO, "plates")
    assert plates.problems == []
    assert len(plates.photos) == 20
    truths = {p.file: expected_plate(p.truth, p.file) for p in plates.photos}
    assert sum(t.kcal is not None for t in truths.values()) == 5
    assert all(p.truth["license"] for p in plates.photos)
