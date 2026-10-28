import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Food
from tests.factories import add_food, add_serving

FALLBACK = {"label": "100 g", "grams": 100, "origin": None}
SKYR = {
    "name": "Skyr natur",
    "brand": "Milbona",
    "per_100": {"kcal": 63, "protein": 11, "carbs": 4, "fat": 0.2},
}


def servings_of(body: dict) -> list[tuple]:
    return sorted((s["label"], s["grams"], s["origin"], s["is_default"]) for s in body["servings"])


def overridden(session: Session, food: Food) -> list[str]:
    session.refresh(food)
    return food.overridden


def patch(client: TestClient, food: Food, body: dict):
    return client.patch(f"/api/v1/foods/{food.id}", json=body)


def test_create_own_food_with_servings(client: TestClient) -> None:
    body = SKYR | {
        "servings": [
            {"label": "1 Becher", "grams": 450},
            {"label": "1 Löffel", "grams": 30, "is_default": True},
        ]
    }

    response = client.post("/api/v1/foods", json=body)

    assert response.status_code == 201
    food = response.json()
    assert (food["name"], food["brand"], food["source"], food["basis"]) == (
        "Skyr natur",
        "Milbona",
        "own",
        "g",
    )
    assert food["per_100"] == {
        "kcal": 63,
        "protein": 11,
        "carbs": 4,
        "fat": 0.2,
        "fiber": None,
        "sugar": None,
        "sat_fat": None,
        "salt": None,
    }
    assert servings_of(food) == [("1 Becher", 450, "own", False), ("1 Löffel", 30, "own", True)]
    assert food["standard_serving"] == {"label": "1 Löffel", "grams": 30, "origin": "own"}
    assert client.get(f"/api/v1/foods/{food['id']}").json() == food


def test_create_without_servings_uses_the_derived_100_g(client: TestClient) -> None:
    food = client.post("/api/v1/foods", json=SKYR).json()
    assert (food["servings"], food["standard_serving"]) == ([], FALLBACK)


def test_without_a_marked_serving_the_first_is_standard(client: TestClient) -> None:
    two = [{"label": "1 Becher", "grams": 450}, {"label": "1 halber", "grams": 225}]
    food = client.post("/api/v1/foods", json=SKYR | {"servings": two}).json()
    assert food["standard_serving"]["label"] == "1 Becher"
    assert [s["is_default"] for s in food["servings"]].count(True) == 1


def test_two_standard_servings_are_rejected(client: TestClient, session: Session) -> None:
    two = [
        {"label": "a", "grams": 1, "is_default": True},
        {"label": "b", "grams": 2, "is_default": True},
    ]
    assert client.post("/api/v1/foods", json=SKYR | {"servings": two}).status_code == 422
    food = add_food(session, "Quark")
    assert patch(client, food, {"servings": two}).status_code == 422


def test_create_validates_values(client: TestClient) -> None:
    assert client.post("/api/v1/foods", json=SKYR | {"name": ""}).status_code == 422
    negative = SKYR | {"per_100": SKYR["per_100"] | {"fat": -1}}
    assert client.post("/api/v1/foods", json=negative).status_code == 422
    missing = SKYR | {"per_100": {"kcal": 63}}
    assert client.post("/api/v1/foods", json=missing).status_code == 422
    zero_grams = SKYR | {"servings": [{"label": "1 Becher", "grams": 0}]}
    assert client.post("/api/v1/foods", json=zero_grams).status_code == 422
    # The client cannot choose the source.
    assert client.post("/api/v1/foods", json=SKYR | {"source": "bls"}).json()["source"] == "own"


def test_changed_package_or_estimated_serving_becomes_own(
    client: TestClient, session: Session
) -> None:
    food = add_food(session, "Joghurt", source="off", source_id="4000000000001")
    cup = add_serving(session, food, "1 Becher", 150, origin="package")
    spoon = add_serving(session, food, "1 Löffel", 15, default=False)
    glass = add_serving(session, food, "1 Glas", 250, origin="package", default=False)

    body = {
        "servings": [
            {"id": cup.id, "label": "1 Becher", "grams": 175},
            {"id": spoon.id, "label": "1 EL", "grams": 15},
            {"id": glass.id, "label": "1 Glas", "grams": 250, "is_default": True},
        ]
    }
    response = patch(client, food, body).json()

    assert servings_of(response) == [
        ("1 Becher", 175, "own", False),
        ("1 EL", 15, "own", False),
        ("1 Glas", 250, "package", True),
    ]
    assert response["standard_serving"] == {"label": "1 Glas", "grams": 250, "origin": "package"}
    # Servings carry their own origin; they are no overlay fields.
    assert overridden(session, food) == []


