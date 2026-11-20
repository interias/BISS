from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.goals import Targets, carbs_remainder, default_targets, load_goals, targets_for
from app.models import Goal

DAY = date(2026, 10, 28)


@pytest.fixture(autouse=True)
def no_goal_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("GOAL_KCAL", "GOAL_PROTEIN", "GOAL_FAT"):
        monkeypatch.delenv(name, raising=False)


def test_defaults_without_configuration() -> None:
    # The carbs are the remainder: (2400 - 4*160 - 9*75) / 4.
    assert default_targets() == Targets(kcal=2400, protein=160, carbs=271.25, fat=75)


def test_defaults_come_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOAL_KCAL", "2100")
    monkeypatch.setenv("GOAL_FAT", "70.5")
    expected = Targets(kcal=2100, protein=160, carbs=206.375, fat=70.5)
    assert default_targets(get_settings()) == expected


def test_environment_defaults_apply_without_goal(session: Session) -> None:
    assert targets_for(session, DAY) == Targets(kcal=2400, protein=160, carbs=271.25, fat=75)


def test_stored_default_goal_replaces_environment(session: Session) -> None:
    session.add(Goal(valid_from=date(2026, 1, 1), kcal=2000, protein=150, carbs=200, fat=70))
    session.flush()
    assert targets_for(session, DAY) == Targets(kcal=2000, protein=150, carbs=200, fat=70)


def test_goal_for_the_day_wins(session: Session) -> None:
    session.add_all(
        [
            Goal(valid_from=date(2026, 1, 1), kcal=2000, protein=150, carbs=200, fat=70),
            Goal(day=DAY, kcal=2800, protein=180, carbs=320, fat=80),
        ]
    )
    session.flush()
    assert targets_for(session, DAY) == Targets(kcal=2800, protein=180, carbs=320, fat=80)
    assert targets_for(session, date(2026, 10, 29)).kcal == 2000


def test_newest_default_up_to_the_day_applies(session: Session) -> None:
    session.add_all(
        [
            Goal(valid_from=date(2026, 10, 1), kcal=2000, protein=150, carbs=200, fat=70),
            Goal(valid_from=DAY, kcal=2200, protein=150, carbs=250, fat=70),
            Goal(valid_from=date(2026, 11, 5), kcal=2500, protein=150, carbs=300, fat=70),
        ]
    )
    session.flush()
    goals = load_goals(session)
    assert goals.default_on(date(2026, 9, 30)) == (None, default_targets())
    assert goals.of(date(2026, 9, 30)) == default_targets()
    assert goals.of(date(2026, 10, 1)).kcal == 2000
    assert goals.of(date(2026, 10, 27)).kcal == 2000
    assert goals.of(DAY).kcal == 2200
    assert goals.default_on(date(2026, 11, 4)) == (DAY, Targets(2200, 150, 250, 70))
    assert goals.of(date(2026, 12, 24)).kcal == 2500


def test_carbs_are_the_remainder_of_the_kcal() -> None:
    assert carbs_remainder(2000, 150, 70) == (2000 - 600 - 630) / 4
    assert carbs_remainder(1000, 100, 0) == 150
    assert carbs_remainder(1000, 0, 0) == 250
    assert carbs_remainder(1000, 100, 66.6) == pytest.approx(0.15)
    with pytest.raises(ValueError, match="more than the goal"):
        carbs_remainder(1000, 200, 50)


def test_a_row_is_either_a_day_goal_or_a_default(session: Session) -> None:
    for fields in ({}, {"day": DAY, "valid_from": DAY}):
        with session.begin_nested(), pytest.raises(IntegrityError):
            session.add(Goal(kcal=2000, protein=150, carbs=200, fat=70, **fields))
            session.flush()
