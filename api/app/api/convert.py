"""Mapping of ORM rows and service results onto the response models."""

from sqlalchemy.orm import Session

from app.api import schemas
from app.models import Entry, Food
from app.plates.match import Plate
from app.search.search import Hit
from app.services import foods
from app.services.combos import ComboView
from app.services.days import DaySummary, EntryRow
from app.services.entries import EntryGroup
from app.services.foods import FALLBACK_SERVING, StandardServing, standard_serving


def food_ref(food: Food) -> schemas.FoodRef:
    return schemas.FoodRef.model_validate(food)


def food_summary(
    food, serving: StandardServing, model=schemas.FoodSummary, **fields
) -> schemas.FoodSummary:
    """From a Food or a search hit, both carry the values per 100."""
    return model(
        id=food.id,
        name=food.name,
        brand=food.brand,
        source=food.source,
        basis=food.basis,
        density=food.density,
        per_100=schemas.Macros.model_validate(food),
        standard_serving=schemas.StandardServing.model_validate(serving),
        **fields,
    )


def search_hit(hit: Hit) -> schemas.SearchHit:
    """A search hit carries its standard serving; without one the derived 100 g applies."""
    return food_summary(
        hit,
        StandardServing(hit.serving_label, hit.serving_grams, hit.serving_origin)
        if hit.serving_label is not None
        else FALLBACK_SERVING,
        schemas.SearchHit,
        gtin=hit.gtin,
    )


def food_detail(session: Session, food: Food) -> schemas.FoodDetail:
    return schemas.FoodDetail(
        id=food.id,
        name=food.name,
        brand=food.brand,
        gtin=food.gtin,
        source=food.source,
        source_id=food.source_id,
        basis=food.basis,
        density=food.density,
        image_path=food.image_path,
        per_100=schemas.Nutrients.model_validate(food),
        servings=[schemas.Serving.model_validate(s) for s in foods.servings_of(session, food.id)],
        standard_serving=schemas.StandardServing.model_validate(standard_serving(session, food.id)),
    )


def day(summary: DaySummary) -> schemas.Day:
    return schemas.Day(
        date=summary.day,
        totals=schemas.Macros.model_validate(summary.totals),
        targets=schemas.Macros.model_validate(summary.targets),
        rows=[
            schemas.DayEntryRow(entry=entry(row.entry, row.food))
            if isinstance(row, EntryRow)
            else schemas.DayGroupRow(
                group_id=row.group_id,
                group_name=row.group_name,
                meal=row.meal,
                eaten_at=row.eaten_at,
                totals=schemas.Macros.model_validate(row.totals),
                entries=[entry(e, food) for e, food in row.entries],
            )
            for row in summary.rows
        ],
        meals=[
            schemas.MealEntries(
                meal=meal.meal,
                totals=schemas.Macros.model_validate(meal.totals),
                entries=[entry(e, food) for e, food in meal.entries],
                groups=[
                    schemas.DayGroup(
                        group_id=group.group_id,
                        group_name=group.group_name,
                        totals=schemas.Macros.model_validate(group.totals),
                        entry_ids=group.entry_ids,
                    )
                    for group in meal.groups
                ],
            )
            for meal in summary.meals
        ],
        suggested_meal=summary.suggested_meal,
    )


def entry(entry: Entry, food: Food) -> schemas.Entry:
    return schemas.Entry(
        id=entry.id,
        food=food_ref(food),
        grams=entry.grams,
        meal=entry.meal,
        eaten_at=entry.eaten_at,
        day=entry.day,
        macros=schemas.Macros.model_validate(entry),
        group_id=entry.group_id,
        group_name=entry.group_name,
    )


def entry_group(group: EntryGroup) -> schemas.EntryGroup:
    return schemas.EntryGroup(
        group_id=group.group_id,
        group_name=group.group_name,
        meal=group.meal,
        day=group.day,
        totals=schemas.Macros.model_validate(group.totals),
        entries=[entry(e, food) for e, food in group.entries],
    )


def combo(view: ComboView) -> schemas.Combo:
    return schemas.Combo(
        id=view.id,
        name=view.name,
        items=[
            schemas.ComboItem(
                food=food_summary(item.food, item.serving),
                grams=item.grams,
                density=item.food.density,
                macros=schemas.Macros.model_validate(item.macros),
            )
            for item in view.items
        ],
        totals=schemas.Macros.model_validate(view.totals),
    )


def plate(found: Plate, model: str, attempts: int) -> schemas.PlateExtraction:
    return schemas.PlateExtraction(
        dish=found.dish,
        items=[
            schemas.PlateItem(
                food_id=None if item.food is None else item.food.id,
                name=item.name,
                grams=item.grams,
                confidence=item.confidence,
                certainty=item.certainty,
                food=None if item.food is None else food_ref(item.food),
                basis=None if item.food is None else item.food.basis,
                density=None if item.food is None else item.food.density,
                per_100=None if item.food is None else schemas.Macros.model_validate(item.food),
                macros=None if item.macros is None else schemas.Macros.model_validate(item.macros),
            )
            for item in found.items
        ],
        totals=schemas.Macros.model_validate(found.totals),
        notes=found.notes,
        model=model,
        attempts=attempts,
    )
