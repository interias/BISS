from datetime import UTC, date, datetime

import pytest

from app.domain.day import TIMEZONE, day_of


def berlin(*args: int) -> datetime:
    return datetime(*args, tzinfo=TIMEZONE)


def test_entry_at_0359_counts_towards_previous_day() -> None:
    assert day_of(berlin(2026, 10, 28, 3, 59)) == date(2026, 10, 27)


def test_entry_at_0400_counts_towards_same_day() -> None:
    assert day_of(berlin(2026, 10, 28, 4, 0)) == date(2026, 10, 28)


def test_midnight_counts_towards_previous_day() -> None:
    assert day_of(berlin(2026, 11, 1, 0, 0)) == date(2026, 10, 31)


def test_late_evening_counts_towards_same_day() -> None:
    assert day_of(berlin(2026, 10, 28, 23, 59)) == date(2026, 10, 28)


@pytest.mark.parametrize(
    ("utc", "expected"),
    [
        # Winter time, UTC+1: 02:59 UTC is 03:59 in Berlin.
        (datetime(2026, 1, 15, 2, 59, tzinfo=UTC), date(2026, 1, 14)),
        (datetime(2026, 1, 15, 3, 0, tzinfo=UTC), date(2026, 1, 15)),
        # Summer time, UTC+2: 01:59 UTC is 03:59 in Berlin.
        (datetime(2026, 7, 15, 1, 59, tzinfo=UTC), date(2026, 7, 14)),
        (datetime(2026, 7, 15, 2, 0, tzinfo=UTC), date(2026, 7, 15)),
    ],
)
def test_other_timezones_are_converted_to_berlin(utc: datetime, expected: date) -> None:
    assert day_of(utc) == expected


def test_naive_datetime_is_rejected() -> None:
    with pytest.raises(ValueError):
        day_of(datetime(2026, 10, 28, 12, 0))
