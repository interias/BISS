"""Goals: set the default from today on, set and remove the goals of single days."""

from dataclasses import asdict
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domain.goals import Targets, carbs_remainder, stored_default, stored_goal
from app.models import Goal


def _store(session: Session, goal: Goal | None, targets: Targets, **key: date) -> Targets:
    if goal is None:
        goal = Goal(**key)
        session.add(goal)
    for name, value in asdict(targets).items():
        setattr(goal, name, value)
    session.commit()
    return targets


def set_goal(session: Session, day: date, targets: Targets) -> Targets:
    """Store the goal of a day as sent, replacing a stored one."""
    return _store(session, stored_goal(session, day), targets, day=day)


def set_default(session: Session, today: date, kcal: float, protein: float, fat: float) -> Targets:
    """Store the default from today on, carbs as the remainder; earlier days keep theirs.

    A default that already starts today is replaced. Raises ValueError for negative carbs.
    """
    targets = Targets(kcal, protein, carbs_remainder(kcal, protein, fat), fat)
    return _store(session, stored_default(session, today), targets, valid_from=today)


def stored_defaults(session: Session) -> list[tuple[date, Targets]]:
    """All stored defaults with their start day, the newest first."""
    rows = session.scalars(
        select(Goal).where(Goal.valid_from.is_not(None)).order_by(Goal.valid_from.desc())
    )
    return [(row.valid_from, Targets(row.kcal, row.protein, row.carbs, row.fat)) for row in rows]


def delete_goal(session: Session, day: date) -> None:
    """Remove the goal of a day, then the default applies. Without one nothing changes."""
    session.execute(delete(Goal).where(Goal.day == day))
    session.commit()
