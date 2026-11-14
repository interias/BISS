"""The Wirt: guesses of the empty search and the foods last used (SPEC 6)."""

from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.deps import get_now
from app.domain.day import TIMEZONE
from app.main import app
from app.search.suggest import Event, rank
from app.search.suggest_backtest import backtest
from tests.factories import add_food, add_serving

COFFEE, MILK, BEER, YOGHURT, BANANA, BREAD = range(1, 7)


def at(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 10, day, hour, minute, tzinfo=TIMEZONE)


def daily(food_id: int, hour: int, minute: int = 0, days: int = 10, single=True) -> list[Event]:
    return [Event(food_id, at(day, hour, minute), single) for day in range(1, days + 1)]


def test_a_young_diary_goes_by_how_often_and_how_lately() -> None:
    events = [
        *daily(YOGHURT, 12, days=3),
        Event(BANANA, at(3, 18)),
        Event(BREAD, at(1, 18)),
    ]
    assert rank(events, at(4, 15)) == [YOGHURT, BANANA, BREAD]


def test_the_time_of_day_decides_between_habits() -> None:
    events = [*daily(COFFEE, 8, days=14), *daily(BEER, 20, days=14)]
    assert rank(events, at(15, 8, 5)) == [COFFEE, BEER]
    assert rank(events, at(15, 20, 5)) == [BEER, COFFEE]
    # Around midnight the clock wraps: 23:30 is near 00:30.
    late = [*daily(BEER, 23, 30), *daily(COFFEE, 12, 30)]
    assert rank(late, at(11, 0, 30))[0] == BEER


def test_what_usually_follows_the_food_logged_just_now_comes_first() -> None:
    events = [*daily(YOGHURT, 8), *daily(COFFEE, 15), *daily(MILK, 15, 2)]
    assert rank(events, at(11, 8))[0] == YOGHURT
    events.append(Event(COFFEE, at(11, 8)))
    # Coffee itself was just logged and comes once a day: it drops to the end.
    assert rank(events, at(11, 8, 1)) == [MILK, YOGHURT, COFFEE]


def test_a_food_logged_today_drops_unless_it_comes_several_times_a_day() -> None:
    events = [
        *daily(BANANA, 8),
        *daily(BREAD, 12),
        *daily(COFFEE, 8),
        *daily(COFFEE, 11),
        *daily(COFFEE, 15),
        Event(BANANA, at(11, 8)),
        Event(COFFEE, at(11, 8)),
    ]
    assert rank(events, at(11, 8, 10)) == [COFFEE, BREAD, BANANA]


def test_the_foods_of_a_gericht_are_not_guessed_but_count_as_logged_just_now() -> None:
    events = [*daily(YOGHURT, 8), *daily(COFFEE, 15, single=False), *daily(MILK, 15, 2)]
    events.append(Event(COFFEE, at(11, 8), single=False))
    assert rank(events, at(11, 8, 1)) == [MILK, YOGHURT]


def test_entries_after_now_are_not_known_yet() -> None:
    assert rank([Event(BANANA, at(2, 8)), Event(BREAD, at(5, 8))], at(3, 8)) == [BANANA]
    assert rank([], at(3, 8)) == []


def test_backtest_replays_the_diary_and_leaves_out_first_entries() -> None:
    events = [*daily(COFFEE, 8, days=14), *daily(BEER, 20, days=14)]
    results = backtest(events)
    # 28 entries, the first of each food cannot be guessed.
    assert {result.entries for result in results.values()} == {26}
    # "Last used" always names the other food first; the Wirt knows the hour.
    assert results["last used"].first == 0
    assert results["last used"].tips == 1
    assert results["Wirt"].first == 1
    assert results["Wirt"].mean_reciprocal_rank == 1


def test_backtest_of_an_empty_diary() -> None:
    assert backtest([])["Wirt"].entries == 0


SUGGESTIONS = "/api/v1/foods/suggestions"


def log(client: TestClient, food_id: int, eaten_at: datetime) -> None:
    body = {"food_id": food_id, "grams": 50, "eaten_at": eaten_at.isoformat()}
    assert client.post("/api/v1/entries", json=body).status_code == 201


def names(items: list[dict]) -> list[str]:
    return [(item["food"] or item["combo"])["name"] for item in items]


def test_suggestions_are_empty_without_entries(client: TestClient) -> None:
    assert client.get(SUGGESTIONS).json() == {"likely": [], "recent": []}


