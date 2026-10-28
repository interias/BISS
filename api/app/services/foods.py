"""Foods and their standard serving."""

from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Serving

# Without a standard serving a recent chip and an entry without grams use 100 g.
FALLBACK_GRAMS = 100.0


@dataclass(frozen=True)
class StandardServing:
    label: str
    grams: float
    # package, estimated or own; None for the derived 100 g, which is no stored serving.
    origin: str | None


FALLBACK_SERVING = StandardServing(label="100 g", grams=FALLBACK_GRAMS, origin=None)


def standard_servings(session: Session, food_ids: Iterable[int]) -> dict[int, StandardServing]:
    """The standard serving of each food, the derived 100 g where none is marked."""
    food_ids = list(food_ids)
    rows = session.scalars(select(Serving).where(Serving.food_id.in_(food_ids), Serving.is_default))
    found = {s.food_id: StandardServing(s.label, s.grams, s.origin) for s in rows}
    return {food_id: found.get(food_id, FALLBACK_SERVING) for food_id in food_ids}


def standard_serving(session: Session, food_id: int) -> StandardServing:
    return standard_servings(session, [food_id])[food_id]
