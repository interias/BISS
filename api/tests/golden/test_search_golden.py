"""Golden search set against the real BLS seed plus fixtures (SPEC 8).

The fixtures of search.yaml are own and branded foods and entries dated relative to now,
for the brand filter, duplicate priority and usage ranking, and invented products in the
Open Food Facts cache. Its barcodes are scanned codes of the branded fixtures, with and
without leading zeros, for the barcode chain.

Fails if a threshold is missed: place 1 >= 90 %, top 5 >= 98 %, duplicates in the top 10
= 0, p95 of the search time < 300 ms.
"""

import statistics
import time
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import respx
import yaml
from sqlalchemy import Engine, select, text
from sqlalchemy.orm import Session

from app.barcode.chain import lookup
from app.barcode.gtin import normalize_gtin
from app.importers.bls import import_bls
from app.models import Entry, Food, OffCache
from app.search.normalize import normalize
from app.search.search import Hit, search_foods
from app.search.weights import DUPLICATE_KCAL_TOLERANCE, DUPLICATE_NAME_SIMILARITY
from app.sources.off import OpenFoodFacts
from tests.factories import off_answer

GOLDEN = yaml.safe_load((Path(__file__).parent / "search.yaml").read_text(encoding="utf-8"))
PAIRS = GOLDEN["pairs"]
BARCODES = GOLDEN["barcodes"]
RUNS = 5


def add_fixtures(session: Session) -> None:
    """Add the fixture foods (source_id "fixture:<key>"), their entries and the cache."""
    now = datetime.now(UTC)
    ids = {}
    for fixture in GOLDEN["foods"]:
        values = {"protein": 5, "carbs": 10, "fat": 5, "source": "own"}
        values |= {k: v for k, v in fixture.items() if k != "key"}
        values["source_id"] = f"fixture:{fixture['key']}"
        food = Food(**values)
        session.add(food)
        session.flush()
        ids[fixture["key"]] = food.id
    for use in GOLDEN["entries"]:
        for days_ago in use["days_ago"]:
            eaten_at = now - timedelta(days=days_ago)
            session.add(
                Entry(
                    food_id=ids[use["food"]],
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
    for cached in GOLDEN["cache"]:
        session.add(
            OffCache(
                gtin=normalize_gtin(cached["code"]),
                payload=off_answer(cached["code"], **cached["product"]),
                fetched_at=now - timedelta(days=cached["days_ago"]),
            )
        )
    session.flush()


CACHE_KEYS = {normalize_gtin(c["code"]): f"cache:{c['key']}" for c in GOLDEN["cache"]}


def code_of(codes: dict[int, str], hit: Hit) -> str:
    """The BLS code or fixture key of a food hit, the cache key of a cache hit."""
    return codes[hit.id] if hit.id is not None else CACHE_KEYS[hit.gtin]


@pytest.fixture(scope="module")
def bls_session(engine: Engine) -> Iterator[Session]:
    """The full BLS seed and the fixtures, rolled back after the module."""
    with engine.connect() as connection:
        transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint")
        assert import_bls(session) > 7000
        add_fixtures(session)
        yield session
        session.close()
        transaction.rollback()


def duplicates_in(session: Session, hits: list[Hit]) -> int:
    """Results that duplicate a better-ranked result: the same GTIN, or generic (name >= 0.9,
    kcal +/- 10 %). Foods and cache hits alike, by the name_norm of the hit's name."""
    return session.scalar(
        text(
            """
            WITH h AS (
                SELECT * FROM unnest(CAST(:names AS text[]), CAST(:generic AS boolean[]),
                                     CAST(:kcal AS float8[]), CAST(:gtins AS text[]))
                              WITH ORDINALITY h(name_norm, generic, kcal, gtin, n)
            )
            SELECT count(DISTINCT b.n) FROM h a JOIN h b ON a.n < b.n
            WHERE a.gtin = b.gtin
               OR (a.generic AND b.generic
                   AND similarity(a.name_norm, b.name_norm) >= :name_similarity
                   AND abs(a.kcal - b.kcal) <= :kcal_tolerance * greatest(a.kcal, b.kcal))
            """
        ),
        {
            "names": [normalize(hit.name) for hit in hits],
            "generic": [hit.brand is None for hit in hits],
            "kcal": [hit.kcal for hit in hits],
            "gtins": [hit.gtin for hit in hits],
            "name_similarity": DUPLICATE_NAME_SIMILARITY,
            "kcal_tolerance": DUPLICATE_KCAL_TOLERANCE,
        },
    )


def test_golden_search(bls_session: Session, capsys: pytest.CaptureFixture[str]) -> None:
    codes = dict(bls_session.execute(select(Food.id, Food.source_id)).all())
    search_foods(bls_session, "warm up")

    ranks, timings, duplicates, results = {}, [], 0, 0
    for pair in PAIRS:
        for _ in range(RUNS):
            start = time.perf_counter()
            hits = search_foods(bls_session, pair["query"], limit=10)
            timings.append((time.perf_counter() - start) * 1000)
        found = [code_of(codes, hit) for hit in hits]
        expected = pair["expected"]
        ranks[pair["query"]] = found.index(expected) + 1 if expected in found else None
        duplicates += duplicates_in(bls_session, hits)
        results += len(hits)

    total = len(PAIRS)
    place_1 = sum(rank == 1 for rank in ranks.values()) / total
    top_5 = sum(rank is not None and rank <= 5 for rank in ranks.values()) / total
    duplicate_rate = duplicates / results
    p95 = statistics.quantiles(timings, n=20)[18]
    report = (
        f"golden search: {total} pairs, place 1 {place_1:.0%}, top 5 {top_5:.0%}, "
        f"duplicates in top 10 {duplicate_rate:.0%}, p95 {p95:.0f} ms\n"
        + "\n".join(f"  {query!r}: place {rank}" for query, rank in ranks.items() if rank != 1)
    )
    with capsys.disabled():
        print("\n" + report)

    assert place_1 >= 0.90, report
    assert top_5 >= 0.98, report
    assert duplicate_rate == 0, report
    assert p95 < 300, report


def test_banane_is_a_single_hit_on_place_1(bls_session: Session) -> None:
    hits = search_foods(bls_session, "banane", limit=10)
    names = [hit.name for hit in hits]
    assert names[0] == "Banane roh"
    assert names.count("Banane roh") == 1
    assert duplicates_in(bls_session, hits) == 0


@pytest.mark.parametrize("case", BARCODES, ids=[f"{c['kind']} {c['code']}" for c in BARCODES])
def test_golden_barcode(bls_session: Session, case: dict) -> None:
    """Every form of a code finds the own food; Open Food Facts is never asked."""
    with respx.mock():  # a request would fail: no route is mocked
        found = lookup(
            bls_session, case["code"], OpenFoodFacts("https://off.test"), datetime.now(UTC)
        )
    assert found.source_id == case["expected"]
