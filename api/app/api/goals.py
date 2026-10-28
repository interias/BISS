from datetime import date

from fastapi import APIRouter, Response, status

from app.api import schemas
from app.api.deps import SessionDep
from app.domain.goals import Targets, default_goal, stored_goal, targets_for
from app.services import goals

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("/default")
def get_default(session: SessionDep) -> schemas.Goal:
    """The stored default goal, else the defaults from the configuration (.env)."""
    return schemas.Goal(**vars(default_goal(session)), kind="default")


@router.put("/default")
def put_default(body: schemas.GoalIn, session: SessionDep) -> schemas.Goal:
    """Set the default goal; it applies to every day without a goal of its own."""
    targets = goals.set_goal(session, None, Targets(**body.model_dump()))
    return schemas.Goal(**vars(targets), kind="default")


@router.get("/{day}")
def get_day_goal(day: date, session: SessionDep) -> schemas.Goal:
    """The goal that applies to the day: its own one, else the default."""
    kind = "default" if stored_goal(session, day) is None else "day"
    return schemas.Goal(**vars(targets_for(session, day)), kind=kind)


@router.put("/{day}")
def put_day_goal(day: date, body: schemas.GoalIn, session: SessionDep) -> schemas.Goal:
    """Set the goal of a day, for example from the fitness app (ADR-0007)."""
    targets = goals.set_goal(session, day, Targets(**body.model_dump()))
    return schemas.Goal(**vars(targets), kind="day")


@router.delete("/{day}", status_code=status.HTTP_204_NO_CONTENT)
def delete_day_goal(day: date, session: SessionDep) -> Response:
    """Remove the goal of the day, then the default applies; without one a no-op."""
    goals.delete_goal(session, day)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
