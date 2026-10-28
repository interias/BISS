"""Mapping of ORM rows and service results onto the response models."""

from app.api import schemas
from app.models import Entry, Food
from app.services.foods import StandardServing


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
