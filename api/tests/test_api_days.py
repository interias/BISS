from datetime import date, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.deps import get_now
from app.domain.goals import default_targets
from app.main import app
from app.models import Goal
from tests.factories import add_food

ZERO = {"kcal": 0, "protein": 0, "carbs": 0, "fat": 0}


def log(client: TestClient, food_id: int, grams: float, meal: str, eaten_at: str) -> None:
    body = {"food_id": food_id, "grams": grams, "meal": meal, "eaten_at": eaten_at}
    assert client.post("/api/v1/entries", json=body).status_code == 201


def test_day_sums_entries_by_meal(client: TestClient, session: Session) -> None:
    oats = add_food(session, "Haferflocken", kcal=368, protein=13.5, carbs=58.7, fat=6.7)
    rice = add_food(session, "Reis gekocht", kcal=130, protein=2.7, carbs=28, fat=0.3)
    log(client, oats.id, 60, "breakfast", "2026-10-28T07:12:00+01:00")
    log(client, rice.id, 200, "lunch", "2026-10-28T12:40:00+01:00")
    log(client, oats.id, 40, "lunch", "2026-10-28T12:30:00+01:00")
    log(client, rice.id, 100, "dinner", "2026-10-29T03:30:00+01:00")  # still the 28th
    log(client, rice.id, 100, "dinner", "2026-10-29T04:00:00+01:00")  # the 29th

    day = client.get("/api/v1/days/2026-10-28").json()

    assert day["date"] == "2026-10-28"
    assert [meal["meal"] for meal in day["meals"]] == ["breakfast", "lunch", "snack", "dinner"]
    _, lunch, snack, dinner = day["meals"]
    assert [e["grams"] for e in lunch["entries"]] == [40, 200]  # by time
    assert lunch["totals"] == {"kcal": 407.2, "protein": 10.8, "carbs": 79.5, "fat": 3.3}
    assert snack == {"meal": "snack", "totals": ZERO, "entries": [], "groups": []}
    assert len(dinner["entries"]) == 1
    assert day["totals"]["kcal"] == round(220.8 + 260 + 147.2 + 130, 1)
    assert day["suggested_meal"] in {"breakfast", "lunch", "snack", "dinner"}


def test_day_targets_fall_back_to_the_defaults(client: TestClient) -> None:
    targets = default_targets()
    day = client.get("/api/v1/days/2026-10-28").json()
    assert day["targets"] == {
        "kcal": targets.kcal,
        "protein": targets.protein,
        "carbs": targets.carbs,
        "fat": targets.fat,
    }
    assert day["totals"] == ZERO


def test_day_targets_use_the_goal_of_the_day(client: TestClient, session: Session) -> None:
    session.add(Goal(day=None, kcal=2000, protein=150, carbs=200, fat=70))
    session.add(Goal(day=date(2026, 10, 28), kcal=1800, protein=170, carbs=150, fat=60))
    session.flush()
    assert client.get("/api/v1/days/2026-10-28").json()["targets"]["kcal"] == 1800
    assert client.get("/api/v1/days/2026-10-29").json()["targets"]["kcal"] == 2000


def test_invalid_date_is_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/days/2026-13-01").status_code == 422


def fix_clock(moment: str) -> None:
    app.dependency_overrides[get_now] = lambda: datetime.fromisoformat(moment)


def test_today_is_the_current_day(client: TestClient) -> None:
    fix_clock("2026-10-28T12:00:00+01:00")
    day = client.get("/api/v1/days/today").json()
    assert day["date"] == "2026-10-28"
    assert day["suggested_meal"] == "lunch"


def test_today_before_four_is_the_previous_day(client: TestClient, session: Session) -> None:
    food = add_food(session, "Reis gekocht", kcal=130, protein=2.7, carbs=28, fat=0.3)
    log(client, food.id, 100, "dinner", "2026-10-28T23:10:00+01:00")
    fix_clock("2026-10-29T03:30:00+01:00")
    day = client.get("/api/v1/days/today").json()
    assert day["date"] == "2026-10-28"
    assert day["totals"]["kcal"] == 130
    fix_clock("2026-10-29T04:00:00+01:00")
    assert client.get("/api/v1/days/today").json()["date"] == "2026-10-29"


def test_other_words_than_today_are_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/days/yesterday").status_code == 422
