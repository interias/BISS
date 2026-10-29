"""Barcode chain and the first entry of a scanned product (SPEC 4, SPEC 6), OFF via respx."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_off
from app.main import app
from app.models import Food, FoodSourceData, OffCache, Serving
from app.sources.off import OpenFoodFacts
from tests.factories import add_food, add_serving, off_answer

BASE = "https://off.test"
CODE = "2000000000015"
GTIN = "02000000000015"
URL = f"{BASE}/api/v2/product/{CODE}"


@pytest.fixture
def off(client: TestClient) -> Iterator[respx.Router]:
    """Open Food Facts at a test URL; a request without a route fails, nothing leaves."""
    source = OpenFoodFacts(BASE)  # one per test, so the local limit counts across requests
    app.dependency_overrides[get_off] = lambda: source
    with respx.mock(assert_all_called=False) as router:
        yield router


def scan(client: TestClient, code: str = CODE):
    return client.get(f"/api/v1/foods/barcode/{code}")


def log(client: TestClient, **body):
    return client.post("/api/v1/entries", json=body)


def cache_rows(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(OffCache))


def off_foods(session: Session) -> list[Food]:
    return session.scalars(select(Food).where(Food.source == "off")).all()


@pytest.mark.parametrize("code", [CODE, GTIN])
def test_own_food_is_found_first(
    client: TestClient, session: Session, off: respx.Router, code: str
) -> None:
    route = off.get(URL).respond(json=off_answer())
    food = add_food(session, "Haferflocken", brand="Kölln", gtin=GTIN, source="off")
    add_serving(session, food, "1 Portion", 40, origin="package")
    response = scan(client, code)
    assert response.status_code == 200
    body = response.json()
    assert (body["id"], body["gtin"], body["name"], body["source"]) == (
        food.id,
        GTIN,
        "Haferflocken",
        "off",
    )
    assert body["servings"] == [
        {"label": "1 Portion", "grams": 40, "origin": "package", "is_default": True}
    ]
    assert body["standard_serving"] == {"label": "1 Portion", "grams": 40, "origin": "package"}
    assert not route.called


def test_live_hit_is_a_draft_and_cached(client: TestClient, session: Session, off) -> None:
    route = off.get(URL).respond(json=off_answer())
    response = scan(client)
    assert response.status_code == 200
    assert response.json() == {
        "id": None,
        "gtin": GTIN,
        "name": "Testriegel Haselnuss",
        "brand": "Testmarke",
        "source": "off",
        "basis": "g",
        "density": 1.0,
        "image_path": None,
        "category": "other",
        "per_100": {
            "kcal": 452,
            "protein": 8.2,
            "carbs": 54,
            "fat": 21.5,
            "fiber": 4.1,
            "sugar": 30,
            "sat_fat": 6.3,
            "salt": 0.2,
        },
        "servings": [
            {"label": "1 Riegel (40 g)", "grams": 40, "origin": "package", "is_default": True}
        ],
        "standard_serving": {"label": "1 Riegel (40 g)", "grams": 40, "origin": "package"},
    }
    assert off_foods(session) == []  # stored only on the first entry
    cached = session.get(OffCache, GTIN)
    assert cached.payload == off_answer()

    assert scan(client).json()["id"] is None
    assert route.call_count == 1  # the second scan is served from the cache


def test_draft_without_serving_size_uses_100_g(client: TestClient, off) -> None:
    off.get(URL).respond(json=off_answer(serving_size=None, serving_quantity=None))
    body = scan(client).json()
    assert body["servings"] == []
    assert body["standard_serving"] == {"label": "100 g", "grams": 100, "origin": None}


def test_expired_cache_asks_open_food_facts_again(
    client: TestClient, session: Session, off
) -> None:
    old = datetime.now(UTC) - timedelta(days=31)
    session.add(OffCache(gtin=GTIN, payload=off_answer(product_name_de="Alt"), fetched_at=old))
    session.flush()
    route = off.get(URL).respond(json=off_answer())
    assert scan(client).json()["name"] == "Testriegel Haselnuss"
    assert route.call_count == 1
    session.expire_all()
    assert session.get(OffCache, GTIN).fetched_at > old + timedelta(days=30)


def test_fresh_cache_is_used_without_request(client: TestClient, session: Session, off) -> None:
    recent = datetime.now(UTC) - timedelta(days=29)
    payload = off_answer(product_name_de="Gecacht")
    session.add(OffCache(gtin=GTIN, payload=payload, fetched_at=recent))
    session.flush()
    route = off.get(URL).respond(json=off_answer())
    assert scan(client).json()["name"] == "Gecacht"
    assert not route.called


@pytest.mark.parametrize(
    "mock",
    [
        {"json": {"code": CODE, "status": 0, "status_verbose": "product not found"}},
        {"status_code": 404},
        {"status_code": 500},
        {"status_code": 429},
        {"side_effect": httpx.ReadTimeout},
    ],
    ids=["no hit", "404", "5xx", "429", "timeout"],
)
def test_no_hit_is_404_with_the_gtin_and_not_cached(
    client: TestClient, session: Session, off, mock: dict
) -> None:
    route = off.get(URL)
    if "side_effect" in mock:
        route.mock(side_effect=mock["side_effect"])
    else:
        route.respond(**mock)
    response = scan(client)
    assert response.status_code == 404
    body = response.json()
    assert body["gtin"] == GTIN
    assert body["detail"]
    assert cache_rows(session) == 0


def test_local_limit_ends_the_chain_with_404(client: TestClient, session: Session, off) -> None:
    route = off.get(URL).respond(json={"code": CODE, "status": 0})
    statuses = [scan(client).status_code for _ in range(16)]
    assert statuses == [404] * 16
    assert route.call_count == 15


@pytest.mark.parametrize(
    ("code", "path"),
    [("200000000011", "0200000000011"), ("20000011", "20000011")],
    ids=["UPC-A", "EAN-8"],
)
def test_upc_a_and_ean_8_are_asked_in_off_form(
    client: TestClient, off, code: str, path: str
) -> None:
    off.get(f"{BASE}/api/v2/product/{path}").respond(json=off_answer(code=path))
    body = scan(client, code).json()
    assert body["gtin"] == code.zfill(14)


@pytest.mark.parametrize("code", ["2000000000016", "12345", "abc"])
def test_invalid_code_is_422(client: TestClient, off, code: str) -> None:
    assert scan(client, code).status_code == 422


def test_first_entry_stores_the_product_as_food(client: TestClient, session: Session, off) -> None:
    off.get(URL).respond(json=off_answer())
    scan(client)
    response = log(client, gtin=CODE, meal="snack")
    assert response.status_code == 201
    entry = response.json()
    assert entry["grams"] == 40  # the package serving is the standard serving
    assert entry["macros"]["kcal"] == 180.8
    assert entry["food"]["source"] == "off"

    (food,) = off_foods(session)
    assert entry["food"]["id"] == food.id
    assert (food.gtin, food.source_id, food.name, food.brand) == (
        GTIN,
        CODE,
        "Testriegel Haselnuss",
        "Testmarke",
    )
    cached = session.get(OffCache, GTIN)
    assert food.fetched_at == cached.fetched_at
    raw = session.scalar(select(FoodSourceData).where(FoodSourceData.food_id == food.id))
    assert (raw.source, raw.source_id, raw.payload) == ("off", CODE, off_answer())
    (serving,) = session.scalars(select(Serving).where(Serving.food_id == food.id))
    assert (serving.label, serving.grams, serving.origin, serving.is_default) == (
        "1 Riegel (40 g)",
        40,
        "package",
        True,
    )

    # From now on the chain finds it in the own DB, and a further entry adds no food.
    assert scan(client).json()["id"] == food.id
    assert log(client, gtin=GTIN, grams=80).json()["food"]["id"] == food.id
    assert len(off_foods(session)) == 1


def test_entry_with_gtin_of_an_own_food(client: TestClient, session: Session) -> None:
    food = add_food(session, "Joghurt", gtin=GTIN)
    entry = log(client, gtin=CODE, grams=150).json()
    assert entry["food"]["id"] == food.id


def test_entry_with_unknown_gtin_is_404(client: TestClient, session: Session) -> None:
    response = log(client, gtin=CODE)
    assert response.status_code == 404
    assert response.json()["gtin"] == GTIN
    assert off_foods(session) == []


def test_entry_with_expired_cache_is_404(client: TestClient, session: Session) -> None:
    old = datetime.now(UTC) - timedelta(days=31)
    session.add(OffCache(gtin=GTIN, payload=off_answer(), fetched_at=old))
    session.flush()
    assert log(client, gtin=CODE).status_code == 404
    assert off_foods(session) == []


@pytest.mark.parametrize(
    "body",
    [{}, {"food_id": 1, "gtin": CODE}, {"gtin": "2000000000016"}, {"gtin": "x"}],
    ids=["neither", "both", "check digit", "no digits"],
)
def test_entry_needs_exactly_one_valid_food(client: TestClient, body: dict) -> None:
    assert log(client, **body).status_code == 422
