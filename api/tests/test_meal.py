from datetime import UTC, datetime

import pytest

from app.domain.day import TIMEZONE
from app.domain.meal import Meal, suggest_meal


@pytest.mark.parametrize(
    ("hour", "minute", "meal"),
    [
        (4, 0, Meal.BREAKFAST),
        (10, 29, Meal.BREAKFAST),
        (10, 30, Meal.LUNCH),
        (14, 29, Meal.LUNCH),
        (14, 30, Meal.SNACK),
        (17, 29, Meal.SNACK),
        (17, 30, Meal.DINNER),
        (23, 59, Meal.DINNER),
        (0, 0, Meal.BREAKFAST),
    ],
)
def test_meal_follows_local_time(hour: int, minute: int, meal: Meal) -> None:
    assert suggest_meal(datetime(2026, 10, 28, hour, minute, tzinfo=TIMEZONE)) == meal


def test_meal_uses_berlin_time_for_utc_input() -> None:
    # 09:30 UTC is 10:30 in Berlin (winter time).
    assert suggest_meal(datetime(2026, 1, 15, 9, 30, tzinfo=UTC)) == Meal.LUNCH


def test_meal_values_match_the_schema() -> None:
    assert [meal.value for meal in Meal] == ["breakfast", "lunch", "snack", "dinner"]
