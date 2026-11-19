from dataclasses import asdict
from datetime import datetime

from fastapi.testclient import TestClient

from app.api.deps import get_now
from app.domain.goals import default_targets
from app.main import app

DAY = "2026-10-28"
GOAL = {"kcal": 1800, "protein": 170, "carbs": 150, "fat": 60}
DEFAULT_IN = {"kcal": 2000, "protein": 150, "fat": 70}
# Carbs as the remainder: (2000 - 4 * 150 - 9 * 70) / 4.
DEFAULT = DEFAULT_IN | {"carbs": 192.5}


def at(moment: str) -> None:
    app.dependency_overrides[get_now] = lambda: datetime.fromisoformat(moment)


def test_default_comes_from_the_configuration_until_one_is_stored(client: TestClient) -> None:
    configured = asdict(default_targets())
    assert client.get("/api/v1/goals/default").json() == configured | {
        "kind": "default",
        "valid_from": None,
    }
    assert client.get("/api/v1/goals").json() == {"goals": [configured | {"valid_from": None}]}
    assert client.get(f"/api/v1/goals/{DAY}").json() == configured | {"kind": "default"}


def test_stored_default_applies_from_today_with_carbs_as_the_remainder(
    client: TestClient,
) -> None:
    at("2026-10-28T12:00:00+01:00")
    response = client.put("/api/v1/goals/default", json=DEFAULT_IN | {"carbs": 999})
    assert response.status_code == 200
    stored = DEFAULT | {"kind": "default", "valid_from": DAY}
    assert response.json() == stored
    assert client.get("/api/v1/goals/default").json() == stored
    assert client.get(f"/api/v1/goals/{DAY}").json() == DEFAULT | {"kind": "default"}
    assert client.get(f"/api/v1/days/{DAY}").json()["targets"] == DEFAULT
    # The day before keeps the defaults of the configuration.
    assert client.get("/api/v1/days/2026-10-27").json()["targets"] == asdict(default_targets())


def test_today_follows_the_day_boundary(client: TestClient) -> None:
    at("2026-10-29T03:30:00+01:00")  # still the 28th
    assert client.put("/api/v1/goals/default", json=DEFAULT_IN).json()["valid_from"] == DAY


def test_a_change_on_the_same_day_replaces_the_default(client: TestClient) -> None:
    at("2026-10-28T08:00:00+01:00")
    client.put("/api/v1/goals/default", json=DEFAULT_IN)
    at("2026-10-28T20:00:00+01:00")
    client.put("/api/v1/goals/default", json=DEFAULT_IN | {"kcal": 2400})
    assert client.get("/api/v1/goals").json() == {
        "goals": [{"valid_from": DAY, "kcal": 2400, "protein": 150, "carbs": 292.5, "fat": 70}]
    }


def test_a_change_leaves_earlier_days_alone(client: TestClient) -> None:
    at("2026-10-28T12:00:00+01:00")
    client.put("/api/v1/goals/default", json=DEFAULT_IN)
    at("2026-11-02T12:00:00+01:00")
    response = client.put("/api/v1/goals/default", json={"kcal": 2400, "protein": 160, "fat": 80})
    later = {"kcal": 2400, "protein": 160, "carbs": 260, "fat": 80}
    assert response.json() == later | {"kind": "default", "valid_from": "2026-11-02"}

    assert client.get(f"/api/v1/days/{DAY}").json()["targets"] == DEFAULT
    assert client.get("/api/v1/days/2026-11-01").json()["targets"] == DEFAULT
    assert client.get("/api/v1/days/2026-11-02").json()["targets"] == later
    assert client.get("/api/v1/goals/default").json()["valid_from"] == "2026-11-02"
    assert client.get("/api/v1/goals").json() == {
        "goals": [later | {"valid_from": "2026-11-02"}, DEFAULT | {"valid_from": DAY}]
    }


def test_negative_carbs_are_rejected(client: TestClient) -> None:
    at("2026-10-28T12:00:00+01:00")
    response = client.put("/api/v1/goals/default", json={"kcal": 1000, "protein": 200, "fat": 50})
    assert response.status_code == 422
    assert "more than the goal of 1000 kcal" in response.json()["detail"]
    assert client.get("/api/v1/goals").json()["goals"][0]["valid_from"] is None
    # Exactly the kcal of protein and fat leaves zero carbs, which is fine.
    response = client.put("/api/v1/goals/default", json={"kcal": 1000, "protein": 250, "fat": 0})
    assert response.status_code == 200
    assert response.json()["carbs"] == 0


def test_goal_of_the_day_applies_to_that_day_only(client: TestClient) -> None:
    at("2026-10-01T12:00:00+02:00")
    client.put("/api/v1/goals/default", json=DEFAULT_IN)
    response = client.put(f"/api/v1/goals/{DAY}", json=GOAL)
    assert response.status_code == 200
    assert response.json() == GOAL | {"kind": "day"}
    assert client.get(f"/api/v1/goals/{DAY}").json() == GOAL | {"kind": "day"}
    assert client.get(f"/api/v1/days/{DAY}").json()["targets"] == GOAL
    assert client.get("/api/v1/days/2026-10-29").json()["targets"] == DEFAULT
    assert client.get("/api/v1/goals/default").json() == DEFAULT | {
        "kind": "default",
        "valid_from": "2026-10-01",
    }
    # A goal of a day is no default.
    assert len(client.get("/api/v1/goals").json()["goals"]) == 1

    client.put(f"/api/v1/goals/{DAY}", json=GOAL | {"fat": 65})
    assert client.get(f"/api/v1/days/{DAY}").json()["targets"]["fat"] == 65


def test_deleting_the_goal_of_the_day_brings_back_the_default(client: TestClient) -> None:
    at("2026-10-01T12:00:00+02:00")
    client.put("/api/v1/goals/default", json=DEFAULT_IN)
    client.put(f"/api/v1/goals/{DAY}", json=GOAL)
    assert client.delete(f"/api/v1/goals/{DAY}").status_code == 204
    assert client.get(f"/api/v1/goals/{DAY}").json() == DEFAULT | {"kind": "default"}
    assert client.get(f"/api/v1/days/{DAY}").json()["targets"] == DEFAULT
    # Without a goal of the day nothing changes, the default stays.
    assert client.delete(f"/api/v1/goals/{DAY}").status_code == 204
    assert client.get("/api/v1/goals/default").json()["kcal"] == 2000


def test_invalid_goals_are_rejected(client: TestClient) -> None:
    assert client.put(f"/api/v1/goals/{DAY}", json=GOAL | {"kcal": 0}).status_code == 422
    assert client.put(f"/api/v1/goals/{DAY}", json=GOAL | {"fat": -1}).status_code == 422
    assert client.put("/api/v1/goals/default", json={"kcal": 2000}).status_code == 422
    assert client.put("/api/v1/goals/default", json=DEFAULT_IN | {"kcal": 0}).status_code == 422
    assert client.put("/api/v1/goals/default", json=DEFAULT_IN | {"fat": -1}).status_code == 422
    assert client.put("/api/v1/goals/2026-13-01", json=GOAL).status_code == 422
    assert client.get("/api/v1/goals/today").status_code == 422
