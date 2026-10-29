"""Schnellzugriff: /combos and its log, an entry group like a plate (ADR-0010)."""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ComboItem, Entry, Food
from tests.factories import add_food, add_serving

COMBOS = "/api/v1/combos"
EATEN = "2026-10-29T07:30:00+01:00"


def foods(session: Session) -> tuple[Food, Food, Food]:
    coffee = add_food(session, "Kaffee, Filter", basis="ml", kcal=2, protein=0.1, carbs=0.3, fat=0)
    sugar = add_food(session, "Zucker", kcal=400, protein=0, carbs=100, fat=0)
    almond = add_food(
        session,
        "Mandeldrink gesüßt",
        basis="ml",
        density=1.02,
        kcal=24,
        protein=0.4,
        carbs=3,
        fat=1.2,
    )
    return coffee, sugar, almond


def create(client: TestClient, session: Session, **fields) -> dict:
    coffee, sugar, almond = foods(session)
    body = {
        "name": "Kaffee",
        "items": [
            {"food_id": coffee.id, "grams": 200},
            {"food_id": sugar.id, "grams": 5},
            {"food_id": almond.id, "grams": 51},
        ],
    } | fields
    response = client.post(COMBOS, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def entry_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Entry))


def test_create_returns_items_with_macros_and_totals(client: TestClient, session: Session) -> None:
    combo = create(client, session)
    assert combo["name"] == "Kaffee"
    coffee, sugar, almond = combo["items"]
    assert (coffee["food"]["name"], coffee["grams"]) == ("Kaffee, Filter", 200)
    assert coffee["food"]["basis"] == "ml"
    assert coffee["macros"] == {"kcal": 4.0, "protein": 0.2, "carbs": 0.6, "fat": 0.0}
    assert sugar["macros"] == {"kcal": 20.0, "protein": 0.0, "carbs": 5.0, "fat": 0.0}
    # 51 g of a drink with 1.02 g/ml are 50 ml, its values are per 100 ml.
    assert almond["density"] == 1.02
    assert almond["macros"] == {"kcal": 12.0, "protein": 0.2, "carbs": 1.5, "fat": 0.6}
    assert combo["totals"] == {"kcal": 36.0, "protein": 0.4, "carbs": 7.1, "fat": 0.6}
    assert sugar["food"]["standard_serving"] == {"label": "100 g", "grams": 100, "origin": None}


def test_list_by_position_then_age_with_the_food_summary(
    client: TestClient, session: Session
) -> None:
    first = create(client, session)
    banana = add_food(session, "Banane roh", kcal=93)
    add_serving(session, banana, "1 Banane", 120)
    second = client.post(
        COMBOS, json={"name": "Banane", "items": [{"food_id": banana.id, "grams": 120}]}
    ).json()
    listed = client.get(COMBOS).json()
    assert [c["id"] for c in listed] == [first["id"], second["id"]]
    assert listed[1]["items"][0]["food"]["standard_serving"]["label"] == "1 Banane"
    assert listed[0] == first


def test_patch_renames_and_replaces_all_items(client: TestClient, session: Session) -> None:
    combo = create(client, session)
    sugar_id = combo["items"][1]["food"]["id"]
    response = client.patch(
        f"{COMBOS}/{combo['id']}",
        json={"name": "Kaffee süß", "items": [{"food_id": sugar_id, "grams": 10}]},
    )
    assert response.status_code == 200
    changed = response.json()
    assert changed["name"] == "Kaffee süß"
    assert [(i["food"]["id"], i["grams"]) for i in changed["items"]] == [(sugar_id, 10)]
    assert session.scalar(select(func.count()).select_from(ComboItem)) == 1
    renamed = client.patch(f"{COMBOS}/{combo['id']}", json={"name": "Kaffee"}).json()
    assert (renamed["name"], len(renamed["items"])) == ("Kaffee", 1)


def test_delete_removes_the_combo_and_its_items_but_no_entry(
    client: TestClient, session: Session
) -> None:
    combo = create(client, session)
    client.post(f"{COMBOS}/{combo['id']}/log", json={"eaten_at": EATEN})
    assert client.delete(f"{COMBOS}/{combo['id']}").status_code == 204
    assert client.get(COMBOS).json() == []
    assert session.scalar(select(func.count()).select_from(ComboItem)) == 0
    assert entry_count(session) == 3


def test_log_creates_an_entry_group_with_a_snapshot_each(
    client: TestClient, session: Session
) -> None:
    combo = create(client, session)
    response = client.post(f"{COMBOS}/{combo['id']}/log", json={"eaten_at": EATEN})
    assert response.status_code == 201, response.text
    group = response.json()
    assert (group["group_name"], group["meal"], group["day"]) == (
        "Kaffee",
        "breakfast",
        "2026-10-29",
    )
    assert [(e["food"]["id"], e["grams"]) for e in group["entries"]] == [
        (i["food"]["id"], i["grams"]) for i in combo["items"]
    ]
    assert [e["macros"] for e in group["entries"]] == [i["macros"] for i in combo["items"]]
    assert {e["group_id"] for e in group["entries"]} == {group["group_id"]}
    assert group["totals"] == combo["totals"]
    # The group is a plate like any other: DELETE /entries/group removes it ("Rückgängig").
    assert client.delete(f"/api/v1/entries/group/{group['group_id']}").status_code == 204
    assert entry_count(session) == 0


