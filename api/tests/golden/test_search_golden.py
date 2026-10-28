"""Golden search set against the real BLS seed plus fixtures (SPEC 8).

The fixtures of search.yaml are own and branded foods and entries dated relative to now,
for the brand filter, duplicate priority and usage ranking.

Fails if a threshold is missed: place 1 >= 90 %, top 5 >= 98 %, duplicates in the top 10
= 0, p95 of the search time < 300 ms.
"""

import statistics
import time
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import yaml
from sqlalchemy import Engine, select, text
from sqlalchemy.orm import Session

from app.importers.bls import import_bls
from app.models import Entry, Food
from app.search.search import search_foods
from app.search.weights import DUPLICATE_KCAL_TOLERANCE, DUPLICATE_NAME_SIMILARITY

GOLDEN = yaml.safe_load((Path(__file__).parent / "search.yaml").read_text(encoding="utf-8"))
PAIRS = GOLDEN["pairs"]
RUNS = 5


def add_fixtures(session: Session) -> None:
    """Add the fixture foods (source_id "fixture:<key>") and their entries."""
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
    session.flush()


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


def duplicates_in(session: Session, ids: list[int]) -> int:
    """Results that duplicate a better-ranked result (generic, name >= 0.9, kcal +/- 10 %)."""
    return session.scalar(
        text(
            """
            SELECT count(DISTINCT b.n) FROM unnest(CAST(:ids AS bigint[])) WITH ORDINALITY a(id, n)
            JOIN unnest(CAST(:ids AS bigint[])) WITH ORDINALITY b(id, n) ON a.n < b.n
            JOIN food fa ON fa.id = a.id JOIN food fb ON fb.id = b.id
            WHERE fa.brand IS NULL AND fb.brand IS NULL
              AND similarity(fa.name_norm, fb.name_norm) >= :name_similarity
              AND abs(fa.kcal - fb.kcal) <= :kcal_tolerance * greatest(fa.kcal, fb.kcal)
            """
        ),
        {
            "ids": ids,
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
        found = [codes[hit.id] for hit in hits]
        expected = pair["expected"]
        ranks[pair["query"]] = found.index(expected) + 1 if expected in found else None
        duplicates += duplicates_in(bls_session, [hit.id for hit in hits])
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
    assert duplicates_in(bls_session, [hit.id for hit in hits]) == 0
