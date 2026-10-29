"""Schnellzugriff (ADR-0010): saved templates of foods with grams, logged as an entry group.

Logging a combo writes one entry per item with a shared group, as a plate does; changing
the items for one entry never changes the template.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.domain.macros import Macros, total
from app.domain.meal import Meal
from app.models import Combo, ComboItem, Food
from app.search.normalize import normalize
from app.services import entries
from app.services.entries import EntryGroup, snapshot
from app.services.foods import StandardServing, standard_servings

# The grams of an item, as in the plate sheet (SPEC 3); the table checks them too.
MAX_GRAMS = 1500.0


class NotFound(LookupError):
    pass


class InvalidCombo(ValueError):
    pass


@dataclass(frozen=True)
class ComboItemView:
    food: Food
    serving: StandardServing
    grams: float
    macros: Macros


@dataclass(frozen=True)
class ComboView:
    """A combo with its items in order, each with the macros an entry would take now."""

    id: int
    name: str
    items: list[ComboItemView]
    totals: Macros


def _combo(session: Session, combo_id: int) -> Combo:
    combo = session.get(Combo, combo_id)
    if combo is None:
        raise NotFound(f"combo {combo_id} not found")
    return combo


def _check(session: Session, items: list[tuple[int, float]]) -> None:
    """Every item names a stored food and has grams above 0 and at most 1500."""
    if not items:
        raise InvalidCombo("a combo needs at least one item")
    for food_id, grams in items:
        if not 0 < grams <= MAX_GRAMS:
            raise InvalidCombo(f"grams must be above 0 and at most {MAX_GRAMS:g}")
        if session.get(Food, food_id) is None:
            raise NotFound(f"food {food_id} not found")


def _replace_items(session: Session, combo: Combo, items: list[tuple[int, float]]) -> None:
    session.execute(delete(ComboItem).where(ComboItem.combo_id == combo.id))
    for position, (food_id, grams) in enumerate(items):
        session.add(ComboItem(combo_id=combo.id, food_id=food_id, grams=grams, position=position))


def _views(session: Session, combos: list[Combo]) -> list[ComboView]:
    rows = session.execute(
        select(ComboItem, Food)
        .join(Food, Food.id == ComboItem.food_id)
        .where(ComboItem.combo_id.in_([combo.id for combo in combos]))
        .order_by(ComboItem.position, ComboItem.id)
    ).all()
    servings = standard_servings(session, {food.id for _, food in rows})
    views = []
    for combo in combos:
        items = [
            ComboItemView(food, servings[food.id], item.grams, snapshot(food, item.grams))
            for item, food in rows
            if item.combo_id == combo.id
        ]
        views.append(ComboView(combo.id, combo.name, items, total(i.macros for i in items)))
    return views


def list_combos(session: Session) -> list[ComboView]:
    """All combos by position, then by age; the dock shows them in this order."""
    combos = session.scalars(select(Combo).order_by(Combo.position, Combo.id)).all()
    return _views(session, list(combos)) if combos else []


def get_combo(session: Session, combo_id: int) -> ComboView:
    return _views(session, [_combo(session, combo_id)])[0]


def items_of(session: Session, combo_id: int) -> list[tuple[int, float]]:
    """The template's (food_id, grams) in order."""
    _combo(session, combo_id)
    rows = session.execute(
        select(ComboItem.food_id, ComboItem.grams)
        .where(ComboItem.combo_id == combo_id)
        .order_by(ComboItem.position, ComboItem.id)
    ).all()
    return [(food_id, grams) for food_id, grams in rows]


def create_combo(session: Session, name: str, items: list[tuple[int, float]]) -> ComboView:
    """A new combo at the end of the list."""
    _check(session, items)
    last = session.scalar(select(func.max(Combo.position)))
    combo = Combo(name=name, position=0 if last is None else last + 1)
    session.add(combo)
    session.flush()
    _replace_items(session, combo, items)
    session.commit()
    return get_combo(session, combo.id)


def create_from_group(session: Session, group_id: UUID, name: str | None = None) -> ComboView:
    """A combo with the foods and grams of an entry group; the name defaults to the group's."""
    try:
        group = entries.get_group(session, group_id)
    except entries.NotFound as error:
        raise NotFound(str(error)) from error
    items = [(entry.food_id, entry.grams) for entry, _ in group.entries]
    return create_combo(session, name or group.group_name, items)


def update_combo(
    session: Session,
    combo_id: int,
    name: str | None = None,
    items: list[tuple[int, float]] | None = None,
) -> ComboView:
    """Change the name or replace all items."""
    combo = _combo(session, combo_id)
    if items is not None:
        _check(session, items)
        _replace_items(session, combo, items)
        combo.updated_at = func.now()
    if name is not None:
        combo.name = name
    session.commit()
    return get_combo(session, combo_id)


def delete_combo(session: Session, combo_id: int) -> None:
    if session.execute(delete(Combo).where(Combo.id == combo_id)).rowcount == 0:
        raise NotFound(f"combo {combo_id} not found")
    session.commit()


def log_combo(
    session: Session,
    combo_id: int,
    meal: Meal | None = None,
    eaten_at: datetime | None = None,
    items: list[tuple[int, float]] | None = None,
) -> EntryGroup:
    """Log the combo as an entry group named like it; `items` replace the template's for
    this entry only. Without meal the suggestion applies."""
    combo = _combo(session, combo_id)
    if items is None:
        items = items_of(session, combo_id)
    else:
        _check(session, items)
    try:
        return entries.create_group(session, combo.name, items, meal=meal, eaten_at=eaten_at)
    except entries.NotFound as error:
        raise NotFound(str(error)) from error


def find_by_name(session: Session, name: str) -> Combo:
    """The combo whose name matches after normalisation (SPEC 6), e.g. "kaffee" for "Kaffee"."""
    wanted = normalize(name)
    found = [
        combo
        for combo in session.scalars(select(Combo).order_by(Combo.position, Combo.id))
        if normalize(combo.name) == wanted
    ]
    if not found:
        raise NotFound(f"no combo named {name!r}")
    if len(found) > 1:
        raise NotFound(f"several combos are named {name!r}; give combo_id")
    return found[0]
