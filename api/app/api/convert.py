"""Mapping of ORM rows and service results onto the response models."""

from sqlalchemy.orm import Session

from app.api import schemas
from app.models import Entry, Food
from app.search.search import Hit
from app.services import foods
from app.services.days import DaySummary
from app.services.foods import FALLBACK_SERVING, StandardServing, standard_serving


def food_ref(food: Food) -> schemas.FoodRef:
    return schemas.FoodRef.model_validate(food)


def food_summary(food, serving: StandardServing) -> schemas.FoodSummary:
    """From a Food or a search hit, both carry the values per 100."""
    return schemas.FoodSummary(
        id=food.id,
        name=food.name,
        brand=food.brand,
        source=food.source,
        basis=food.basis,
        per_100=schemas.Macros.model_validate(food),
        standard_serving=schemas.StandardServing.model_validate(serving),
    )


def search_hit(hit: Hit) -> schemas.FoodSummary:
    """A search hit carries its standard serving; without one the derived 100 g applies."""
    return food_summary(
        hit,
        StandardServing(hit.serving_label, hit.serving_grams, hit.serving_origin)
        if hit.serving_label is not None
        else FALLBACK_SERVING,
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
        meals=[
            schemas.MealEntries(
                meal=meal.meal,
                totals=schemas.Macros.model_validate(meal.totals),
                entries=[entry(e, food) for e, food in meal.entries],
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
    )
