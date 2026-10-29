from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.day import day_of
from app.models import Food
from tests.factories import add_cached, add_food, add_serving


def post(client: TestClient, **body):
    return client.post("/api/v1/entries", json=body)


def test_entry_with_amount_meal_and_time(client: TestClient, session: Session) -> None:
    food = add_food(session, "Haferflocken", kcal=370, protein=13.5, carbs=58.7, fat=7)
    response = post(
        client, food_id=food.id, grams=60, meal="breakfast", eaten_at="2026-10-28T07:12:00+01:00"
    )
    assert response.status_code == 201
    entry = response.json()
    assert entry["food"] == {
        "id": food.id,
        "name": "Haferflocken",
        "brand": None,
        "source": "own",
        "category": None,
    }
    assert (entry["grams"], entry["meal"], entry["day"]) == (60, "breakfast", "2026-10-28")
    assert entry["macros"] == {"kcal": 222.0, "protein": 8.1, "carbs": 35.2, "fat": 4.2}


def test_entry_at_half_past_three_counts_for_the_previous_day(
    client: TestClient, session: Session
) -> None:
    food = add_food(session, "Pizza")
    entry = post(client, food_id=food.id, grams=100, eaten_at="2026-10-28T03:30:00+01:00").json()
    assert entry["day"] == "2026-10-27"
    assert entry["meal"] == "breakfast"  # 03:30 is before 10:30


def test_entry_without_grams_takes_the_standard_serving(
    client: TestClient, session: Session
) -> None:
    food = add_food(session, "Banane", kcal=79)
    add_serving(session, food, "1 Banane", 120)
    add_serving(session, food, "1 kleine", 90, default=False)
    entry = post(client, food_id=food.id).json()
    assert entry["grams"] == 120
    assert entry["macros"]["kcal"] == 94.8


def test_entry_without_grams_and_serving_takes_100_g(client: TestClient, session: Session) -> None:
    food = add_food(session, "Linsen", kcal=310)
    entry = post(client, food_id=food.id).json()
    assert (entry["grams"], entry["macros"]["kcal"]) == (100, 310)


def test_entry_without_meal_takes_the_suggestion(client: TestClient, session: Session) -> None:
    food = add_food(session, "Reis")
    times = {
        "2026-10-28T12:40:00+01:00": "lunch",
        "2026-10-28T16:00:00+01:00": "snack",
        "2026-10-28T19:30:00+01:00": "dinner",
    }
    for eaten_at, meal in times.items():
        assert post(client, food_id=food.id, grams=200, eaten_at=eaten_at).json()["meal"] == meal


def test_entry_without_time_is_eaten_now(client: TestClient, session: Session) -> None:
    food = add_food(session, "Apfel")
    before = datetime.now(UTC)
    entry = post(client, food_id=food.id, grams=150).json()
    eaten_at = datetime.fromisoformat(entry["eaten_at"])
    assert before <= eaten_at <= datetime.now(UTC)
    assert entry["day"] == day_of(eaten_at).isoformat()


def test_liquid_values_per_100_ml_are_converted_by_density(
    client: TestClient, session: Session
) -> None:
    milk = add_food(
        session, "Milch", basis="ml", density=1.03, kcal=64, protein=3.3, carbs=4.8, fat=3.5
    )
    entry = post(client, food_id=milk.id, grams=206).json()  # 200 ml
    assert entry["grams"] == 206
    assert entry["macros"] == {"kcal": 128.0, "protein": 6.6, "carbs": 9.6, "fat": 7.0}


def test_invalid_entries_are_rejected(client: TestClient, session: Session) -> None:
    food = add_food(session, "Brot")
    assert post(client, food_id=food.id + 1000).status_code == 404
    assert post(client, food_id=food.id, grams=0).status_code == 422
    assert post(client, food_id=food.id, grams=-5).status_code == 422
    assert post(client, food_id=food.id, meal="brunch").status_code == 422
    assert post(client, food_id=food.id, eaten_at="2026-10-28T12:00:00").status_code == 422


def test_patch_amount_takes_a_new_snapshot(client: TestClient, session: Session) -> None:
    food = add_food(session, "Skyr", kcal=63)
    entry = post(client, food_id=food.id, grams=250, meal="breakfast").json()
    food.kcal = 70  # corrected later
    session.flush()

    changed = client.patch(f"/api/v1/entries/{entry['id']}", json={"grams": 200}).json()
    assert (changed["grams"], changed["macros"]["kcal"], changed["meal"]) == (200, 140, "breakfast")


def test_patch_meal_keeps_the_snapshot(client: TestClient, session: Session) -> None:
    food = add_food(session, "Skyr", kcal=63)
    entry = post(client, food_id=food.id, grams=250, meal="breakfast").json()
    food.kcal = 70
    session.flush()

    changed = client.patch(f"/api/v1/entries/{entry['id']}", json={"meal": "snack"}).json()
    assert (changed["meal"], changed["grams"], changed["macros"]["kcal"]) == ("snack", 250, 157.5)
    assert changed["day"] == entry["day"]


def test_patch_rejects_unknown_entries_and_bad_values(client: TestClient, session: Session) -> None:
    food = add_food(session, "Quark")
    entry = post(client, food_id=food.id, grams=100).json()
    assert client.patch("/api/v1/entries/999999", json={"grams": 10}).status_code == 404
    assert client.patch(f"/api/v1/entries/{entry['id']}", json={"grams": 0}).status_code == 422
    assert client.patch(f"/api/v1/entries/{entry['id']}", json={"meal": "x"}).status_code == 422


def test_delete_removes_the_entry(client: TestClient, session: Session) -> None:
    food = add_food(session, "Banane")
    entry = post(client, food_id=food.id, grams=120, eaten_at="2026-10-28T10:05:00+01:00").json()

    assert client.delete(f"/api/v1/entries/{entry['id']}").status_code == 204
    assert client.delete(f"/api/v1/entries/{entry['id']}").status_code == 404
    day = client.get("/api/v1/days/2026-10-28").json()
    assert all(meal["entries"] == [] for meal in day["meals"])


def test_cached_search_hit_is_logged_by_its_gtin(client: TestClient, session: Session) -> None:
    add_cached(session, "2000000021072", datetime.now(UTC) - timedelta(days=3))
    (hit,) = client.get("/api/v1/foods/search", params={"q": "testriegel"}).json()
    assert (hit["id"], hit["gtin"], hit["source"]) == (None, "02000000021072", "off")
    assert hit["standard_serving"] == {"label": "1 Riegel (40 g)", "grams": 40, "origin": "package"}

    response = post(client, gtin=hit["gtin"], grams=hit["standard_serving"]["grams"])
    assert response.status_code == 201
    food = session.get(Food, response.json()["food"]["id"])
    assert (food.gtin, food.source, food.name, food.brand) == (
        "02000000021072",
        "off",
        hit["name"],
        hit["brand"],
    )
    (again,) = client.get("/api/v1/foods/search", params={"q": "testriegel"}).json()
    assert (again["id"], again["gtin"], again["source"]) == (food.id, "02000000021072", "off")
