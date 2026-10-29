"""The MCP tools over the in-memory client of the SDK against the test database (ADR-0007)."""

from contextlib import nullcontext
from datetime import UTC, date, datetime, timedelta

import anyio
import pytest
from fastapi.testclient import TestClient
from mcp import Client
from mcp.server.mcpserver import MCPServer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.day import day_of
from app.mcp import build_server
from app.models import Entry, Food, Goal
from tests.factories import add_cached, add_food, add_serving


@pytest.fixture
def server(session: Session) -> MCPServer:
    return build_server(lambda: nullcontext(session))


def call(server: MCPServer, tool: str, **arguments):
    """Call a tool: its structured result, or the error text of a failed call."""

    async def run():
        async with Client(server) as client:
            return await client.call_tool(tool, arguments)

    result = anyio.run(run)
    if result.is_error:
        return {"error": result.content[0].text}
    content = result.structured_content
    return content["result"] if set(content) == {"result"} else content


def tools(server: MCPServer):
    async def run():
        async with Client(server) as client:
            return (await client.list_tools()).tools

    return anyio.run(run)


def entry_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Entry))


def test_exactly_seven_tools_and_only_log_meal_and_log_combo_write(server: MCPServer) -> None:
    listed = {tool.name: tool for tool in tools(server)}
    assert set(listed) == {
        "search_food",
        "get_food",
        "list_entries",
        "daily_summary",
        "list_combos",
        "log_meal",
        "log_combo",
    }
    read_only = {name for name, tool in listed.items() if tool.annotations.read_only_hint}
    assert read_only == {"search_food", "get_food", "list_entries", "daily_summary", "list_combos"}


def test_the_api_serves_mcp_at_its_path(client: TestClient) -> None:
    """Streamable HTTP at /mcp, outside /api/v1, for any Host in the local network."""
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1"},
        },
    }
    response = client.post(
        "/mcp",
        json=initialize,
        headers={"Accept": "application/json, text/event-stream", "Host": "192.168.1.20:2478"},
    )
    assert response.status_code == 200
    assert '"name":"biss"' in response.text.replace(" ", "")
    assert "/mcp" not in client.get("/openapi.json").json()["paths"]


def test_read_tools_change_nothing(server: MCPServer, session: Session) -> None:
    food = add_food(session, "Banane", kcal=93)
    before = entry_count(session)
    call(server, "search_food", query="banane")
    call(server, "get_food", food_id=food.id)
    call(server, "list_entries", first="2026-10-01", last="2026-10-31")
    call(server, "daily_summary", day="2026-10-28")
    call(server, "list_combos")
    assert entry_count(session) == before
    assert session.scalar(select(func.count()).select_from(Goal)) == 0


def test_search_food_finds_like_the_rest_search(
    server: MCPServer, session: Session, client: TestClient
) -> None:
    food = add_food(session, "Banane roh", kcal=93, protein=1.2, carbs=20, fat=0.2)
    add_serving(session, food, "1 Banane", 120)
    hits = call(server, "search_food", query="banane")
    assert hits == client.get("/api/v1/foods/search", params={"q": "banane"}).json()
    assert hits[0]["id"] == food.id
    assert hits[0]["standard_serving"] == {"label": "1 Banane", "grams": 120, "origin": "estimated"}


def test_get_food_returns_the_food_with_servings(
    server: MCPServer, session: Session, client: TestClient
) -> None:
    food = add_food(session, "Skyr", brand="Testmarke", kcal=63)
    add_serving(session, food, "1 Becher", 150, origin="package")
    detail = call(server, "get_food", food_id=food.id)
    assert detail == client.get(f"/api/v1/foods/{food.id}").json()
    assert detail["servings"][0]["label"] == "1 Becher"
    assert call(server, "get_food", food_id=999999)["error"].endswith("food 999999 not found")


