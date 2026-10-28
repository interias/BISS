from datetime import date

from fastapi import APIRouter

from app.api import convert, schemas
from app.api.deps import SessionDep
from app.services.days import day_summary

router = APIRouter(tags=["days"])


@router.get("/days/{day}")
def get_day(day: date, session: SessionDep) -> schemas.Day:
    """Day summary: totals, goals, entries by meal and the meal suggested now."""
    summary = day_summary(session, day)
    return schemas.Day(
        date=summary.day,
        totals=schemas.Macros.model_validate(summary.totals),
        targets=schemas.Macros.model_validate(summary.targets),
        meals=[
            schemas.MealEntries(
                meal=meal.meal,
                totals=schemas.Macros.model_validate(meal.totals),
                entries=[convert.entry(entry, food) for entry, food in meal.entries],
            )
            for meal in summary.meals
        ],
        suggested_meal=summary.suggested_meal,
    )
