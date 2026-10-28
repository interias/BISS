"""Entries: the backend decides day, meal, standard amount and macro snapshot (ADR-0003)."""

from datetime import UTC, date, datetime

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.domain.day import day_of
from app.domain.macros import Macros, macro_snapshot
from app.domain.meal import Meal, suggest_meal
from app.models import Entry, Food
from app.search.usage import USAGE_BY_FOOD, usage_params
from app.services.foods import StandardServing, standard_serving, standard_servings


class NotFound(LookupError):
    pass


def snapshot(food: Food, grams: float) -> Macros:
    """Macros for an amount in grams; foods with basis ml state values per 100 ml."""
    amount = grams / food.density if food.basis == "ml" else grams
    return macro_snapshot(food, amount)


def _apply(entry: Entry, macros: Macros) -> None:
    entry.kcal, entry.protein, entry.carbs, entry.fat = (
        macros.kcal,
        macros.protein,
        macros.carbs,
        macros.fat,
    )


def _food(session: Session, food_id: int) -> Food:
    food = session.get(Food, food_id)
    if food is None:
        raise NotFound(f"food {food_id} not found")
    return food


def get_entry(session: Session, entry_id: int) -> Entry:
    entry = session.get(Entry, entry_id)
    if entry is None:
        raise NotFound(f"entry {entry_id} not found")
    return entry


def create_entry(
    session: Session,
    food_id: int,
    grams: float | None = None,
    meal: Meal | None = None,
    eaten_at: datetime | None = None,
) -> Entry:
    """Log a food. Without grams the standard serving applies, without meal the suggestion."""
    food = _food(session, food_id)
    eaten_at = eaten_at or datetime.now(UTC)
    if grams is None:
        grams = standard_serving(session, food_id).grams
    entry = Entry(
        food_id=food_id,
        grams=grams,
        meal=meal or suggest_meal(eaten_at),
        eaten_at=eaten_at,
        day=day_of(eaten_at),
    )
    _apply(entry, snapshot(food, grams))
    session.add(entry)
    session.commit()
    return entry


def update_entry(
    session: Session, entry_id: int, grams: float | None = None, meal: Meal | None = None
) -> Entry:
    """Change amount or meal. Only a new amount takes a new snapshot of the food's values."""
    entry = get_entry(session, entry_id)
    if grams is not None:
        entry.grams = grams
        _apply(entry, snapshot(_food(session, entry.food_id), grams))
    if meal is not None:
        entry.meal = meal
    session.commit()
    return entry


def delete_entry(session: Session, entry_id: int) -> None:
    if session.execute(delete(Entry).where(Entry.id == entry_id)).rowcount == 0:
        raise NotFound(f"entry {entry_id} not found")
    session.commit()


def entries_between(session: Session, first: date, last: date) -> list[tuple[Entry, Food]]:
    """Entries of the days first to last, both included, by time (day after SPEC 4)."""
    rows = session.execute(
        select(Entry, Food)
        .join(Food, Food.id == Entry.food_id)
        .where(Entry.day.between(first, last))
        .order_by(Entry.eaten_at, Entry.id)
    ).all()
    return [(entry, food) for entry, food in rows]


def recent_foods(
    session: Session, limit: int = 8, now: datetime | None = None
) -> list[tuple[Food, StandardServing]]:
    """The foods eaten most, each once: the usage measure of the search (count and recency).

    Ties go to the latest entry.
    """
    ids = session.scalars(
        text(
            f"""
            SELECT u.food_id FROM ({USAGE_BY_FOOD}) u
            ORDER BY u.usage DESC, u.last_eaten DESC, u.last_id DESC
            LIMIT :limit
            """
        ),
        usage_params(now) | {"limit": limit},
    ).all()
    by_id = {food.id: food for food in session.scalars(select(Food).where(Food.id.in_(ids)))}
    servings = standard_servings(session, ids)
    return [(by_id[food_id], servings[food_id]) for food_id in ids]
