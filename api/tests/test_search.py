"""Search service: candidates, ranking and deduplication of generic foods (SPEC 6)."""

from dataclasses import replace
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.barcode import chain
from app.models import Entry
from app.search.search import search_foods
from app.search.usage import USAGE_BY_FOOD, usage_params
from app.search.weights import RANKING
from tests.factories import add_cached, add_food


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


NOW = datetime(2026, 10, 28, 12, tzinfo=UTC)


def log(session: Session, food_id: int, *days_ago: float) -> None:
    for days in days_ago:
        eaten_at = NOW - timedelta(days=days)
        session.add(
            Entry(
                food_id=food_id,
                grams=100,
                meal="lunch",
                eaten_at=eaten_at,
                day=eaten_at.date(),
                kcal=1,
                protein=0,
                carbs=0,
                fat=0,
            )
        )
    session.flush()


def ranked(session: Session, query: str) -> list[str]:
    return [hit.name for hit in search_foods(session, query, now=NOW)]


def test_usage_measure_halves_every_30_days(session: Session) -> None:
    today, month, two_months = (add_food(session, f"Skyr {n}", kcal=n) for n in (60, 80, 100))
    log(session, today.id, 0)
    log(session, month.id, 30)
    log(session, two_months.id, 60)
    usage = dict(
        session.execute(
            text(f"SELECT food_id, usage FROM ({USAGE_BY_FOOD}) u"), usage_params(NOW)
        ).all()
    )
    assert usage[today.id] == pytest.approx(1.0)
    assert usage[month.id] == pytest.approx(0.5)
    assert usage[two_months.id] == pytest.approx(0.25)


def test_often_eaten_food_ranks_first(session: Session) -> None:
    add_food(session, "Müsli Nuss", kcal=430)
    often = add_food(session, "Müsli Beere", kcal=370)
    log(session, often.id, 1, 2, 3, 5, 8)
    assert ranked(session, "müsli") == ["Müsli Beere", "Müsli Nuss"]


def test_recent_entries_outweigh_many_old_ones(session: Session) -> None:
    old = add_food(session, "Kefir mild", kcal=50)
    recent = add_food(session, "Kefir natur", kcal=62)
    log(session, old.id, *range(120, 180, 6))  # ten entries, four to six months ago
    log(session, recent.id, 2, 6, 10)
    assert ranked(session, "kefir") == ["Kefir natur", "Kefir mild"]


def test_usage_does_not_lift_a_poor_text_match(session: Session) -> None:
    add_food(session, "Broccoli roh", source="bls", kcal=35)
    other = add_food(session, "Brot Dinkel", kcal=240)
    log(session, other.id, *range(1, 30))
    assert ranked(session, "Brokkoli")[0] == "Broccoli roh"


def test_used_food_does_not_pass_a_better_name_match(session: Session) -> None:
    add_food(session, "Apfel roh", source="bls", kcal=58)
    other = add_food(session, "Apfelmus Zimt", kcal=70)
    log(session, other.id, *range(1, 30))
    assert ranked(session, "apfel")[0] == "Apfel roh"


def test_duplicate_priority_own_then_used_then_bls_then_off(session: Session) -> None:
    off = add_food(session, "Linsen roh", source="off", kcal=300)
    bls = add_food(session, "Linsen roh", source="bls", kcal=301)
    assert [hit.id for hit in search_foods(session, "linsen", now=NOW)] == [bls.id]
    log(session, off.id, 3)
    assert [hit.id for hit in search_foods(session, "linsen", now=NOW)] == [off.id]
    own = add_food(session, "Linsen, roh", source="own", kcal=299)
    assert [hit.id for hit in search_foods(session, "linsen", now=NOW)] == [own.id]


def test_known_brand_word_filters_on_the_brand(session: Session) -> None:
    add_food(session, "Hühnerfrikassee mit Reis", source="bls", kcal=120)
    iglo = add_food(session, "Hühnerfrikassee", brand="Iglo", source="off", kcal=118)
    bofrost = add_food(session, "Hühnerfrikassee", brand="Bofrost", source="off", kcal=140)
    for query in ["Hühnerfrikassee Bofrost", "bofrost Hühnerfrikassee", "BOFROST hühnerfrikassee"]:
        assert [hit.id for hit in search_foods(session, query)] == [bofrost.id], query
    assert [hit.id for hit in search_foods(session, "Iglo Hühnerfrikassee")] == [iglo.id]


def test_multi_word_brand_filters(session: Session) -> None:
    add_food(session, "Puddingpulver Vanille", source="bls", kcal=350)
    oetker = add_food(session, "Puddingpulver Vanille", brand="Dr. Oetker", source="off", kcal=360)
    assert [hit.id for hit in search_foods(session, "Dr Oetker Puddingpulver")] == [oetker.id]


def test_brand_without_a_hit_only_weighs(session: Session) -> None:
    add_food(session, "Banane roh", source="bls", kcal=79)
    add_food(session, "Hühnerfrikassee", brand="Bofrost", source="off", kcal=140)
    assert names(session, "Banane Bofrost")[0] == "Banane roh"


def test_brand_without_a_hit_adds_the_brand_bonus(session: Session) -> None:
    add_food(session, "Banane roh", source="bls", kcal=79)
    frikassee = add_food(session, "Hühnerfrikassee", brand="Bofrost", source="off", kcal=140)

    def score(config) -> float:
        hits = search_foods(session, "Banane Bofrost", config=config)
        return next(hit.score for hit in hits if hit.id == frikassee.id)

    assert RANKING.brand > 0
    assert score(RANKING) - score(replace(RANKING, brand=0.0)) == pytest.approx(RANKING.brand)


