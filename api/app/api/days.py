from datetime import date
from typing import Literal

from fastapi import APIRouter

from app.api import convert, schemas
from app.api.deps import NowDep, SessionDep
from app.domain.day import day_of
from app.services.days import day_summary

router = APIRouter(tags=["days"])


@router.get("/days/{day}")
def get_day(day: Literal["today"] | date, session: SessionDep, now: NowDep) -> schemas.Day:
    """Day summary: totals, goals, entries by meal and the meal suggested now.

    `today` resolves to the current day with the 04:00 boundary; the answer carries the date.
    """
    return convert.day(day_summary(session, day_of(now) if day == "today" else day, now=now))
