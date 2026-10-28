"""Small helpers that add foods and servings to the test session."""

from sqlalchemy.orm import Session

from app.models import Food, Serving


def add_food(session: Session, name: str, **values) -> Food:
    fields = {"kcal": 100.0, "protein": 10.0, "carbs": 10.0, "fat": 1.0, "source": "own"}
    food = Food(name=name, **(fields | values))
    session.add(food)
    session.flush()
    return food


def add_serving(
    session: Session, food: Food, label: str, grams: float, origin="estimated", default=True
) -> Serving:
    serving = Serving(food_id=food.id, label=label, grams=grams, origin=origin, is_default=default)
    session.add(serving)
    session.flush()
    return serving