def test_brand_alone_still_finds_the_brand(session: Session) -> None:
    add_food(session, "Banane roh", source="bls", kcal=79)
    add_food(session, "Haferflocken zart", brand="Kölln", source="off", kcal=372)
    assert names(session, "kölln") == ["Haferflocken zart"]


def test_brand_match_ranks_before_an_equal_name_of_another_brand(session: Session) -> None:
    add_food(session, "Haferdrink", brand="Alpro", source="off", kcal=45)
    oatly = add_food(session, "Haferdrink Barista", brand="Oatly", source="off", kcal=60)
    assert search_foods(session, "Oatly Haferdrink")[0].id == oatly.id


# The Open Food Facts cache (SPEC 6): products shown after a scan, invented answers.
BAR = "2000000021003"


def test_cached_product_is_a_hit_as_its_draft(session: Session) -> None:
    add_cached(session, BAR, NOW - timedelta(days=2))
    (hit,) = search_foods(session, "testriegel", now=NOW)
    assert (hit.id, hit.gtin, hit.source) == (None, "0" + BAR, "off")
    assert (hit.name, hit.brand, hit.basis, hit.density) == (
        "Testriegel Haselnuss",
        "Testmarke",
        "g",
        1.0,
    )
    assert (hit.kcal, hit.protein, hit.carbs, hit.fat) == (452, 8.2, 54, 21.5)
    assert (hit.serving_label, hit.serving_grams, hit.serving_origin) == (
        "1 Riegel (40 g)",
        40,
        "package",
    )


def test_cache_window_is_the_one_of_the_barcode_chain(session: Session) -> None:
    ages = {"Testkeks Mohn": 29.9, "Testkeks Sesam": 30, "Testkeks Kakao": 31}
    for i, (name, days) in enumerate(ages.items()):
        add_cached(
            session,
            ["2000000021010", "2000000021027", "2000000021034"][i],
            NOW - timedelta(days=days),
            product_name_de=name,
        )
    found = {hit.name for hit in search_foods(session, "testkeks", now=NOW)}
    assert found == {"Testkeks Mohn"}
    cached = {
        gtin
        for gtin in ("02000000021010", "02000000021027", "02000000021034")
        if chain._cached(session, gtin, NOW) is not None
    }
    assert cached == {"02000000021010"}
    assert chain.CACHE_DAYS == 30


def test_cached_product_with_the_gtin_of_a_food_does_not_appear(session: Session) -> None:
    food = add_food(session, "Testriegel Nuss", brand="Testmarke", gtin="0" + BAR, source="off")
    add_cached(session, BAR, NOW - timedelta(days=1))  # the same GTIN, the older name
    hits = search_foods(session, "testriegel", now=NOW)
    assert [(hit.id, hit.gtin) for hit in hits] == [(food.id, "0" + BAR)]


def test_cached_product_ranks_after_own_and_bls_at_equal_text(session: Session) -> None:
    add_food(session, "Skyr", source="bls", kcal=64)
    add_food(session, "Skyr", source="own", kcal=90)
    add_cached(
        session,
        BAR,
        NOW - timedelta(days=1),
        product_name_de="Skyr",
        brands=None,
        nutriments={"energy-kcal_100g": 120, "fiber_100g": 0},
    )
    assert [hit.source for hit in search_foods(session, "skyr", now=NOW)] == ["own", "bls", "off"]


def test_generic_cached_product_merges_into_its_bls_duplicate(session: Session) -> None:
    bls = add_food(session, "Gurke roh", source="bls", kcal=16)
    add_cached(
        session,
        BAR,
        NOW - timedelta(days=1),
        product_name_de="Gurke roh",
        brands=None,
        nutriments={"energy-kcal_100g": 15},
    )
    assert [hit.id for hit in search_foods(session, "gurke", now=NOW)] == [bls.id]


def test_cached_values_are_read_like_the_draft(session: Session) -> None:
    add_cached(
        session,
        BAR,
        NOW - timedelta(days=1),
        product_name_de=" ",
        product_name="Test Bar Cocoa",
        brands=" , Zweitmarke",
        serving_size=None,
        nutriments={"energy-kj_100g": "1891", "proteins_100g": "8,2", "fat_100g": -1},
    )
    (hit,) = search_foods(session, "test bar", now=NOW)
    assert (hit.name, hit.brand) == ("Test Bar Cocoa", "Zweitmarke")
    assert (hit.kcal, hit.protein, hit.carbs, hit.fat) == (452.0, 8.2, 0.0, 0.0)
    assert hit.serving_label is None


def test_cached_product_without_name_or_energy_is_no_hit(session: Session) -> None:
    add_cached(session, BAR, NOW - timedelta(days=1), nutriments={"proteins_100g": 8})
    add_cached(
        session,
        "2000000021041",
        NOW - timedelta(days=1),
        product_name_de=None,
        product_name=None,
        brands="Testriegel",
    )
    assert search_foods(session, "testriegel", now=NOW) == []


def test_cached_brand_is_a_known_brand(session: Session) -> None:
    add_food(session, "Haselnuss", source="bls", kcal=650)
    add_cached(session, BAR, NOW - timedelta(days=1), brands="Zwergmarke")
    hits = search_foods(session, "Zwergmarke Haselnuss", now=NOW)
    assert [(hit.gtin, hit.brand) for hit in hits] == [("0" + BAR, "Zwergmarke")]
