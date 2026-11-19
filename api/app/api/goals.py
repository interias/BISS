from datetime import date

from fastapi import APIRouter, HTTPException, Response, status

from app.api import schemas
from app.api.deps import NowDep, SessionDep
from app.domain.day import day_of
from app.domain.goals import Targets, default_targets, load_goals, stored_goal, targets_for
from app.services import goals

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("")
def get_defaults(session: SessionDep) -> schemas.Goals:
    """All stored defaults, the newest first; without one the defaults of the configuration."""
    stored = goals.stored_defaults(session) or [(None, default_targets())]
    return schemas.Goals(
        goals=[schemas.StoredDefault(**vars(t), valid_from=start) for start, t in stored]
    )


@router.get("/default")
def get_default(session: SessionDep, now: NowDep) -> schemas.DefaultGoal:
    """The default that applies today, else the defaults from the configuration (.env)."""
    start, targets = load_goals(session).default_on(day_of(now))
    return schemas.DefaultGoal(**vars(targets), kind="default", valid_from=start)


@router.put("/default")
def put_default(
    body: schemas.DefaultGoalIn, session: SessionDep, now: NowDep
) -> schemas.DefaultGoal:
    """Set the default from today on, carbs as the remainder; earlier days keep their goal."""
    today = day_of(now)
    try:
        targets = goals.set_default(session, today, body.kcal, body.protein, body.fat)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return schemas.DefaultGoal(**vars(targets), kind="default", valid_from=today)


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