def test_log_snapshots_stay_when_the_food_changes(client: TestClient, session: Session) -> None:
    combo = create(client, session)
    group = client.post(f"{COMBOS}/{combo['id']}/log", json={"eaten_at": EATEN}).json()
    sugar = session.get(Food, combo["items"][1]["food"]["id"])
    sugar.kcal = 800
    session.flush()
    stored = session.get(Entry, group["entries"][1]["id"])
    assert stored.kcal == 20.0
    # The template shows the values an entry would take now.
    assert client.get(COMBOS).json()[0]["items"][1]["macros"]["kcal"] == 40.0


def test_log_with_meal_and_override_items_leaves_the_template(
    client: TestClient, session: Session
) -> None:
    combo = create(client, session)
    coffee_id, sugar_id = (i["food"]["id"] for i in combo["items"][:2])
    response = client.post(
        f"{COMBOS}/{combo['id']}/log",
        json={
            "meal": "snack",
            "eaten_at": EATEN,
            "items": [{"food_id": coffee_id, "grams": 200}, {"food_id": sugar_id, "grams": 10}],
        },
    )
    assert response.status_code == 201
    group = response.json()
    assert group["meal"] == "snack"
    assert [(e["food"]["id"], e["grams"]) for e in group["entries"]] == [
        (coffee_id, 200),
        (sugar_id, 10),
    ]
    assert client.get(COMBOS).json()[0] == combo


def test_log_without_time_takes_now(client: TestClient, session: Session) -> None:
    combo = create(client, session)
    group = client.post(f"{COMBOS}/{combo['id']}/log", json={}).json()
    assert group["meal"] in {"breakfast", "lunch", "snack", "dinner"}


def test_create_from_a_group_copies_foods_grams_and_name(
    client: TestClient, session: Session
) -> None:
    rice = add_food(session, "Reis gekocht", kcal=112)
    chicken = add_food(session, "Hähnchen Brustfilet", kcal=140)
    group = client.post(
        "/api/v1/entries/group",
        json={
            "group_name": "Hähnchen mit Reis",
            "items": [{"food_id": rice.id, "grams": 150}, {"food_id": chicken.id, "grams": 120}],
            "eaten_at": EATEN,
        },
    ).json()
    response = client.post(COMBOS, json={"group_id": group["group_id"]})
    assert response.status_code == 201, response.text
    combo = response.json()
    assert combo["name"] == "Hähnchen mit Reis"
    assert [(i["food"]["id"], i["grams"]) for i in combo["items"]] == [
        (rice.id, 150),
        (chicken.id, 120),
    ]
    named = client.post(COMBOS, json={"group_id": group["group_id"], "name": "Mittag"}).json()
    assert named["name"] == "Mittag"


def test_unknown_food_group_or_combo_is_404_and_stores_nothing(
    client: TestClient, session: Session
) -> None:
    combo = create(client, session)
    unknown_food = {"name": "X", "items": [{"food_id": 999999, "grams": 10}]}
    assert client.post(COMBOS, json=unknown_food).status_code == 404
    assert client.post(COMBOS, json={"group_id": str(uuid4())}).status_code == 404
    assert len(client.get(COMBOS).json()) == 1
    assert client.patch(f"{COMBOS}/999999", json={"name": "X"}).status_code == 404
    assert client.delete(f"{COMBOS}/999999").status_code == 404
    assert client.post(f"{COMBOS}/999999/log", json={}).status_code == 404
    override = {"items": [{"food_id": 999999, "grams": 10}]}
    assert client.post(f"{COMBOS}/{combo['id']}/log", json=override).status_code == 404
    patched = client.patch(f"{COMBOS}/{combo['id']}", json=override)
    assert patched.status_code == 404
    assert entry_count(session) == 0
    assert len(client.get(COMBOS).json()[0]["items"]) == 3


def test_validation_of_name_items_and_grams(client: TestClient, session: Session) -> None:
    food = add_food(session, "Zucker", kcal=400)
    item = {"food_id": food.id, "grams": 5}
    for body in (
        {"name": "Kaffee", "items": []},
        {"name": "", "items": [item]},
        {"items": [item]},
        {"name": "Kaffee"},
        {"name": "Kaffee", "items": [item], "group_id": str(uuid4())},
        {"name": "Kaffee", "items": [{"food_id": food.id, "grams": 0}]},
        {"name": "Kaffee", "items": [{"food_id": food.id, "grams": 1501}]},
    ):
        assert client.post(COMBOS, json=body).status_code == 422, body
    combo = client.post(COMBOS, json={"name": "Kaffee", "items": [item]}).json()
    assert client.patch(f"{COMBOS}/{combo['id']}", json={"items": []}).status_code == 422
    assert client.post(f"{COMBOS}/{combo['id']}/log", json={"items": []}).status_code == 422
    assert client.post(f"{COMBOS}/{combo['id']}/log", json={"meal": "brunch"}).status_code == 422
    at_limit = client.post(
        COMBOS, json={"name": "Viel", "items": [{"food_id": food.id, "grams": 1500}]}
    )
    assert at_limit.status_code == 201


def test_a_group_with_more_than_1500_g_of_one_food_is_no_combo(
    client: TestClient, session: Session
) -> None:
    water = add_food(session, "Wasser", kcal=0)
    group = client.post(
        "/api/v1/entries/group",
        json={"group_name": "Wasser", "items": [{"food_id": water.id, "grams": 2000}]},
    ).json()
    assert client.post(COMBOS, json={"group_id": group["group_id"]}).status_code == 422
