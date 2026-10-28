"""Open Food Facts adapter against invented API v2 answers (respx, no network; SPEC 8)."""

import re
from collections.abc import Iterator

import httpx
import pytest
import respx

from app.sources.off import USER_AGENT, OpenFoodFacts, RateLimit, draft
from tests.factories import off_answer

BASE = "https://off.test"
GTIN = "02000000000015"
URL = f"{BASE}/api/v2/product/2000000000015"


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def router() -> Iterator[respx.Router]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock


def test_hit_returns_the_answer(router: respx.Router) -> None:
    route = router.get(URL).respond(json=off_answer())
    assert OpenFoodFacts(BASE).product(GTIN) == off_answer()
    request = route.calls.last.request
    assert request.headers["User-Agent"] == USER_AGENT
    assert re.fullmatch(r"BISS/\d+\.\d+\.\d+ \(github\.com/interias/BISS\)", USER_AGENT)
    fields = request.url.params["fields"].split(",")
    assert {"product_name", "brands", "serving_size", "nutriments"} <= set(fields)
    assert request.extensions["timeout"] == {"connect": 2.0, "read": 2.0, "write": 2.0, "pool": 2.0}


def test_base_url_with_trailing_slash(router: respx.Router) -> None:
    router.get(URL).respond(json=off_answer())
    assert OpenFoodFacts(BASE + "/").product(GTIN) is not None


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json={"code": "2000000000015", "status": 0, "status_verbose": "x"}),
        httpx.Response(404, json={"status": 0}),
        httpx.Response(500),
        httpx.Response(503, text="maintenance"),
        httpx.Response(429, json={"error": "too many requests"}),
        httpx.Response(200, text="<html>no json</html>"),
        httpx.Response(200, json={"code": "2000000000015", "status": 1}),
    ],
    ids=["status 0", "404", "500", "503", "429", "no json", "no product"],
)
def test_no_hit(router: respx.Router, response: httpx.Response) -> None:
    router.get(URL).mock(return_value=response)
    assert OpenFoodFacts(BASE).product(GTIN) is None


@pytest.mark.parametrize("error", [httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError])
def test_timeout_and_connection_failure_are_no_hit(
    router: respx.Router, error: type[httpx.HTTPError]
) -> None:
    router.get(URL).mock(side_effect=error)
    assert OpenFoodFacts(BASE).product(GTIN) is None


def test_local_limit_of_15_requests_per_minute(router: respx.Router) -> None:
    route = router.get(URL).respond(json=off_answer())
    clock = Clock()
    source = OpenFoodFacts(BASE, RateLimit(clock=clock))
    for _ in range(15):
        assert source.product(GTIN) is not None
        clock.now += 1
    assert source.product(GTIN) is None
    assert route.call_count == 15

    clock.now = 1000.0 + 60  # the first request leaves the window
    assert source.product(GTIN) is not None
    assert source.product(GTIN) is None
    assert route.call_count == 16


def test_failed_requests_count_against_the_limit(router: respx.Router) -> None:
    route = router.get(URL).mock(side_effect=httpx.ReadTimeout)
    source = OpenFoodFacts(BASE, RateLimit(limit=2, clock=Clock()))
    for _ in range(3):
        assert source.product(GTIN) is None
    assert route.call_count == 2


def test_draft_maps_the_product() -> None:
    found = draft(GTIN, off_answer())
    assert found.gtin == GTIN
    assert found.source_id == "2000000000015"
    assert (found.name, found.brand, found.basis) == ("Testriegel Haselnuss", "Testmarke", "g")
    assert found.values == {
        "kcal": 452,
        "protein": 8.2,
        "carbs": 54,
        "fat": 21.5,
        "fiber": 4.1,
        "sugar": 30,
        "sat_fat": 6.3,
        "salt": 0.2,
    }
    assert (found.serving.label, found.serving.grams) == ("1 Riegel (40 g)", 40)


def test_draft_without_serving_size_has_no_serving() -> None:
    assert draft(GTIN, off_answer(serving_size=None, serving_quantity=None)).serving is None


@pytest.mark.parametrize(
    ("serving_size", "serving_quantity", "grams"),
    [
        ("15 g", None, 15),
        ("2 Kekse (12,5 g)", None, 12.5),
        ("250 ml", 250, 250),
        ("1 Stück", None, None),
    ],
)
def test_draft_serving_from_serving_size(
    serving_size: str, serving_quantity: float | None, grams: float | None
) -> None:
    answer = off_answer(serving_size=serving_size, serving_quantity=serving_quantity)
    serving = draft(GTIN, answer).serving
    assert (serving and serving.grams) == grams


def test_draft_with_missing_nutrients() -> None:
    answer = off_answer(nutriments={"energy-kj_100g": 418.4, "fat_100g": "1,5"})
    found = draft(GTIN, answer)
    assert found.values == {
        "kcal": 100.0,  # from kJ
        "protein": 0.0,
        "carbs": 0.0,
        "fat": 1.5,
        "fiber": None,
        "sugar": None,
        "sat_fat": None,
        "salt": None,
    }


@pytest.mark.parametrize(
    "product",
    [
        {"nutriments": {}},
        {"nutriments": None},
        {"product_name": None, "product_name_de": None},
        {"product_name": "", "product_name_de": " "},
    ],
    ids=["no energy", "no nutriments", "no name", "empty name"],
)
def test_draft_without_name_or_energy_is_none(product: dict) -> None:
    assert draft(GTIN, off_answer(**product)) is None


def test_draft_falls_back_to_the_generic_name_and_no_brand() -> None:
    found = draft(GTIN, off_answer(product_name_de=None, brands=None))
    assert (found.name, found.brand) == ("Test Bar Hazelnut", None)


def test_draft_of_a_liquid_has_basis_ml() -> None:
    assert draft(GTIN, off_answer(product_quantity_unit="ml")).basis == "ml"
