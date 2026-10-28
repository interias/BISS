"""Entries: the backend decides day, meal, standard amount and macro snapshot (ADR-0003)."""

from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.domain.day import day_of
from app.domain.macros import Macros, macro_snapshot
from app.domain.meal import Meal, suggest_meal
from app.models import Entry, Food
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


def recent_foods(session: Session, limit: int = 8) -> list[tuple[Food, StandardServing]]:
    """The foods logged most recently (by their latest eaten_at), each once."""
    latest = (
        select(
            Entry.food_id,
            func.max(Entry.eaten_at).label("last"),
            func.max(Entry.id).label("last_id"),
        )
        .group_by(Entry.food_id)
        .subquery()
    )
    foods = session.scalars(
        select(Food)
        .join(latest, latest.c.food_id == Food.id)
        .order_by(latest.c.last.desc(), latest.c.last_id.desc())
        .limit(limit)
    ).all()
    servings = standard_servings(session, [food.id for food in foods])
    return [(food, servings[food.id]) for food in foods]
