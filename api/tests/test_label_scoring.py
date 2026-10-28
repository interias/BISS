"""The scoring of real label photos without a model (tests/label_scoring.py, SPEC 8)."""

from pathlib import Path

import pytest

from app.labels.extractor import FAKE_DRAFT
from tests.label_scoring import (
    expected_values,
    parse_truth,
    photo_set,
    rate,
    score,
    table,
    within,
)

REPO = Path(__file__).resolve().parent / "fixtures" / "real"


def test_parse_truth_reads_flat_quoted_lines() -> None:
    text = '# comment\n\nbasis: "g"\nfat: "1.5"  # read off\nname: "a \\"#\\" b"\r\n'
    assert parse_truth(text, "x.yaml") == {"basis": "g", "fat": "1.5", "name": 'a "#" b'}


@pytest.mark.parametrize(
    "text",
    ["fat: 1.5", 'fat: ["1"]', 'outer:\n  fat: "1"', '﻿basis: "g"', 'fat-x: "1"'],
)
def test_parse_truth_refuses_anything_else(text: str) -> None:
    with pytest.raises(ValueError, match="x.yaml"):
        parse_truth(text, "x.yaml")


def test_expected_values_take_the_scored_fields_only() -> None:
    truth = {"basis": "ml", "energy_kj": "262", "fat": "0", "source": "https://x", "license": "CC0"}
    assert expected_values(truth, "x.yaml") == {"basis": "ml", "energy_kj": 262.0, "fat": 0.0}


@pytest.mark.parametrize("truth", [{"basis": "kg"}, {"fat": "1,5"}, {"salt": "<0.5"}])
def test_expected_values_refuse_a_bad_value(truth: dict[str, str]) -> None:
    with pytest.raises(ValueError, match="x.yaml"):
        expected_values(truth, "x.yaml")


@pytest.mark.parametrize(
    ("field", "expected", "actual", "ok"),
    [
        ("energy_kj", 2000, 2100, True),  # exactly 5 %
        ("energy_kj", 2000, 2101, False),
        ("energy_kcal", 40, 41.9, True),
        ("energy_kcal", 40, 42.1, False),  # energy has no absolute tolerance
        ("energy_kcal", 0, 0, True),
        ("fat", 2, 2.5, True),  # 0.5 g is larger than 5 %
        ("fat", 2, 2.51, False),
        ("sugar", 0, 0.5, True),
        ("carbs", 60, 63, True),  # 5 % is larger than 0.5 g
        ("carbs", 60, 56.9, False),
        ("salt", 0.71, 0.2, False),
    ],
)
def test_within(field: str, expected: float, actual: float, ok: bool) -> None:
    assert within(field, expected, actual) is ok


def test_score_counts_basis_as_field_and_a_missing_value_as_miss() -> None:
    per_100 = FAKE_DRAFT.per_100.model_copy(update={"fiber": None})
    expected = {"basis": "ml", "energy_kcal": 460.0, "fat": 18.4, "fiber": 5.0, "salt": 0.0}
    scores = score(expected, per_100)
    assert [(s.field, s.actual, s.ok) for s in scores] == [
        ("basis", "g", False),
        ("energy_kcal", 460, True),
        ("fat", 18, True),
        ("fiber", None, False),
        ("salt", 0.6, False),
    ]
    fat = scores[2]
    assert fat.deviation == pytest.approx(0.4)
    assert fat.deviation_pct == pytest.approx(0.4 * 100 / 18.4)
    assert scores[4].deviation_pct is None  # no relative deviation from 0
    assert rate(scores) == (2, 5)
    assert "fiber" in table(scores) and "NO" in table(scores)


def test_without_a_draft_every_field_is_a_miss() -> None:
    scores = score({"basis": "g", "fat": 1.0}, None)
    assert rate(scores) == (0, 2)


def test_photo_set_pairs_photos_and_ground_truth(tmp_path: Path) -> None:
    labels = tmp_path / "labels"
    labels.mkdir()
    for name in ("a.jpg", "a.yaml", "b.png", "c.yaml", "d.jpg", "d.webp", "e.jpg", "notes.txt"):
        (labels / name).write_bytes(b"")
    (labels / "a.yaml").write_text('basis: "g"\n', encoding="utf-8")
    (labels / "e.yaml").write_text("basis: g\n", encoding="utf-8")
    found = photo_set(tmp_path, "labels")
    assert [(p.file, p.truth) for p in found.photos] == [("a.jpg", {"basis": "g"})]
    assert sorted(found.problems) == [
        "b.png: no b.yaml",
        "c.yaml: no photo",
        "d.jpg: several photos named d",
        "d.webp: several photos named d",
        'e.yaml:1: expected key: "value"',
    ]
    assert not found.empty


def test_a_missing_set_is_empty(tmp_path: Path) -> None:
    assert photo_set(tmp_path, "labels").empty
    assert photo_set(None, "labels").empty


def test_the_repo_label_set_is_complete_and_readable() -> None:
    # The ground truth is checked here, so the paid run never fails on a typo.
    labels = photo_set(REPO, "labels")
    assert labels.problems == []
    assert len(labels.photos) >= 15
    for photo in labels.photos:
        expected = expected_values(photo.truth, photo.file)
        assert "basis" in expected and "energy_kcal" in expected, photo.file
