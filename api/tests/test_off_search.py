"""Open Food Facts text search (ADR-0011) against invented answers (respx, no network)."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_now, get_off
from app.main import app
from app.models import OffCache
from app.search import off_search
from app.search.off_search import QueryCache, search_off, wants_off
from app.search.search import search_foods
from app.sources.off import USER_AGENT, OpenFoodFacts, RateLimit
from tests.factories import add_cached, add_food

BASE = "https://off.test"
SEARCH = "https://search.off.test"
SEARCH_URL = f"{SEARCH}/search"
NOW = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)


def hit(code: str, name: str, **fields) -> dict:
    """An invented Search-a-licious hit: brands as a list, values per 100 g."""
    product = {
        "code": code,
        "product_name": name,
        "product_name_de": name,
        "brands": ["Testmarke"],
        "categories_tags": ["en:breakfast-cereals"],
        "product_quantity_unit": "g",
        "serving_size": "1 Portion (50 g)",
        "serving_quantity": 50,
        "nutriments": {
            "energy-kcal_100g": 380,
            "proteins_100g": 9,
            "carbohydrates_100g": 62,
            "fat_100g": 8,
        },
    }
    return {key: value for key, value in (product | fields).items() if value is not None}


def answer(*hits: dict) -> dict:
    return {"hits": list(hits), "count": len(hits), "page": 1, "page_size": 20}


MUESLI = hit("2000000014012", "Testmüsli Beere")
CRUNCHY = hit("2000000014029", "Testmüsli Knusper")


@pytest.fixture
def source() -> OpenFoodFacts:
    return OpenFoodFacts(BASE, search_url=SEARCH)


@pytest.fixture
def router() -> Iterator[respx.Router]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock


@pytest.fixture
def cache() -> QueryCache:
    return QueryCache()


def test_request_names_words_country_language_and_fields(
    router: respx.Router, source: OpenFoodFacts
) -> None:
    route = router.get(SEARCH_URL).respond(json=answer(MUESLI))
    found = source.search('Test-Müsli: "Beere" OR *')
    request = route.calls.last.request
    assert request.headers["User-Agent"] == USER_AGENT
    assert request.url.params["q"] == 'test müsli beere or countries_tags:"en:germany"'
    assert request.url.params["langs"] == "de"
    fields = set(request.url.params["fields"].split(","))
    assert {"code", "product_name_de", "brands", "nutriments", "categories_tags"} <= fields
    assert request.extensions["timeout"]["read"] == 3.0
    # brands as API v2 has them, so off.draft() and the cache read the product.
    assert found.reason is None
    assert found.products[0]["code"] == "2000000014012"
    assert found.products[0]["product"]["brands"] == "Testmarke"


@pytest.mark.parametrize(
    ("response", "reason"),
    [
        (httpx.Response(429), "limit"),
        (httpx.Response(503), "error"),
        (httpx.Response(200, text="not json"), "error"),
        (httpx.Response(200, json={"hits": "none"}), "error"),
    ],
)
def test_failures_are_a_reason(
    router: respx.Router, source: OpenFoodFacts, response: httpx.Response, reason: str
) -> None:
    router.get(SEARCH_URL).mock(return_value=response)
    assert source.search("testmüsli").reason == reason


def test_timeout_and_connection_failure(router: respx.Router, source: OpenFoodFacts) -> None:
    router.get(SEARCH_URL).mock(side_effect=httpx.ReadTimeout("slow"))
    assert source.search("testmüsli").reason == "timeout"
    router.get(SEARCH_URL).mock(side_effect=httpx.ConnectError("down"))
    assert source.search("testmüsli").reason == "error"


def test_local_limit_below_the_documented_ten_per_minute(router: respx.Router) -> None:
    now = [0.0]
    source = OpenFoodFacts(BASE, search_url=SEARCH, search_limit=RateLimit(6, clock=lambda: now[0]))
    route = router.get(SEARCH_URL).respond(json=answer())
    assert [source.search("testmüsli").reason for _ in range(7)] == [None] * 6 + ["limit"]
    assert route.call_count == 6
    now[0] = 61.0
    assert source.search("testmüsli").reason is None
    # The barcode lookup has its own limit.
    assert source.rate_limit is not source.search_limit


def test_products_are_cached_and_returned_as_drafts(
    router: respx.Router, source: OpenFoodFacts, cache: QueryCache, session: Session
) -> None:
    router.get(SEARCH_URL).respond(json=answer(MUESLI, hit("123", "Ohne GTIN"), CRUNCHY))
    found = search_off(session, "testmüsli", source, NOW, cache)
    assert found.reason is None
    assert [(h.id, h.gtin, h.name, h.source) for h in found.hits] == [
        (None, "02000000014012", "Testmüsli Beere", "off"),
        (None, "02000000014029", "Testmüsli Knusper", "off"),
    ]
    assert found.hits[0].category == "grains"
    assert (found.hits[0].serving_grams, found.hits[0].kcal) == (50, 380)
    rows = session.scalars(select(OffCache).order_by(OffCache.gtin)).all()
    assert [(r.gtin, r.fetched_at) for r in rows] == [
        ("02000000014012", NOW),
        ("02000000014029", NOW),
    ]


def test_a_product_without_name_or_energy_is_left_out(
    router: respx.Router, source: OpenFoodFacts, cache: QueryCache, session: Session
) -> None:
    router.get(SEARCH_URL).respond(json=answer(hit("2000000014012", "Ohne Energie", nutriments={})))
    assert search_off(session, "ohne energie", source, NOW, cache).hits == []
    assert session.scalar(select(OffCache.gtin)) is None


def test_the_same_query_within_a_day_asks_once(
    router: respx.Router, source: OpenFoodFacts, cache: QueryCache, session: Session
) -> None:
    route = router.get(SEARCH_URL).respond(json=answer(MUESLI))
    first = search_off(session, "Testmüsli", source, NOW, cache)
    again = search_off(session, " testmüsli ", source, NOW + timedelta(hours=23), cache)
    assert route.call_count == 1
    assert len(first.hits) == 1
    # The product is in the cache now: the local search shows it, so OFF adds it no more.
    assert again == off_search.OffSearch([])
    assert [h.gtin for h in search_foods(session, "testmüsli", now=NOW)] == [first.hits[0].gtin]
    search_off(session, "testmüsli", source, NOW + timedelta(hours=25), cache)
    assert route.call_count == 2


def test_failures_are_not_cached(
    router: respx.Router, source: OpenFoodFacts, cache: QueryCache, session: Session
) -> None:
    route = router.get(SEARCH_URL)
    route.side_effect = [httpx.Response(503), httpx.Response(200, json=answer(MUESLI))]
    assert search_off(session, "testmüsli", source, NOW, cache) == off_search.OffSearch([], "error")
    assert len(search_off(session, "testmüsli", source, NOW, cache).hits) == 1


def test_the_cache_keeps_a_bounded_number_of_queries() -> None:
    cache = QueryCache(size=2)
    for query in ("aaa", "bbb", "ccc"):
        cache.put(query, NOW, [query])
    assert cache.get("aaa", NOW) is None
    assert cache.get("ccc", NOW) == ["ccc"]


def test_short_query_asks_nothing(
    router: respx.Router, source: OpenFoodFacts, cache: QueryCache, session: Session
) -> None:
    route = router.get(SEARCH_URL).respond(json=answer(MUESLI))
    assert search_off(session, "ab", source, NOW, cache) == off_search.OffSearch([], "short")
    assert not route.called


def test_local_hits_never_appear_twice(
    router: respx.Router, source: OpenFoodFacts, cache: QueryCache, session: Session
) -> None:
    # One product is a food already, one is in the cache and found by the local search.
    add_food(session, "Testmüsli Beere", gtin="02000000014012", source="off")
    add_cached(
        session, "2000000014029", NOW - timedelta(days=1), product_name_de="Testmüsli Knusper"
    )
    other = hit("2000000014036", "Testmüsli Nuss")
    router.get(SEARCH_URL).respond(json=answer(MUESLI, CRUNCHY, other))
    found = search_off(session, "testmüsli", source, NOW, cache)
    assert [h.gtin for h in found.hits] == ["02000000014036"]


def test_a_gtin_of_a_food_not_found_locally_is_that_food(
    router: respx.Router, source: OpenFoodFacts, cache: QueryCache, session: Session
) -> None:
    food = add_food(session, "Frühstücksflocken", gtin="02000000014012", source="own")
    router.get(SEARCH_URL).respond(json=answer(MUESLI))
    (found,) = search_off(session, "testmüsli", source, NOW, cache).hits
    assert (found.id, found.gtin, found.name, found.source) == (
        food.id,
        food.gtin,
        food.name,
        "own",
    )


@pytest.mark.parametrize(
    ("query", "hits", "expected"),
    [("ban", 4, True), ("ban", 5, False), ("ba", 0, False), ("b!", 0, False)],
)
def test_wants_off_below_five_hits_from_three_characters(
    query: str, hits: int, expected: bool
) -> None:
    assert wants_off(query, hits, 20) is expected


@pytest.fixture
def api(
    client: TestClient, source: OpenFoodFacts, router: respx.Router, monkeypatch
) -> respx.Router:
    """The endpoint with the test source, a fixed clock and an empty query cache."""
    app.dependency_overrides[get_off] = lambda: source
    app.dependency_overrides[get_now] = lambda: NOW
    monkeypatch.setattr(off_search, "QUERIES", QueryCache())
    return router


def test_endpoint_answers_hits_and_logging_works_by_gtin(
    api: respx.Router, client: TestClient, session: Session
) -> None:
    api.get(SEARCH_URL).respond(json=answer(MUESLI))
    body = client.get("/api/v1/foods/search/off", params={"q": "testmüsli"}).json()
    assert body["reason"] is None
    (found,) = body["hits"]
    assert (found["id"], found["gtin"], found["source"]) == (None, "02000000014012", "off")
    assert found["standard_serving"] == {
        "label": "1 Portion (50 g)",
        "grams": 50,
        "origin": "package",
    }
    entry = client.post("/api/v1/entries", json={"gtin": found["gtin"], "grams": 50})
    assert entry.status_code == 201
    assert entry.json()["food"]["category"] == "grains"
    # Now a food: the local search finds it, OFF adds nothing twice.
    local = client.get("/api/v1/foods/search", params={"q": "testmüsli"}).json()
    assert [h["gtin"] for h in local["hits"]] == [found["gtin"]]
    assert client.get("/api/v1/foods/search/off", params={"q": "testmüsli"}).json()["hits"] == []


def test_endpoint_on_failure_answers_an_empty_list(api: respx.Router, client: TestClient) -> None:
    api.get(SEARCH_URL).mock(side_effect=httpx.ReadTimeout("slow"))
    response = client.get("/api/v1/foods/search/off", params={"q": "testmüsli"})
    assert response.status_code == 200
    assert response.json() == {"hits": [], "reason": "timeout"}
    assert client.get("/api/v1/foods/search/off", params={"q": "ab"}).json() == {
        "hits": [],
        "reason": "short",
    }
