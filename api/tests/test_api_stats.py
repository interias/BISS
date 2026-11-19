from datetime import date, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.deps import get_now
from app.main import app
from app.models import Goal
from tests.factories import add_entry, add_food

WEEK = {"from": "2026-11-02", "to": "2026-11-08"}  # Monday to Sunday


def at(moment: str) -> None:
    app.dependency_overrides[get_now] = lambda: datetime.fromisoformat(moment)


@pytest.fixture
def week(session: Session) -> None:
    """Today is Thursday 5 November. Logged: Monday and Wednesday, Tuesday not; today does
    not count yet. The week before has two logged days with 2,000 kcal on average."""
    oats = add_food(session, "Haferflocken")
    rice = add_food(session, "Reis gekocht")
    apple = add_food(session, "Apfel")
    session.add_all(
        [
            Goal(valid_from=date(2026, 10, 1), kcal=2000, protein=100, carbs=230, fat=70),
            Goal(day=date(2026, 11, 4), kcal=1100, protein=100, carbs=50, fat=30),
        ]
    )
    add_entry(session, rice, "2026-10-30T12:00:00+01:00", 1500)
    add_entry(session, rice, "2026-11-01T12:00:00+01:00", 2500)
    # Monday: 1,200 kcal, 100 g protein.
    add_entry(session, oats, "2026-11-02T08:00:00+01:00", 600, protein=50)
    bowl = (uuid4(), "Bowl")
    add_entry(session, rice, "2026-11-02T12:00:00+01:00", 400, protein=30, group=bowl)
    add_entry(session, oats, "2026-11-02T12:00:00+01:00", 200, protein=20, group=bowl)
    # Wednesday: 1,000 kcal against its own goal of 1,100, the apple after midnight.
    add_entry(session, oats, "2026-11-04T15:00:00+01:00", 300, protein=10)
    bowl = (uuid4(), "Bowl")
    add_entry(session, rice, "2026-11-04T19:00:00+01:00", 500, group=bowl)
    add_entry(session, oats, "2026-11-04T19:00:00+01:00", 100, group=bowl)
    add_entry(session, apple, "2026-11-05T01:00:00+01:00", 100)
    # Today counts nowhere.
    add_entry(session, oats, "2026-11-05T08:00:00+01:00", 999, protein=99)
    at("2026-11-05T12:00:00+01:00")


@pytest.mark.usefixtures("week")
def test_week_counts_closed_logged_days_against_their_goal(client: TestClient) -> None:
    stats = client.get("/api/v1/stats", params=WEEK).json()

    assert (stats["from"], stats["to"], stats["today"]) == (
        "2026-11-02",
        "2026-11-08",
        "2026-11-05",
    )
    assert (stats["days_possible"], stats["days_logged"]) == (3, 2)
    assert stats["first_day"] == "2026-10-30"
    assert stats["average"] == {"kcal": 1100, "protein": 55, "carbs": 0, "fat": 0}
    assert stats["target_average"] == {"kcal": 1550, "protein": 100, "carbs": 140, "fat": 50}
    assert stats["targets_vary"] is True
    assert stats["tolerance"] == 0.1
    # Wednesday's 1,000 kcal lie within 10 % of 1,100; Monday's protein hits 100.
    assert stats["in_range"] == {"kcal": 1, "protein": 1, "carbs": 0, "fat": 0}
    assert stats["previous"] == {"from": "2026-10-26", "to": "2026-11-01", "average_kcal": 2000}
    assert stats["weekdays"] == [1200, None, 1000, None, None, None, None]


@pytest.mark.usefixtures("week")
def test_trailing_kcal_reaches_before_the_period_and_stops_today(client: TestClient) -> None:
    trailing = client.get("/api/v1/stats", params=WEEK).json()["trailing_kcal"]
    assert [day["date"] for day in trailing] == [f"2026-11-0{d}" for d in range(2, 9)]
    # 30 Oct, 1 Nov and 2 Nov; then 4 Nov as well; from today on nothing.
    assert [day["kcal"] for day in trailing] == [1733.3, 1733.3, 1550, None, None, None, None]


