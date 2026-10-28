from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.factories import add_food, add_serving

FALLBACK = {"label": "100 g", "grams": 100, "origin": None}


def log(client: TestClient, food_id: int, eaten_at: str) -> None:
    body = {"food_id": food_id, "grams": 50, "eaten_at": eaten_at}
    assert client.post("/api/v1/entries", json=body).status_code == 201


def test_food_with_values_servings_and_source(client: TestClient, session: Session) -> None:
    food = add_food(
        session,
        "Banane roh",
        source="bls",
        source_id="F503100",
        kcal=79,
        protein=1.3,
        carbs=15.9,
        fat=0.4,
        fiber=2,
        sugar=13.9,
    )
    add_serving(session, food, "1 Banane", 120)
    add_serving(session, food, "1 kleine", 90, origin="own", default=False)

    body = client.get(f"/api/v1/foods/{food.id}").json()

    assert (body["name"], body["source"], body["source_id"], body["basis"]) == (
        "Banane roh",
        "bls",
        "F503100",
        "g",
    )
    assert body["per_100"] == {
        "kcal": 79,
        "protein": 1.3,
        "carbs": 15.9,
        "fat": 0.4,
        "fiber": 2,
        "sugar": 13.9,
        "sat_fat": None,
        "salt": None,
    }
    assert [(s["label"], s["grams"], s["origin"], s["is_default"]) for s in body["servings"]] == [
        ("1 kleine", 90, "own", False),
        ("1 Banane", 120, "estimated", True),
    ]
    assert body["standard_serving"] == {"label": "1 Banane", "grams": 120, "origin": "estimated"}


def test_food_without_serving_has_the_derived_100_g(client: TestClient, session: Session) -> None:
    food = add_food(session, "Linsen")
    body = client.get(f"/api/v1/foods/{food.id}").json()
    assert body["servings"] == []
    assert body["standard_serving"] == FALLBACK


def test_unknown_food_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/foods/999999").status_code == 404
    assert client.get("/api/v1/foods/banane").status_code == 422


def test_recent_lists_at_most_8_foods_by_latest_entry(client: TestClient, session: Session) -> None:
    foods = [add_food(session, f"Lebensmittel {n}") for n in range(10)]
    add_serving(session, foods[9], "1 Becher", 200, origin="package")
    for n, food in enumerate(foods):
        log(client, food.id, f"2026-10-20T{8 + n:02d}:00:00+02:00")
    # Repeats: food 0 again as the latest, food 9 again earlier than its first entry.
    log(client, foods[0].id, "2026-10-21T08:00:00+02:00")
    log(client, foods[9].id, "2026-10-19T08:00:00+02:00")

    recent = client.get("/api/v1/recent").json()

    assert [r["name"] for r in recent] == [
        "Lebensmittel 0",
        "Lebensmittel 9",
        "Lebensmittel 8",
        "Lebensmittel 7",
        "Lebensmittel 6",
        "Lebensmittel 5",
        "Lebensmittel 4",
        "Lebensmittel 3",
    ]
    assert recent[0]["standard_serving"] == FALLBACK
    assert recent[1]["standard_serving"] == {"label": "1 Becher", "grams": 200, "origin": "package"}
    assert recent[0]["per_100"] == {"kcal": 100, "protein": 10, "carbs": 10, "fat": 1}


def test_recent_is_empty_without_entries(client: TestClient) -> None:
    assert client.get("/api/v1/recent").json() == []


def test_search_returns_summaries(client: TestClient, session: Session) -> None:
    banana = add_food(session, "Banane roh", source="bls", kcal=79)
    add_serving(session, banana, "1 Banane", 120)
    add_food(session, "Bananenchips frittiert, gesüßt", source="bls", kcal=490)
    add_food(session, "Gurke roh", source="bls", kcal=16)

    results = client.get("/api/v1/foods/search", params={"q": "Banane"}).json()

    assert [r["name"] for r in results] == ["Banane roh", "Bananenchips frittiert, gesüßt"]
    assert results[0] == {
        "id": banana.id,
        "name": "Banane roh",
        "brand": None,
        "source": "bls",
        "basis": "g",
        "per_100": {"kcal": 79, "protein": 10, "carbs": 10, "fat": 1},
        "standard_serving": {"label": "1 Banane", "grams": 120, "origin": "estimated"},
    }
    assert results[1]["standard_serving"] == FALLBACK


def test_search_validates_its_parameters(client: TestClient) -> None:
    assert client.get("/api/v1/foods/search").status_code == 422
    assert client.get("/api/v1/foods/search", params={"q": ""}).status_code == 422
    assert client.get("/api/v1/foods/search", params={"q": "a", "limit": 0}).status_code == 422
    assert client.get("/api/v1/foods/search", params={"q": "500 g"}).json() == []


def test_openapi_documents_the_endpoints(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert {
        "/api/v1/days/{day}",
        "/api/v1/entries",
        "/api/v1/entries/{entry_id}",
        "/api/v1/recent",
        "/api/v1/foods/search",
        "/api/v1/foods/{food_id}",
    } <= set(paths)
    day = paths["/api/v1/days/{day}"]["get"]["responses"]["200"]["content"]["application/json"]
    assert day["schema"] == {"$ref": "#/components/schemas/Day"}