def test_list_entries_returns_the_days_of_the_range(server: MCPServer, session: Session) -> None:
    food = add_food(session, "Reis gekocht", kcal=130)
    for moment in (
        "2026-10-27T23:00:00+01:00",  # the 27th
        "2026-10-28T03:30:00+01:00",  # still the 27th
        "2026-10-28T12:00:00+01:00",
        "2026-10-29T03:59:00+01:00",  # still the 28th
        "2026-10-29T04:00:00+01:00",  # the 29th
    ):
        eaten_at = datetime.fromisoformat(moment)
        session.add(
            Entry(
                food_id=food.id,
                grams=100,
                meal="dinner",
                eaten_at=eaten_at,
                day=day_of(eaten_at),
                kcal=130,
                protein=0,
                carbs=0,
                fat=0,
            )
        )
    session.flush()

    listed = call(server, "list_entries", first="2026-10-28", last="2026-10-28")
    assert [e["day"] for e in listed] == ["2026-10-28", "2026-10-28"]
    assert [datetime.fromisoformat(e["eaten_at"]).hour for e in listed] == [11, 2]  # UTC, by time
    assert listed[0]["food"]["name"] == "Reis gekocht"
    assert len(call(server, "list_entries", first="2026-10-27", last="2026-10-29")) == 5
    assert call(server, "list_entries", first="2026-10-29", last="2026-10-28") == []


def test_daily_summary_is_the_day_of_the_rest_api(
    server: MCPServer, session: Session, client: TestClient
) -> None:
    food = add_food(session, "Haferflocken", kcal=368, protein=13.5, carbs=58.7, fat=6.7)
    body = {
        "food_id": food.id,
        "grams": 60,
        "meal": "breakfast",
        "eaten_at": "2026-10-28T07:12:00+01:00",
    }
    assert client.post("/api/v1/entries", json=body).status_code == 201
    session.add(Goal(day=date(2026, 10, 28), kcal=1800, protein=170, carbs=150, fat=60))
    session.flush()

    summary = call(server, "daily_summary", day="2026-10-28")
    rest = client.get("/api/v1/days/2026-10-28").json()
    summary.pop("suggested_meal"), rest.pop("suggested_meal")  # by the clock of the call
    assert summary == rest
    assert summary["targets"]["kcal"] == 1800
    assert summary["totals"]["kcal"] == 220.8

    today = call(server, "daily_summary")
    assert today["date"] == day_of(datetime.now(UTC)).isoformat()
    assert today["targets"] == client.get("/api/v1/days/today").json()["targets"]


def test_log_meal_logs_with_grams_and_meal(server: MCPServer, session: Session) -> None:
    food = add_food(session, "Haferflocken", kcal=370, protein=13.5, carbs=58.7, fat=7)
    entry = call(server, "log_meal", food_id=food.id, grams=60, meal="breakfast")
    assert (entry["grams"], entry["meal"]) == (60, "breakfast")
    assert entry["macros"] == {"kcal": 222.0, "protein": 8.1, "carbs": 35.2, "fat": 4.2}
    assert entry["day"] == day_of(datetime.now(UTC)).isoformat()
    assert session.get(Entry, entry["id"]).kcal == 222.0


def test_log_meal_defaults_like_post_entries(server: MCPServer, session: Session) -> None:
    food = add_food(session, "Banane", kcal=79)
    add_serving(session, food, "1 Banane", 120)
    entry = call(server, "log_meal", food_id=food.id)
    assert entry["grams"] == 120  # the standard serving
    assert entry["meal"] in {"breakfast", "lunch", "snack", "dinner"}  # the suggestion
    assert entry["macros"]["kcal"] == 94.8


def test_log_meal_rejects_what_post_entries_rejects(server: MCPServer, session: Session) -> None:
    food = add_food(session, "Banane")
    before = entry_count(session)
    assert call(server, "log_meal", food_id=999999)["error"].endswith("food 999999 not found")
    assert "error" in call(server, "log_meal", food_id=food.id, grams=0)
    assert "error" in call(server, "log_meal", food_id=food.id, meal="brunch")
    assert entry_count(session) == before


# An invented product in the Open Food Facts cache (ADR-0002).
CODE = "2000000021058"
GTIN = "0" + CODE


def test_search_food_returns_a_cached_product_with_its_gtin(
    server: MCPServer, session: Session, client: TestClient
) -> None:
    add_cached(session, CODE, datetime.now(UTC) - timedelta(days=1))
    hits = call(server, "search_food", query="testriegel")
    assert hits == client.get("/api/v1/foods/search", params={"q": "testriegel"}).json()
    assert [(h["id"], h["gtin"], h["source"]) for h in hits] == [(None, GTIN, "off")]


