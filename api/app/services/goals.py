"""Goals: set and remove the stored default and the goals of single days."""

from dataclasses import asdict
from datetime import date

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.domain.goals import Targets, stored_goal
from app.models import Goal


def set_goal(session: Session, day: date | None, targets: Targets) -> Targets:
    """Store the goal of a day, or the default with day None, replacing a stored one."""
    goal = stored_goal(session, day)
    if goal is None:
        goal = Goal(day=day)
        session.add(goal)
    for name, value in asdict(targets).items():
        setattr(goal, name, value)
    session.commit()
    return targets


def delete_goal(session: Session, day: date) -> None:
    """Remove the goal of a day, then the default applies. Without one nothing changes."""
    session.execute(delete(Goal).where(Goal.day == day))
    session.commit()
