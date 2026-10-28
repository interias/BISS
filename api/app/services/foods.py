"""Foods: their standard serving, creating and editing them with servings (ADR-0003)."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.barcode.gtin import normalize_gtin
from app.domain.servings import TooManyDefaults, default_index, origin_after_edit
from app.models import Food, Serving

# Without a standard serving a recent chip and an entry without grams use 100 g.
FALLBACK_GRAMS = 100.0

# Fields a client may set; at a bls or off food every change is kept in overridden.
EDITABLE = (
    "name",
    "brand",
    "basis",
    "density",
    "kcal",
    "protein",
    "carbs",
    "fat",
    "fiber",
    "sugar",
    "sat_fat",
    "salt",
)


class NotFound(LookupError):
    pass


class InvalidFood(ValueError):
    pass


class GtinTaken(ValueError):
    pass


@dataclass(frozen=True)
class StandardServing:
    label: str
    grams: float
    # package, estimated or own; None for the derived 100 g, which is no stored serving.
    origin: str | None


FALLBACK_SERVING = StandardServing(label="100 g", grams=FALLBACK_GRAMS, origin=None)


@dataclass(frozen=True)
class ServingInput:
    """A serving as the client sends it; without id it is new."""

    label: str
    grams: float
    is_default: bool = False
    id: int | None = None
    # Only when a food is created: the origin read from a label and the label and grams
    # it was read with; a serving that differs from them is own (origin_after_edit).
    origin: str = "own"
    as_read: tuple[str, float] | None = None


def standard_servings(session: Session, food_ids: Iterable[int]) -> dict[int, StandardServing]:
    """The standard serving of each food, the derived 100 g where none is marked."""
    food_ids = list(food_ids)
    rows = session.scalars(select(Serving).where(Serving.food_id.in_(food_ids), Serving.is_default))
    found = {s.food_id: StandardServing(s.label, s.grams, s.origin) for s in rows}
    return {food_id: found.get(food_id, FALLBACK_SERVING) for food_id in food_ids}


def standard_serving(session: Session, food_id: int) -> StandardServing:
    return standard_servings(session, [food_id])[food_id]


def get_food(session: Session, food_id: int) -> Food:
    food = session.get(Food, food_id)
    if food is None:
        raise NotFound(f"food {food_id} not found")
    return food


def servings_of(session: Session, food_id: int) -> Sequence[Serving]:
    return session.scalars(
        select(Serving).where(Serving.food_id == food_id).order_by(Serving.grams, Serving.id)
    ).all()


def create_food(
    session: Session, fields: dict[str, Any], servings: list[ServingInput], gtin: str | None = None
) -> Food:
    """Create an own food; its servings are own unless read from a label. A gtin is
    stored as GTIN-14.

    Raises InvalidGtin, GtinTaken when another food has the GTIN, and InvalidFood.

    Two concurrent creations with the same GTIN both pass the check, and the second one
    fails on the unique GTIN with a 500, as in chain.food_for_entry. Not caught: there is
    one user (ADR-0005) and the editor locks its button while saving.
    """
    code = None if gtin is None else normalize_gtin(gtin)
    if code is not None and session.scalar(select(Food.id).where(Food.gtin == code)) is not None:
        raise GtinTaken(f"GTIN {code} belongs to another food")
    food = Food(**_editable(fields), gtin=code, source="own")
    session.add(food)
    session.flush()
    _replace_servings(session, food, servings)
    session.commit()
    return food


def update_food(
    session: Session,
    food_id: int,
    fields: dict[str, Any],
    servings: list[ServingInput] | None = None,
) -> Food:
    """Change fields and, when given, the complete list of servings.

    At a bls or off food every changed field goes into overridden, so that an update
    from the source keeps it (SPEC 4, overlay).
    """
    food = get_food(session, food_id)
    changed = [name for name, value in _editable(fields).items() if getattr(food, name) != value]
    for name in changed:
        setattr(food, name, fields[name])
    if food.source != "own":
        known = set(food.overridden)
        food.overridden = [*food.overridden, *(name for name in changed if name not in known)]
    if servings is not None:
        _replace_servings(session, food, servings)
    session.commit()
    return food


def _editable(fields: dict[str, Any]) -> dict[str, Any]:
    unknown = set(fields) - set(EDITABLE)
    if unknown:
        raise InvalidFood(f"fields not editable: {', '.join(sorted(unknown))}")
    return fields


def _replace_servings(session: Session, food: Food, servings: list[ServingInput]) -> None:
    """Make the given list the food's servings: update by id, add new, drop the rest."""
    try:
        default = default_index([s.is_default for s in servings])
    except TooManyDefaults as error:
        raise InvalidFood(str(error)) from error
    existing = {s.id: s for s in servings_of(session, food.id)}
    ids = [s.id for s in servings if s.id is not None]
    if len(ids) != len(set(ids)):
        raise InvalidFood("a serving id appears twice")
    unknown = set(ids) - set(existing)
    if unknown:
        raise InvalidFood(f"servings not of food {food.id}: {sorted(unknown)}")

    # The standard flag moves only after every flag is cleared: one default per food.
    for serving in existing.values():
        serving.is_default = False
        if serving.id not in ids:
            session.delete(serving)
    session.flush()

    rows = []
    for given in servings:
        if given.id is None:
            origin = given.origin
            if given.as_read is not None:
                origin = origin_after_edit(origin, *given.as_read, given.label, given.grams)
            row = Serving(food_id=food.id, label=given.label, grams=given.grams, origin=origin)
            session.add(row)
        else:
            row = existing[given.id]
            row.origin = origin_after_edit(
                row.origin, row.label, row.grams, given.label, given.grams
            )
            row.label, row.grams = given.label, given.grams
        rows.append(row)
    session.flush()
    if default is not None:
        rows[default].is_default = True
        session.flush()
