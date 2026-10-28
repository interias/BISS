"""Search service: candidates, ranking and deduplication of generic foods (SPEC 6)."""

from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.models import Entry
from app.search.search import search_foods
from tests.factories import add_food


def names(session: Session, query: str) -> list[str]:
    return [hit.name for hit in search_foods(session, query)]


def sources(session: Session, query: str) -> list[str]:
    return [hit.source for hit in search_foods(session, query)]


def use(session: Session, food_id: int) -> None:
    session.add(
        Entry(
            food_id=food_id,
            grams=100,
            meal="lunch",
            eaten_at=datetime(2026, 10, 28, 12, tzinfo=UTC),
            day=date(2026, 10, 28),
            kcal=1,
            protein=0,
            carbs=0,
            fat=0,
        )
    )
    session.flush()


def test_umlaut_spellings_typos_and_plurals_find_the_food(session: Session) -> None:
    add_food(session, "Karotte/Möhre, roh", source="bls", kcal=40)
    add_food(session, "Mohn", source="bls", kcal=480)
    add_food(session, "Banane roh", source="bls", kcal=79)
    add_food(session, "Apfel-Bananen-Birnenmus roh", source="bls", kcal=70)
    for query in ["Möhre", "moehre", "mohre", "MÖHRE", "Karotte"]:
        assert names(session, query)[0] == "Karotte/Möhre, roh", query
    for query in ["banane", "Bananen", "Banahne"]:
        assert names(session, query)[0] == "Banane roh", query


def test_compound_written_apart_matches(session: Session) -> None:
    add_food(session, "Hafer Flocken", source="bls", kcal=348)
    add_food(session, "Haferflocken-Nussplätzchen", source="bls", kcal=517)
    assert names(session, "Haferflocken")[0] == "Hafer Flocken"


def test_own_food_wins_over_its_bls_duplicate(session: Session) -> None:
    add_food(session, "Banane roh", source="bls", kcal=79)
    add_food(session, "Banane, roh", source="own", kcal=85)
    hits = search_foods(session, "banane")
    assert [(hit.name, hit.source) for hit in hits] == [("Banane, roh", "own")]


def test_used_food_wins_over_an_unused_duplicate(session: Session) -> None:
    add_food(session, "Apfel roh", source="bls", kcal=58)
    used = add_food(session, "Apfel, roh", source="off", kcal=55)
    use(session, used.id)
    assert [hit.id for hit in search_foods(session, "apfel")] == [used.id]


def test_bls_wins_over_off_duplicate(session: Session) -> None:
    add_food(session, "Gurke roh", source="off", kcal=15)
    add_food(session, "Gurke roh", source="bls", kcal=16)
    assert sources(session, "gurke") == ["bls"]


def test_no_duplicate_beyond_10_percent_kcal_or_for_brands(session: Session) -> None:
    add_food(session, "Joghurt natur", source="bls", kcal=60)
    add_food(session, "Joghurt natur", source="own", kcal=67)  # more than 10 % apart
    add_food(session, "Joghurt natur", source="off", brand="Weihenstephan", kcal=61)
    assert sorted(sources(session, "joghurt")) == ["bls", "off", "own"]


def test_duplicate_at_exactly_10_percent_kcal(session: Session) -> None:
    add_food(session, "Gurke roh", source="bls", kcal=100)
    add_food(session, "Gurke roh", source="off", kcal=110)  # 10 % of the higher value
    assert sources(session, "gurke") == ["bls"]


def test_own_source_ranks_before_bls_at_equal_text(session: Session) -> None:
    add_food(session, "Skyr", source="bls", kcal=64)
    add_food(session, "Skyr", source="own", kcal=90)  # no duplicate: kcal apart
    assert sources(session, "skyr") == ["own", "bls"]


def test_brand_finds_a_candidate(session: Session) -> None:
    add_food(session, "Kernige Flocken", brand="Kölln", source="own", kcal=368)
    assert names(session, "kölln") == ["Kernige Flocken"]


def test_empty_query_finds_nothing(session: Session) -> None:
    add_food(session, "Banane roh", source="bls")
    assert search_foods(session, " - ") == []