def test_patch_servings_adds_and_removes(client: TestClient, session: Session) -> None:
    food = add_food(session, "Haferflocken")
    keep = add_serving(session, food, "1 Portion", 40)
    add_serving(session, food, "1 Tasse", 80, default=False)

    body = {
        "servings": [
            {"id": keep.id, "label": "1 Portion", "grams": 40},
            {"label": "1 EL", "grams": 10},
        ]
    }
    response = patch(client, food, body).json()

    assert servings_of(response) == [
        ("1 EL", 10, "own", False),
        ("1 Portion", 40, "estimated", True),
    ]
    assert patch(client, food, {"servings": []}).json()["standard_serving"] == FALLBACK


def test_patch_moves_the_standard_serving(client: TestClient, session: Session) -> None:
    food = add_food(session, "Brot")
    slice_ = add_serving(session, food, "1 Scheibe", 40)
    loaf = add_serving(session, food, "1 Laib", 750, default=False)

    body = {
        "servings": [
            {"id": slice_.id, "label": "1 Scheibe", "grams": 40},
            {"id": loaf.id, "label": "1 Laib", "grams": 750, "is_default": True},
        ]
    }
    response = patch(client, food, body).json()

    assert response["standard_serving"]["label"] == "1 Laib"
    assert servings_of(response) == [
        ("1 Laib", 750, "estimated", True),
        ("1 Scheibe", 40, "estimated", False),
    ]


def test_patch_rejects_servings_of_another_food(client: TestClient, session: Session) -> None:
    other = add_serving(session, add_food(session, "Brot"), "1 Scheibe", 40)
    food = add_food(session, "Quark")
    body = {"servings": [{"id": other.id, "label": "1 Scheibe", "grams": 40}]}
    assert patch(client, food, body).status_code == 422
    assert client.patch("/api/v1/foods/999999", json={"name": "x"}).status_code == 404


def test_patch_without_servings_keeps_them(client: TestClient, session: Session) -> None:
    food = add_food(session, "Quark")
    add_serving(session, food, "1 Becher", 250, origin="package")
    response = patch(client, food, {"brand": "Gut&Günstig"}).json()
    assert response["brand"] == "Gut&Günstig"
    assert servings_of(response) == [("1 Becher", 250, "package", True)]


def test_changes_at_a_bls_food_go_into_overridden(client: TestClient, session: Session) -> None:
    food = add_food(session, "Banane roh", source="bls", source_id="F503100", kcal=79, fiber=2)

    body = {"name": "Banane", "per_100": {"kcal": 89, "fiber": None, "protein": 10}}
    response = patch(client, food, body).json()

    assert response["name"] == "Banane"
    assert (response["per_100"]["kcal"], response["per_100"]["fiber"]) == (89, None)
    # protein was sent with its current value, which is no change.
    assert overridden(session, food) == ["name", "kcal", "fiber"]

    patch(client, food, {"per_100": {"kcal": 90, "fat": 0.3}})
    assert overridden(session, food) == ["name", "kcal", "fiber", "fat"]


def test_changes_at_an_own_food_leave_overridden_empty(
    client: TestClient, session: Session
) -> None:
    food = add_food(session, "Müsli")
    patch(client, food, {"name": "Müsli Beere", "per_100": {"kcal": 370}})
    assert overridden(session, food) == []


def test_patch_cannot_clear_core_values(client: TestClient, session: Session) -> None:
    food = add_food(session, "Quark")
    assert patch(client, food, {"per_100": {"kcal": None}}).status_code == 422
    assert patch(client, food, {"name": None}).status_code == 422


def test_validate_returns_the_atwater_result(client: TestClient) -> None:
    ok = {"kcal": 100, "protein": 0, "carbs": 27.475, "fat": 0}
    result = client.post("/api/v1/foods/validate", json=ok).json()["atwater"]
    assert result["computed_kcal"] == pytest.approx(109.9)
    assert result["deviation_pct"] == pytest.approx(9.9)
    assert result["ok"] is True

    too_far = ok | {"carbs": 27.525}
    result = client.post("/api/v1/foods/validate", json=too_far).json()["atwater"]
    assert result["deviation_pct"] == pytest.approx(10.1)
    assert result["ok"] is False

    with_fiber = {"kcal": 100, "protein": 0, "carbs": 24, "fat": 0, "fiber": 2}
    result = client.post("/api/v1/foods/validate", json=with_fiber).json()["atwater"]
    assert result["computed_kcal"] == pytest.approx(100)
    assert client.post("/api/v1/foods/validate", json={"kcal": 100}).status_code == 422
