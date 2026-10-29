"""Barcode chain (SPEC 6): own DB, then the OFF cache, then Open Food Facts live.

A product from Open Food Facts stays a draft until its first entry; only then it becomes
a food with source off, its raw data and its package serving (SPEC 4).
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.barcode.gtin import normalize_gtin
from app.models import Food, FoodSourceData, OffCache, Serving
from app.sources import off
from app.sources.off import FoodDraft, OpenFoodFacts

CACHE_DAYS = 30


class NotFound(LookupError):
    """No food and no product for the GTIN; the client offers the label photo."""

    def __init__(self, gtin: str) -> None:
        super().__init__(f"no food or product for GTIN {gtin}")
        self.gtin = gtin


def lookup(session: Session, code: str, source: OpenFoodFacts, now: datetime) -> Food | FoodDraft:
    """The own food with the GTIN of the code, else the product from the cache or live.

    A live hit is cached; a miss, a timeout or a failure is not. Raises InvalidGtin and
    NotFound.
    """
    gtin = normalize_gtin(code)
    food = _own(session, gtin)
    if food is not None:
        return food
    cached = _cached(session, gtin, now)
    if cached is not None and (found := off.draft(gtin, cached.payload)) is not None:
        return found
    payload = source.product(gtin)
    if payload is None or (found := off.draft(gtin, payload)) is None:
        raise NotFound(gtin)
    statement = insert(OffCache).values(gtin=gtin, payload=payload, fetched_at=now)
    session.execute(
        statement.on_conflict_do_update(
            index_elements=["gtin"],
            set_={"payload": statement.excluded.payload, "fetched_at": now},
        )
    )
    session.commit()
    return found


def food_for_entry(session: Session, code: str, now: datetime) -> Food:
    """The food to log for a scanned code; a cached product is stored as food on first use.

    Not committed, the entry commits it. Raises InvalidGtin and NotFound.

    Two concurrent first entries of the same GTIN both insert the food, and the second one
    fails on the unique GTIN with a 500. Not caught: there is one user (ADR-0005) and the
    amount sheet locks its button while saving.
    """
    gtin = normalize_gtin(code)
    food = _own(session, gtin)
    if food is not None:
        return food
    cached = _cached(session, gtin, now)
    found = None if cached is None else off.draft(gtin, cached.payload)
    if found is None:
        raise NotFound(gtin)
    food = Food(
        name=found.name,
        brand=found.brand,
        gtin=gtin,
        basis=found.basis,
        source=off.SOURCE,
        source_id=found.source_id,
        category=found.category,
        fetched_at=cached.fetched_at,
        **found.values,
    )
    session.add(food)
    session.flush()
    session.add(
        FoodSourceData(
            food_id=food.id,
            source=off.SOURCE,
            source_id=found.source_id,
            payload=cached.payload,
            fetched_at=cached.fetched_at,
        )
    )
    if found.serving is not None:
        session.add(
            Serving(
                food_id=food.id,
                label=found.serving.label,
                grams=found.serving.grams,
                origin="package",
                is_default=True,
            )
        )
    session.flush()
    return food


def _own(session: Session, gtin: str) -> Food | None:
    return session.scalar(select(Food).where(Food.gtin == gtin))


def _cached(session: Session, gtin: str, now: datetime) -> OffCache | None:
    """The cache row of the GTIN while it is younger than 30 days."""
    return session.scalar(
        select(OffCache).where(
            OffCache.gtin == gtin, OffCache.fetched_at > now - timedelta(days=CACHE_DAYS)
        )
    )
