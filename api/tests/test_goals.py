from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.goals import Targets, default_targets, targets_for
from app.models import Goal

DAY = date(2026, 10, 28)


@pytest.fixture(autouse=True)
def no_goal_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("GOAL_KCAL", "GOAL_PROTEIN", "GOAL_CARBS", "GOAL_FAT"):
        monkeypatch.delenv(name, raising=False)


def test_defaults_without_configuration() -> None:
    assert default_targets() == Targets(kcal=2400, protein=160, carbs=260, fat=75)


def test_defaults_come_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOAL_KCAL", "2100")
    monkeypatch.setenv("GOAL_FAT", "70.5")
    assert default_targets(get_settings()) == Targets(kcal=2100, protein=160, carbs=260, fat=70.5)


def test_environment_defaults_apply_without_goal(session: Session) -> None:
    assert targets_for(session, DAY) == Targets(kcal=2400, protein=160, carbs=260, fat=75)


def test_stored_default_goal_replaces_environment(session: Session) -> None:
    session.add(Goal(day=None, kcal=2000, protein=150, carbs=200, fat=70))
    session.flush()
    assert targets_for(session, DAY) == Targets(kcal=2000, protein=150, carbs=200, fat=70)


def test_goal_for_the_day_wins(session: Session) -> None:
    session.add_all(
        [
            Goal(day=None, kcal=2000, protein=150, carbs=200, fat=70),
            Goal(day=DAY, kcal=2800, protein=180, carbs=320, fat=80),
        ]
    )
    session.flush()
    assert targets_for(session, DAY) == Targets(kcal=2800, protein=180, carbs=320, fat=80)
    assert targets_for(session, date(2026, 10, 29)).kcal == 2000