def test_suggestions_guess_for_this_moment_and_list_the_foods_last_used(
    client: TestClient, session: Session
) -> None:
    coffee, beer, rice = (add_food(session, name) for name in ["Kaffee", "Bier", "Reis"])
    add_serving(session, coffee, "1 Tasse", 200)
    for day in range(1, 15):
        log(client, coffee.id, at(day, 8))
        log(client, beer.id, at(day, 20))
    group = {
        "group_name": "Reispfanne",
        "items": [{"food_id": rice.id, "grams": 150}],
        "eaten_at": at(14, 21).isoformat(),
    }
    assert client.post("/api/v1/entries/group", json=group).status_code == 201

    app.dependency_overrides[get_now] = lambda: at(15, 8, 5)
    body = client.get(SUGGESTIONS).json()

    # Rice was only part of a Gericht: last used, but no guess.
    assert names(body["likely"]) == ["Kaffee", "Bier"]
    assert names(body["recent"]) == ["Reis", "Bier", "Kaffee"]
    assert body["likely"][0]["combo"] is None
    assert body["likely"][0]["food"] == {
        "id": coffee.id,
        "name": "Kaffee",
        "brand": None,
        "source": "own",
        "basis": "g",
        "density": 1.0,
        "category": None,
        "per_100": {"kcal": 100, "protein": 10, "carbs": 10, "fat": 1},
        "standard_serving": {"label": "1 Tasse", "grams": 200, "origin": "estimated"},
        "gtin": None,
        "recipe": False,
    }

    app.dependency_overrides[get_now] = lambda: at(15, 20, 5)
    assert names(client.get(SUGGESTIONS).json()["likely"]) == ["Bier", "Kaffee"]


def test_suggestions_show_at_most_6_guesses(client: TestClient, session: Session) -> None:
    for n in range(8):
        log(client, add_food(session, f"Lebensmittel {n}").id, at(1, 8 + n))
    app.dependency_overrides[get_now] = lambda: at(2, 8)
    body = client.get(SUGGESTIONS).json()
    assert len(body["likely"]) == 6
    assert names(body["recent"]) == [f"Lebensmittel {n}" for n in range(7, -1, -1)]


def test_a_schnellzugriff_is_guessed_and_listed_like_a_food(
    client: TestClient, session: Session
) -> None:
    coffee, milk, beer = (add_food(session, name) for name in ["Kaffee", "Milch", "Bier"])
    items = [{"food_id": coffee.id, "grams": 200}, {"food_id": milk.id, "grams": 30}]
    combo = client.post("/api/v1/combos", json={"name": "Cappuccino", "items": items}).json()
    for day in range(1, 11):
        logged = client.post(
            f"/api/v1/combos/{combo['id']}/log", json={"eaten_at": at(day, 8).isoformat()}
        )
        assert logged.status_code == 201
        log(client, beer.id, at(day, 20))

    app.dependency_overrides[get_now] = lambda: at(11, 8, 5)
    body = client.get(SUGGESTIONS).json()

    # The Schnellzugriff of the mornings first; its foods are no guesses of their own.
    assert names(body["likely"]) == ["Cappuccino", "Bier"]
    assert body["likely"][0]["food"] is None
    assert body["likely"][0]["combo"]["id"] == combo["id"]
    assert [item["food"]["name"] for item in body["likely"][0]["combo"]["items"]] == [
        "Kaffee",
        "Milch",
    ]
    # Last used: the beer of the evening, then the Schnellzugriff before its foods.
    assert names(body["recent"]) == ["Bier", "Cappuccino", "Milch", "Kaffee"]

    # A deleted Schnellzugriff is no longer offered; its foods stay in the list.
    assert client.delete(f"/api/v1/combos/{combo['id']}").status_code == 204
    body = client.get(SUGGESTIONS).json()
    assert names(body["likely"]) == ["Bier"]
    assert names(body["recent"]) == ["Bier", "Milch", "Kaffee"]


def test_a_recipe_is_listed_from_the_moment_it_is_saved(
    client: TestClient, session: Session
) -> None:
    flour, beer = add_food(session, "Mehl"), add_food(session, "Bier")
    log(client, beer.id, at(1, 20))
    body = {"name": "Brötchen", "items": [{"food_id": flour.id, "grams": 200}], "portions": 4}
    recipe = client.post("/api/v1/recipes", json=body).json()

    listed = client.get(SUGGESTIONS).json()
    # Saved just now and never logged: on top of the last used. It is no guess yet.
    assert names(listed["recent"]) == ["Brötchen", "Bier"]
    assert names(listed["likely"]) == ["Bier"]
    # The search and the list mark it as a recipe.
    assert [item["food"]["recipe"] for item in listed["recent"]] == [True, False]
    hits = client.get("/api/v1/foods/search", params={"q": "Brötchen"}).json()["hits"]
    assert (hits[0]["name"], hits[0]["recipe"]) == ("Brötchen", True)

    # Logged, it stands once, not twice.
    assert client.post("/api/v1/entries", json={"food_id": recipe["food_id"]}).status_code == 201
    assert names(client.get(SUGGESTIONS).json()["recent"]) == ["Brötchen", "Bier"]