def test_log_meal_logs_a_cached_product_by_gtin(server: MCPServer, session: Session) -> None:
    add_cached(session, CODE, datetime.now(UTC) - timedelta(days=1))
    entry = call(server, "log_meal", gtin=CODE, meal="snack")
    assert (entry["grams"], entry["meal"], entry["macros"]["kcal"]) == (40, "snack", 180.8)
    food = session.get(Food, entry["food"]["id"])
    assert (food.gtin, food.source, food.name) == (GTIN, "off", "Testriegel Haselnuss")
    # Stored now: the search finds the food, and the next entry adds no second one.
    assert [h["id"] for h in call(server, "search_food", query="testriegel")] == [food.id]
    assert call(server, "log_meal", gtin=GTIN, grams=80)["food"]["id"] == food.id


def test_log_meal_needs_exactly_one_valid_food(server: MCPServer, session: Session) -> None:
    food = add_food(session, "Banane")
    old = datetime.now(UTC) - timedelta(days=31)
    add_cached(session, "2000000021065", old)
    before = entry_count(session)
    assert call(server, "log_meal")["error"].endswith("give exactly one of food_id and gtin")
    both = call(server, "log_meal", food_id=food.id, gtin=CODE)
    assert both["error"].endswith("give exactly one of food_id and gtin")
    assert call(server, "log_meal", gtin=CODE)["error"].endswith(f"for GTIN {GTIN}")
    assert "for GTIN 02000000021065" in call(server, "log_meal", gtin="2000000021065")["error"]
    assert "check digit" in call(server, "log_meal", gtin="2000000021066")["error"]
    assert "error" in call(server, "log_meal", gtin="x")
    assert entry_count(session) == before


def add_coffee(client: TestClient, session: Session) -> dict:
    coffee = add_food(session, "Kaffee, Filter", basis="ml", kcal=2, protein=0.1, carbs=0.3, fat=0)
    sugar = add_food(session, "Zucker", kcal=400, protein=0, carbs=100, fat=0)
    body = {
        "name": "Kaffee süß",
        "items": [{"food_id": coffee.id, "grams": 200}, {"food_id": sugar.id, "grams": 5}],
    }
    response = client.post("/api/v1/combos", json=body)
    assert response.status_code == 201
    return response.json()


def test_list_combos_is_the_rest_list(
    server: MCPServer, session: Session, client: TestClient
) -> None:
    add_coffee(client, session)
    listed = call(server, "list_combos")
    assert listed == client.get("/api/v1/combos").json()
    assert listed[0]["totals"]["kcal"] == 24.0


def test_log_combo_by_id_or_by_name_logs_a_group(
    server: MCPServer, session: Session, client: TestClient
) -> None:
    combo = add_coffee(client, session)
    group = call(server, "log_combo", combo_id=combo["id"], meal="breakfast")
    assert (group["group_name"], group["meal"]) == ("Kaffee süß", "breakfast")
    assert group["day"] == day_of(datetime.now(UTC)).isoformat()
    assert [e["grams"] for e in group["entries"]] == [200, 5]
    assert group["totals"]["kcal"] == 24.0
    # The name matches like the search normalises it: case, umlauts and spaces.
    by_name = call(server, "log_combo", name="  KAFFEE SUESS ")
    assert by_name["group_name"] == "Kaffee süß"
    assert by_name["meal"] in {"breakfast", "lunch", "snack", "dinner"}  # the suggestion
    assert by_name["group_id"] != group["group_id"]
    assert entry_count(session) == 4


def test_log_combo_needs_exactly_one_known_combo(
    server: MCPServer, session: Session, client: TestClient
) -> None:
    combo = add_coffee(client, session)
    before = entry_count(session)
    assert call(server, "log_combo")["error"].endswith("give exactly one of combo_id and name")
    both = call(server, "log_combo", combo_id=combo["id"], name="Kaffee süß")
    assert both["error"].endswith("give exactly one of combo_id and name")
    assert call(server, "log_combo", combo_id=999999)["error"].endswith("combo 999999 not found")
    assert "no combo named" in call(server, "log_combo", name="Tee")["error"]
    assert "error" in call(server, "log_combo", combo_id=combo["id"], meal="brunch")
    client.post("/api/v1/combos", json={"name": "kaffee süß", "items": combo_items(combo)})
    assert "several combos" in call(server, "log_combo", name="Kaffee süß")["error"]
    assert entry_count(session) == before


def combo_items(combo: dict) -> list[dict]:
    return [{"food_id": i["food"]["id"], "grams": i["grams"]} for i in combo["items"]]
