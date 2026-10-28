import pytest

from app.domain.servings import TooManyDefaults, default_index, origin_after_edit


@pytest.mark.parametrize("origin", ["package", "estimated", "own"])
def test_changed_label_or_grams_makes_a_serving_own(origin: str) -> None:
    assert origin_after_edit(origin, "1 Becher", 200, "1 Becher", 250) == "own"
    assert origin_after_edit(origin, "1 Becher", 200, "1 großer Becher", 200) == "own"


@pytest.mark.parametrize("origin", ["package", "estimated", "own"])
def test_unchanged_serving_keeps_its_origin(origin: str) -> None:
    assert origin_after_edit(origin, "1 Becher", 200, "1 Becher", 200) == origin


def test_marked_serving_is_the_standard() -> None:
    assert default_index([False, True, False]) == 1


def test_without_mark_the_first_is_the_standard() -> None:
    assert default_index([False, False]) == 0


def test_no_servings_no_standard() -> None:
    assert default_index([]) is None


def test_two_marks_are_an_error() -> None:
    with pytest.raises(TooManyDefaults):
        default_index([True, False, True])
