from dataclasses import asdict

from fastapi.testclient import TestClient

from app.domain.goals import default_targets

DAY = "2026-10-28"
GOAL = {"kcal": 1800, "protein": 170, "carbs": 150, "fat": 60}
DEFAULT = {"kcal": 2000, "protein": 150, "carbs": 200, "fat": 70}


def test_default_comes_from_the_configuration_until_one_is_stored(client: TestClient) -> None:
    configured = asdict(default_targets()) | {"kind": "default"}
    assert client.get("/api/v1/goals/default").json() == configured
    assert client.get(f"/api/v1/goals/{DAY}").json() == configured


def test_stored_default_applies_to_days_without_a_goal(client: TestClient) -> None:
    response = client.put("/api/v1/goals/default", json=DEFAULT)
    assert response.status_code == 200
    assert response.json() == DEFAULT | {"kind": "default"}
    assert client.get("/api/v1/goals/default").json() == DEFAULT | {"kind": "default"}
    assert client.get(f"/api/v1/goals/{DAY}").json() == DEFAULT | {"kind": "default"}
    assert client.get(f"/api/v1/days/{DAY}").json()["targets"] == DEFAULT

    client.put("/api/v1/goals/default", json=DEFAULT | {"kcal": 2100})
    assert client.get("/api/v1/goals/default").json()["kcal"] == 2100


def test_goal_of_the_day_applies_to_that_day_only(client: TestClient) -> None:
    client.put("/api/v1/goals/default", json=DEFAULT)
    response = client.put(f"/api/v1/goals/{DAY}", json=GOAL)
    assert response.status_code == 200
    assert response.json() == GOAL | {"kind": "day"}
    assert client.get(f"/api/v1/goals/{DAY}").json() == GOAL | {"kind": "day"}
    assert client.get(f"/api/v1/days/{DAY}").json()["targets"] == GOAL
    assert client.get("/api/v1/days/2026-10-29").json()["targets"] == DEFAULT
    assert client.get("/api/v1/goals/default").json() == DEFAULT | {"kind": "default"}

    client.put(f"/api/v1/goals/{DAY}", json=GOAL | {"fat": 65})
    assert client.get(f"/api/v1/days/{DAY}").json()["targets"]["fat"] == 65


def test_deleting_the_goal_of_the_day_brings_back_the_default(client: TestClient) -> None:
    client.put("/api/v1/goals/default", json=DEFAULT)
    client.put(f"/api/v1/goals/{DAY}", json=GOAL)
    assert client.delete(f"/api/v1/goals/{DAY}").status_code == 204
    assert client.get(f"/api/v1/goals/{DAY}").json() == DEFAULT | {"kind": "default"}
    assert client.get(f"/api/v1/days/{DAY}").json()["targets"] == DEFAULT
    # Without a goal of the day nothing changes, the default stays.
    assert client.delete(f"/api/v1/goals/{DAY}").status_code == 204
    assert client.get("/api/v1/goals/default").json() == DEFAULT | {"kind": "default"}


def test_invalid_goals_are_rejected(client: TestClient) -> None:
    assert client.put(f"/api/v1/goals/{DAY}", json=GOAL | {"kcal": 0}).status_code == 422
    assert client.put(f"/api/v1/goals/{DAY}", json=GOAL | {"fat": -1}).status_code == 422
    assert client.put("/api/v1/goals/default", json={"kcal": 2000}).status_code == 422
    assert client.put("/api/v1/goals/2026-13-01", json=GOAL).status_code == 422
    assert client.get("/api/v1/goals/today").status_code == 422
