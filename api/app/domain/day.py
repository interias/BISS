"""Day boundary: Europe/Berlin, entries until 04:00 count towards the previous day."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

TIMEZONE = ZoneInfo("Europe/Berlin")
DAY_STARTS_AT = time(4, 0)


def to_local(moment: datetime) -> datetime:
    """Convert an aware datetime to Europe/Berlin."""
    if moment.tzinfo is None or moment.utcoffset() is None:
        raise ValueError("datetime must be timezone-aware")
    return moment.astimezone(TIMEZONE)


def day_of(eaten_at: datetime) -> date:
    """Return the day an entry eaten at the given moment belongs to."""
    local = to_local(eaten_at)
    if local.time() < DAY_STARTS_AT:
        return local.date() - timedelta(days=1)
    return local.date()
