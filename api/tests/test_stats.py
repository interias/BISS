from datetime import date, datetime

import pytest

from app.domain.stats import check_period, in_range, previous_period, time_of_day


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        # A calendar month: the calendar month before, whatever its length.
        (date(2026, 10, 1), date(2026, 10, 31), (date(2026, 9, 1), date(2026, 9, 30))),
        (date(2026, 3, 1), date(2026, 3, 31), (date(2026, 2, 1), date(2026, 2, 28))),
        (date(2026, 1, 1), date(2026, 1, 31), (date(2025, 12, 1), date(2025, 12, 31))),
        # A week and any other period: as many days directly before.
        (date(2026, 11, 2), date(2026, 11, 8), (date(2026, 10, 26), date(2026, 11, 1))),
        (date(2026, 10, 1), date(2026, 10, 15), (date(2026, 9, 16), date(2026, 9, 30))),
        (date(2026, 10, 28), date(2026, 10, 28), (date(2026, 10, 27), date(2026, 10, 27))),
    ],
)
def test_previous_period(start: date, end: date, expected: tuple[date, date]) -> None:
    assert previous_period(start, end) == expected


def test_a_period_has_one_to_366_days() -> None:
    check_period(date(2026, 10, 28), date(2026, 10, 28))
    check_period(date(2027, 1, 1), date(2028, 1, 1))
    with pytest.raises(ValueError, match="before"):
        check_period(date(2026, 10, 28), date(2026, 10, 27))
    with pytest.raises(ValueError, match="366"):
        check_period(date(2027, 1, 1), date(2028, 1, 2))


@pytest.mark.parametrize(
    ("clock", "expected"),
    [
        ("04:00", "morning"),
        ("10:29", "morning"),
        ("10:30", "midday"),
        ("14:29", "midday"),
        ("14:30", "afternoon"),
        ("17:30", "evening"),
        ("23:59", "evening"),
        # Before the day boundary the night still belongs to the evening.
        ("00:30", "evening"),
        ("03:59", "evening"),
    ],
)
def test_time_of_day_by_local_clock_time(clock: str, expected: str) -> None:
    assert time_of_day(datetime.fromisoformat(f"2026-11-04T{clock}:00+01:00")) == expected


def test_time_of_day_converts_to_berlin() -> None:
    assert time_of_day(datetime.fromisoformat("2026-11-04T09:45:00+00:00")) == "midday"


def test_in_range_allows_the_tolerance_either_way() -> None:
    assert in_range(2200, 2000, 0.1)
    assert in_range(1800, 2000, 0.1)
    assert not in_range(2201, 2000, 0.1)
    assert not in_range(1799, 2000, 0.1)
    assert in_range(2300, 2000, 0.15)
