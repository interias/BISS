"""Mapping of ORM rows and service results onto the response models."""

from sqlalchemy.orm import Session

from app.api import schemas
from app.domain.stats import Stats
from app.models import Entry, Food
from app.plates.match import Plate
from app.search.search import Hit
from app.services import foods, recipes
from app.services.combos import ComboView
from app.services.days import DaySummary, DayTotals, EntryRow
from app.services.entries import EntryGroup
from app.services.foods import FALLBACK_SERVING, StandardServing, standard_serving


def food_ref(food: Food) -> schemas.FoodRef:
    return schemas.FoodRef.model_validate(food)


def food_summary(
    food, serving: StandardServing, model=schemas.FoodSummary, **fields
) -> schemas.FoodSummary:
    """From a Food or a search hit, both carry the values per 100."""
    fields.setdefault("recipe", bool(getattr(food, "recipe", False)))
    # A food and a search hit both carry the GTIN of a product.
    fields["scanned"] = getattr(food, "gtin", None) is not None
    fields.setdefault("image_path", getattr(food, "image_path", None))
    return model(
        id=food.id,
        name=food.name,
        brand=food.brand,
        source=food.source,
        basis=food.basis,
        density=food.density,
        category=food.category,
        per_100=schemas.Macros.model_validate(food),
        standard_serving=schemas.StandardServing.model_validate(serving),
        **fields,
    )


def search_hit(hit: Hit, recipe_ids: frozenset[int] | set[int] = frozenset()) -> schemas.SearchHit:
    """A search hit carries its standard serving; without one the derived 100 g applies.
    `recipe_ids` are the foods of recipes (recipes.recipe_food_ids), which the hit marks."""
    return food_summary(
        hit,
        StandardServing(hit.serving_label, hit.serving_grams, hit.serving_origin)
        if hit.serving_label is not None
        else FALLBACK_SERVING,
        schemas.SearchHit,
        gtin=hit.gtin,
        recipe=hit.id in recipe_ids,
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
        category=food.category,
        per_100=schemas.Nutrients.model_validate(food),
        servings=[schemas.Serving.model_validate(s) for s in foods.servings_of(session, food.id)],
        standard_serving=schemas.StandardServing.model_validate(standard_serving(session, food.id)),
        last_grams=foods.last_grams(session, food.id),
        recipe_id=recipes.recipe_id_of(session, food.id),
    )


def recipe(view: recipes.RecipeView) -> schemas.Recipe:
    return schemas.Recipe(
        id=view.id,
        food_id=view.food.id,
        name=view.food.name,
        description=view.description,
        image_path=view.food.image_path,
        portions=view.portions,
        cooked_grams=view.cooked_grams,
        raw_grams=view.raw_grams,
        portion_grams=view.portion_grams,
        items=[
            schemas.ComboItem(
                food=food_summary(item.food, item.serving),
                grams=item.grams,
                density=item.food.density,
                macros=schemas.Macros.model_validate(item.macros),
            )
            for item in view.items
        ],
        per_100=schemas.Nutrients.model_validate(view.food),
        per_portion=schemas.Macros.model_validate(view.per_portion),
        totals=schemas.Macros.model_validate(view.totals),
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


def day_totals(totals: DayTotals) -> schemas.DayTotals:
    return schemas.DayTotals(
        date=totals.day,
        totals=schemas.Macros.model_validate(totals.totals),
        targets=schemas.Macros.model_validate(totals.targets),
        entries=totals.entries,
    )


def stats(found: Stats) -> schemas.Stats:
    def macros(values):
        return None if values is None else schemas.Macros.model_validate(values)

    return schemas.Stats(
        from_=found.start,
        to=found.end,
        today=found.today,
        days_possible=found.days_possible,
        days_logged=found.days_logged,
        average=macros(found.average),
        target_average=macros(found.target_average),
        targets_vary=found.targets_vary,
        tolerance=found.tolerance,
        in_range=schemas.InRange(**found.in_range),
        previous=schemas.PreviousPeriod(
            from_=found.previous.start,
            to=found.previous.end,
            average_kcal=found.previous.average_kcal,
        ),
        trailing_kcal=[
            schemas.TrailingKcal(date=day, kcal=kcal) for day, kcal in found.trailing_kcal
        ],
        weekdays=found.weekdays,
        times_of_day=schemas.TimesOfDay(**found.times_of_day),
        top=[schemas.TopItem(**vars(item)) for item in found.top],
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
        last_used=view.last_used,
    )


def plate(found: Plate, model: str, attempts: int) -> schemas.PlateExtraction:
    return schemas.PlateExtraction(
        dish=found.dish,
        items=plate_items(found),
        totals=schemas.Macros.model_validate(found.totals),
        notes=found.notes,
        model=model,
        attempts=attempts,
    )


def plate_items(found: Plate) -> list[schemas.PlateItem]:
    return [
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
    ]
