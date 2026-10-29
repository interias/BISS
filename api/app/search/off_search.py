"""Open Food Facts text search after a local search with few hits (ADR-0011, SPEC 6).

The local search answers at once and says with `off_more` whether this search is worth
asking. Every product found is written to the cache, so it is logged by its GTIN like a
scanned one (POST /entries with gtin, chain.food_for_entry) and found locally next time.
"""

import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.barcode import chain
from app.barcode.gtin import InvalidGtin, normalize_gtin
from app.models import Food
from app.search.normalize import normalize
from app.search.search import Hit, draft_hit, search_foods
from app.services.foods import standard_serving
from app.sources import off
from app.sources.off import OpenFoodFacts

# Below this many local hits and from this query length Open Food Facts is asked too.
FEW_HITS = 5
MIN_QUERY = 3
MAX_HITS = 10
# The same normalised query within a day is answered from memory: no request counts
# against the limit for a query typed again.
QUERY_CACHE_HOURS = 24
QUERY_CACHE_SIZE = 256


def wants_off(query: str, hits: int, limit: int) -> bool:
    """True when the local search found fewer than five foods for a query of 3+ characters."""
    return len(normalize(query)) >= MIN_QUERY and hits < min(FEW_HITS, limit)


@dataclass
class QueryCache:
    """GTINs of the products Open Food Facts answered for a normalised query, per process.

    In memory, not in a table: there is one user and one API process (ADR-0005); after a
    restart a query costs one request again, and the products stay in off_cache anyway.
    """

    hours: float = QUERY_CACHE_HOURS
    size: int = QUERY_CACHE_SIZE
    _entries: dict[str, tuple[datetime, list[str]]] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def get(self, query: str, now: datetime) -> list[str] | None:
        with self._lock:
            entry = self._entries.get(query)
            if entry is None or entry[0] <= now - timedelta(hours=self.hours):
                return None
            return entry[1]

    def put(self, query: str, now: datetime, gtins: list[str]) -> None:
        with self._lock:
            self._entries.pop(query, None)
            while len(self._entries) >= self.size:
                self._entries.pop(next(iter(self._entries)))  # the oldest
            self._entries[query] = (now, gtins)


QUERIES = QueryCache()


@dataclass(frozen=True)
class OffSearch:
    hits: list[Hit]
    # short: query under three characters; limit, timeout, error: from the adapter.
    reason: str | None = None


def search_off(
    session: Session,
    query: str,
    source: OpenFoodFacts,
    now: datetime,
    cache: QueryCache | None = None,
) -> OffSearch:
    """Products of Open Food Facts for the query that the local search does not show.

    A product whose GTIN a food has is that food (SPEC 6: merged by GTIN); hits of the
    local search, foods and cached products alike, are left out. The order is the one of
    Open Food Facts. Without `cache` the one of the process (QUERIES) answers.
    """
    cache = QUERIES if cache is None else cache
    key = normalize(query)
    if len(key) < MIN_QUERY:
        return OffSearch([], "short")
    # What the client shows already, from the local search before new products are cached.
    local = search_foods(session, query, now=now)
    shown = {hit.gtin for hit in local if hit.gtin} | {f"id {hit.id}" for hit in local if hit.id}
    gtins = cache.get(key, now)
    if gtins is None:
        answer = source.search(query)
        if answer.reason is not None:
            return OffSearch([], answer.reason)
        gtins = []
        for payload in answer.products:
            try:
                gtin = normalize_gtin(payload["code"])
            except InvalidGtin:
                continue
            if gtin not in gtins and off.draft(gtin, payload) is not None:
                chain.cache_product(session, gtin, payload, now)
                gtins.append(gtin)
        session.commit()
        cache.put(key, now, gtins)

    hits = []
    for gtin in gtins:
        hit = _hit(session, gtin, now)
        if hit is not None and hit.gtin not in shown and f"id {hit.id}" not in shown:
            hits.append(hit)
    return OffSearch(hits[:MAX_HITS])


def _hit(session: Session, gtin: str, now: datetime) -> Hit | None:
    """The food with the GTIN, else the cached product as a draft (None once it expired)."""
    food = session.scalar(select(Food).where(Food.gtin == gtin))
    if food is not None:
        serving = standard_serving(session, food.id)
        return Hit(
            id=food.id,
            gtin=food.gtin,
            name=food.name,
            brand=food.brand,
            source=food.source,
            basis=food.basis,
            density=food.density,
            kcal=food.kcal,
            protein=food.protein,
            carbs=food.carbs,
            fat=food.fat,
            serving_label=serving.label if serving.origin else None,
            serving_grams=serving.grams if serving.origin else None,
            serving_origin=serving.origin,
            score=0.0,
            category=food.category,
        )
    cached = chain.cached_product(session, gtin, now)
    found = None if cached is None else off.draft(gtin, cached.payload)
    return None if found is None else draft_hit(found)
