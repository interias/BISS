"""Meal suggestion by local time of day."""

from datetime import datetime, time
from enum import StrEnum

from app.domain.day import to_local


class Meal(StrEnum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    SNACK = "snack"
    DINNER = "dinner"


# Upper bounds (exclusive) of each meal's time window.
_WINDOWS = (
    (time(10, 30), Meal.BREAKFAST),
    (time(14, 30), Meal.LUNCH),
    (time(17, 30), Meal.SNACK),
)


def suggest_meal(moment: datetime) -> Meal:
    """Suggest the meal for an entry at the given moment (Europe/Berlin)."""
    local_time = to_local(moment).time()
    for end, meal in _WINDOWS:
        if local_time < end:
            return meal
    return Meal.DINNER