@pytest.mark.usefixtures("week")
def test_times_of_day_share_the_kcal_by_clock_time(client: TestClient) -> None:
    times = client.get("/api/v1/stats", params=WEEK).json()["times_of_day"]
    assert times == pytest.approx(
        {
            "morning": 600 / 2200,
            "midday": 600 / 2200,
            "afternoon": 300 / 2200,
            "evening": 700 / 2200,
        }
    )


@pytest.mark.usefixtures("week")
def test_top_counts_a_plate_once_under_its_name(client: TestClient) -> None:
    assert client.get("/api/v1/stats", params=WEEK).json()["top"] == [
        {"name": "Bowl", "kind": "group", "count": 2, "kcal": 1200},
        {"name": "Haferflocken", "kind": "food", "count": 2, "kcal": 900},
        {"name": "Apfel", "kind": "food", "count": 1, "kcal": 100},
    ]


@pytest.mark.usefixtures("week")
def test_tolerance_comes_from_the_settings(client: TestClient) -> None:
    client.put("/api/v1/settings", json={"tolerance": 0.05})
    stats = client.get("/api/v1/stats", params=WEEK).json()
    assert stats["tolerance"] == 0.05
    assert stats["in_range"]["kcal"] == 0


@pytest.mark.usefixtures("week")
def test_one_goal_for_every_logged_day_does_not_vary(client: TestClient) -> None:
    stats = client.get("/api/v1/stats", params={"from": "2026-11-02", "to": "2026-11-03"}).json()
    assert stats["targets_vary"] is False
    assert stats["target_average"]["kcal"] == 2000
    # Two days directly before.
    assert stats["previous"] == {"from": "2026-10-31", "to": "2026-11-01", "average_kcal": 2500}


@pytest.mark.usefixtures("week")
def test_month_compares_with_the_calendar_month_before(client: TestClient) -> None:
    stats = client.get("/api/v1/stats", params={"from": "2026-11-01", "to": "2026-11-30"}).json()
    assert (stats["days_possible"], stats["days_logged"]) == (4, 3)
    assert stats["previous"] == {"from": "2026-10-01", "to": "2026-10-31", "average_kcal": 1500}


def test_period_without_closed_logged_days(client: TestClient, session: Session) -> None:
    add_entry(session, add_food(session, "Apfel"), "2026-11-02T08:00:00+01:00", 100)
    at("2026-11-02T12:00:00+01:00")  # Monday: nothing closed yet

    stats = client.get("/api/v1/stats", params=WEEK).json()

    assert (stats["days_possible"], stats["days_logged"]) == (0, 0)
    assert stats["average"] is None
    assert stats["target_average"] is None
    assert stats["targets_vary"] is False
    assert stats["in_range"] == {"kcal": 0, "protein": 0, "carbs": 0, "fat": 0}
    assert stats["previous"]["average_kcal"] is None
    assert [day["kcal"] for day in stats["trailing_kcal"]] == [None] * 7
    assert stats["weekdays"] == [None] * 7
    assert stats["times_of_day"] == {"morning": 0, "midday": 0, "afternoon": 0, "evening": 0}
    assert stats["top"] == []


def test_top_has_at_most_five(client: TestClient, session: Session) -> None:
    for number in range(7):
        food = add_food(session, f"Lebensmittel {number}")
        for _ in range(number + 1):
            add_entry(session, food, "2026-11-02T08:00:00+01:00", 10)
    at("2026-11-05T12:00:00+01:00")
    top = client.get("/api/v1/stats", params=WEEK).json()["top"]
    assert [item["count"] for item in top] == [7, 6, 5, 4, 3]


@pytest.mark.parametrize(
    "params",
    [{"from": "2026-11-08", "to": "2026-11-02"}, {"from": "2026-01-01", "to": "2027-01-02"}],
)
def test_invalid_periods_are_rejected(client: TestClient, params: dict) -> None:
    assert client.get("/api/v1/stats", params=params).status_code == 422
