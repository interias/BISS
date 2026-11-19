from datetime import date
from typing import Literal

from fastapi import APIRouter

from app.api import convert, schemas
from app.api.deps import NowDep, PeriodDep, SessionDep
from app.domain.day import day_of
from app.services.days import day_range, day_summary

router = APIRouter(tags=["days"])


@router.get("/days")
def get_days(period: PeriodDep, session: SessionDep) -> schemas.DayRange:
    """Every day from `from` to `to` with its totals, goal and number of entries, for the
    calendar and the bars; days without entries with zero totals."""
    return schemas.DayRange(days=[convert.day_totals(day) for day in day_range(session, *period)])


@router.get("/days/{day}")
def get_day(day: Literal["today"] | date, session: SessionDep, now: NowDep) -> schemas.Day:
    """Day summary: totals, goals, entries by meal and the meal suggested now.

    `today` resolves to the current day with the 04:00 boundary; the answer carries the date.
    """
    return convert.day(day_summary(session, day_of(now) if day == "today" else day, now=now))
