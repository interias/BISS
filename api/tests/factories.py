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


def off_answer(code: str = "2000000000015", **product) -> dict:
    """An invented Open Food Facts API v2 answer for a found product, no real OFF data.

    Keyword arguments replace fields of the product; None drops one.
    """
    fields = {
        "product_name": "Test Bar Hazelnut",
        "product_name_de": "Testriegel Haselnuss",
        "brands": "Testmarke, Testmarke Bio",
        "quantity": "4 x 40 g",
        "product_quantity": 160,
        "product_quantity_unit": "g",
        "image_front_url": "https://images.off.test/front.jpg",
        "nutrition_data_prepared_per": "100g",
        "serving_size": "1 Riegel (40 g)",
        "serving_quantity": "40",
        "nutriments": {
            "energy-kcal_100g": 452,
            "energy-kcal_unit": "kcal",
            "energy-kj_100g": 1891,
            "energy-kj_unit": "kJ",
            "proteins_100g": 8.2,
            "proteins_unit": "g",
            "carbohydrates_100g": 54,
            "carbohydrates_unit": "g",
            "fat_100g": 21.5,
            "fat_unit": "g",
            "fiber_100g": 4.1,
            "fiber_unit": "g",
            "sugars_100g": 30,
            "sugars_unit": "g",
            "saturated-fat_100g": 6.3,
            "saturated-fat_unit": "g",
            "salt_100g": 0.2,
            "salt_unit": "g",
        },
    }
    fields |= product
    return {
        "code": code,
        "status": 1,
        "status_verbose": "product found",
        "product": {key: value for key, value in fields.items() if value is not None},
    }
