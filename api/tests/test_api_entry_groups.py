"""Entries of a plate: POST, PATCH and DELETE /entries/group and the groups in /days (SPEC 7a)."""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Entry, Food
from tests.factories import add_food

GROUP = "/api/v1/entries/group"
EATEN = "2026-10-28T12:30:00+01:00"


def foods(session: Session) -> tuple[Food, Food]:
    rice = add_food(session, "Reis gekocht", kcal=112, protein=2.4, carbs=24.6, fat=0.2)
    chicken = add_food(session, "Hähnchen Brustfilet", kcal=140, protein=29.4, carbs=0, fat=2.4)
    return rice, chicken


def create(client: TestClient, rice: Food, chicken: Food, **fields) -> dict:
    body = {
        "group_name": "Hähnchen mit Reis",
        "items": [{"food_id": rice.id, "grams": 150}, {"food_id": chicken.id, "grams": 120}],
        "eaten_at": EATEN,
    } | fields
    response = client.post(GROUP, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Entry))


def test_group_logs_one_entry_per_item_with_own_snapshot(
    client: TestClient, session: Session
) -> None:
    rice, chicken = foods(session)
    group = create(client, rice, chicken)
    assert (group["group_name"], group["meal"], group["day"]) == (
        "Hähnchen mit Reis",
        "lunch",
        "2026-10-28",
    )
    first, second = group["entries"]
    assert (first["food"]["id"], first["grams"]) == (rice.id, 150)
    assert first["macros"] == {"kcal": 168.0, "protein": 3.6, "carbs": 36.9, "fat": 0.3}
    assert (second["food"]["id"], second["grams"]) == (chicken.id, 120)
    assert second["macros"] == {"kcal": 168.0, "protein": 35.3, "carbs": 0.0, "fat": 2.9}
    assert {e["group_id"] for e in group["entries"]} == {group["group_id"]}
    assert {e["group_name"] for e in group["entries"]} == {"Hähnchen mit Reis"}
    assert len({e["eaten_at"] for e in group["entries"]}) == 1
    assert group["totals"] == {"kcal": 336.0, "protein": 38.9, "carbs": 36.9, "fat": 3.2}


def test_group_with_meal_and_without_time_takes_now(client: TestClient, session: Session) -> None:
    rice, chicken = foods(session)
    group = create(client, rice, chicken, meal="dinner", eaten_at=None)
    assert group["meal"] == "dinner"


def test_group_with_an_unknown_food_logs_nothing(client: TestClient, session: Session) -> None:
    rice, _ = foods(session)
    response = client.post(
        GROUP,
        json={
            "group_name": "Teller",
            "items": [{"food_id": rice.id, "grams": 150}, {"food_id": 999999, "grams": 50}],
        },
    )
    assert response.status_code == 404
    assert count(session) == 0


def test_group_needs_a_name_and_items_with_positive_grams(client: TestClient) -> None:
    for body in (
        {"group_name": "", "items": [{"food_id": 1, "grams": 10}]},
        {"group_name": "Teller", "items": []},
        {"group_name": "Teller", "items": [{"food_id": 1, "grams": 0}]},
    ):
        assert client.post(GROUP, json=body).status_code == 422


def test_entry_of_a_group_changes_its_own_snapshot_only(
    client: TestClient, session: Session
) -> None:
    rice, chicken = foods(session)
    group = create(client, rice, chicken)
    first, second = group["entries"]
    changed = client.patch(f"/api/v1/entries/{first['id']}", json={"grams": 100}).json()
    assert changed["macros"]["kcal"] == 112.0
    assert changed["group_id"] == group["group_id"]
    rice.kcal = 500  # a later correction of the food leaves the snapshots alone
    session.flush()
    day = client.get("/api/v1/days/2026-10-28").json()
    lunch = next(m for m in day["meals"] if m["meal"] == "lunch")
    assert [e["macros"]["kcal"] for e in lunch["entries"]] == [112.0, second["macros"]["kcal"]]


def test_patch_group_changes_meal_and_name_of_every_entry(
    client: TestClient, session: Session
) -> None:
    rice, chicken = foods(session)
    group = create(client, rice, chicken)
    response = client.patch(
        f"{GROUP}/{group['group_id']}", json={"meal": "dinner", "group_name": "Reisteller"}
    )
    assert response.status_code == 200
    changed = response.json()
    assert (changed["meal"], changed["group_name"]) == ("dinner", "Reisteller")
    assert {(e["meal"], e["group_name"]) for e in changed["entries"]} == {("dinner", "Reisteller")}
    assert [e["macros"] for e in changed["entries"]] == [e["macros"] for e in group["entries"]]
    only_meal = client.patch(f"{GROUP}/{group['group_id']}", json={"meal": "snack"}).json()
    assert (only_meal["meal"], only_meal["group_name"]) == ("snack", "Reisteller")


def test_delete_group_removes_every_entry_of_the_plate(
    client: TestClient, session: Session
) -> None:
    rice, chicken = foods(session)
    single = client.post(
        "/api/v1/entries", json={"food_id": rice.id, "grams": 50, "eaten_at": EATEN}
    ).json()
    group = create(client, rice, chicken)
    other = create(client, rice, chicken, group_name="Zweiter Teller")
    response = client.delete(f"{GROUP}/{group['group_id']}")
    assert response.status_code == 204
    left = session.scalars(select(Entry.id).order_by(Entry.id)).all()
    assert left == [single["id"], *[e["id"] for e in other["entries"]]]


def test_unknown_group_is_404(client: TestClient) -> None:
    unknown = uuid4()
    assert client.delete(f"{GROUP}/{unknown}").status_code == 404
    assert client.patch(f"{GROUP}/{unknown}", json={"meal": "lunch"}).status_code == 404
    assert client.delete(f"{GROUP}/not-a-uuid").status_code == 422


def test_day_lists_the_groups_of_a_meal_with_totals(client: TestClient, session: Session) -> None:
    rice, chicken = foods(session)
    single = client.post(
        "/api/v1/entries", json={"food_id": chicken.id, "grams": 100, "eaten_at": EATEN}
    ).json()
    group = create(client, rice, chicken)
    day = client.get("/api/v1/days/2026-10-28").json()
    lunch = next(m for m in day["meals"] if m["meal"] == "lunch")
    group_ids = [e["id"] for e in group["entries"]]
    assert [e["id"] for e in lunch["entries"]] == [single["id"], *group_ids]
    assert lunch["entries"][0]["group_id"] is None
    assert lunch["groups"] == [
        {
            "group_id": group["group_id"],
            "group_name": "Hähnchen mit Reis",
            "totals": group["totals"],
            "entry_ids": group_ids,
        }
    ]
    assert lunch["totals"]["kcal"] == 140.0 + 336.0
    assert all(m["groups"] == [] for m in day["meals"] if m["meal"] != "lunch")


def test_moving_a_group_moves_it_between_meals_in_the_day(
    client: TestClient, session: Session
) -> None:
    rice, chicken = foods(session)
    group = create(client, rice, chicken)
    client.patch(f"{GROUP}/{group['group_id']}", json={"meal": "dinner"})
    day = client.get("/api/v1/days/2026-10-28").json()
    meals = {m["meal"]: m for m in day["meals"]}
    assert meals["lunch"]["groups"] == [] and meals["lunch"]["entries"] == []
    [moved] = meals["dinner"]["groups"]
    assert moved["totals"] == group["totals"]
