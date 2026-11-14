"""Rezept (ADR-0012): an own dish made from foods, kept as a food of its own.

The ingredients give the values of the whole dish. Divided by the weight of the finished
dish they are the values per 100 g of the recipe's food, and that weight divided by the
portions is its serving "1 Portion". So a recipe is searched, guessed, logged and counted in
portions like any food, and an entry of it is one row of the diary.

Baking and frying lose water: the finished dish weighs less than its ingredients, and
100 g of it carry more. Without a weighed dish the sum of the ingredients stands in, which
fits a soup or a stew.
"""

from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.domain.category import Category
from app.domain.macros import Macros
from app.models import Food, Recipe, RecipeItem
from app.services import foods
from app.services.entries import snapshot
from app.services.foods import ServingInput, StandardServing, standard_servings

PORTION = "1 Portion"
# An ingredient of a whole pot, and the pot itself.
MAX_ITEM_GRAMS = 10_000.0
MAX_COOKED_GRAMS = 50_000.0
MAX_PORTIONS = 100

# Unset: the cooked weight stays as it is; None takes the weighed dish away again.
KEEP: Any = object()

_CORE = ("kcal", "protein", "carbs", "fat")
_MORE = ("fiber", "sugar", "sat_fat", "salt")


class NotFound(LookupError):
    pass


class InvalidRecipe(ValueError):
    pass


@dataclass(frozen=True)
class RecipeItemView:
    food: Food
    serving: StandardServing
    grams: float
    macros: Macros


@dataclass(frozen=True)
class RecipeView:
    id: int
    food: Food
    description: str
    portions: int
    # The weighed finished dish; None: not weighed, the ingredients' sum applies.
    cooked_grams: float | None
    raw_grams: float
    portion_grams: float
    items: list[RecipeItemView]
    # Of the whole dish and of one portion, from the food's values as an entry takes them.
    totals: Macros
    per_portion: Macros


def _recipe(session: Session, recipe_id: int) -> Recipe:
    recipe = session.get(Recipe, recipe_id)
    if recipe is None:
        raise NotFound(f"recipe {recipe_id} not found")
    return recipe


def _check(
    session: Session,
    items: list[tuple[int, float]],
    portions: int,
    cooked_grams: float | None,
    own_food_id: int | None = None,
) -> list[Food]:
    if not items:
        raise InvalidRecipe("a recipe needs at least one ingredient")
    if not 1 <= portions <= MAX_PORTIONS:
        raise InvalidRecipe(f"portions must be 1 to {MAX_PORTIONS}")
    if cooked_grams is not None and not 0 < cooked_grams <= MAX_COOKED_GRAMS:
        raise InvalidRecipe(f"cooked_grams must be above 0 and at most {MAX_COOKED_GRAMS:g}")
    found = []
    for food_id, grams in items:
        if not 0 < grams <= MAX_ITEM_GRAMS:
            raise InvalidRecipe(f"grams must be above 0 and at most {MAX_ITEM_GRAMS:g}")
        if food_id == own_food_id:
            raise InvalidRecipe("a recipe cannot be its own ingredient")
        food = session.get(Food, food_id)
        if food is None:
            raise NotFound(f"food {food_id} not found")
        found.append(food)
    return found


def _values(
    ingredients: list[Food], items: list[tuple[int, float]], final_grams: float
) -> dict[str, float | None]:
    """Values per 100 g of the finished dish. A value one ingredient lacks is unknown."""
    values: dict[str, float | None] = {}
    for field in (*_CORE, *_MORE):
        total = 0.0
        for food, (_, grams) in zip(ingredients, items, strict=True):
            value = getattr(food, field)
            if value is None:
                total = None
                break
            # Values of an ml food are per 100 ml.
            total += value * (grams / food.density if food.basis == "ml" else grams) / 100
        values[field] = None if total is None else round(total * 100 / final_grams, 1)
    return values


def _fields(
    name: str,
    ingredients: list[Food],
    items: list[tuple[int, float]],
    portions: int,
    cooked_grams: float | None,
) -> tuple[dict[str, Any], list[ServingInput]]:
    """The fields and the one serving of the recipe's food."""
    final_grams = cooked_grams or sum(grams for _, grams in items)
    fields = {"name": name, "basis": "g", "density": 1.0, "category": Category.DISHES.value}
    fields |= _values(ingredients, items, final_grams)
    serving = ServingInput(PORTION, round(final_grams / portions, 1), is_default=True)
    return fields, [serving]


def _replace_items(session: Session, recipe: Recipe, items: list[tuple[int, float]]) -> None:
    session.execute(delete(RecipeItem).where(RecipeItem.recipe_id == recipe.id))
    for position, (food_id, grams) in enumerate(items):
        session.add(
            RecipeItem(recipe_id=recipe.id, food_id=food_id, grams=grams, position=position)
        )


def items_of(session: Session, recipe_id: int) -> list[tuple[int, float]]:
    rows = session.execute(
        select(RecipeItem.food_id, RecipeItem.grams)
        .where(RecipeItem.recipe_id == recipe_id)
        .order_by(RecipeItem.position, RecipeItem.id)
    ).all()
    return [(food_id, grams) for food_id, grams in rows]


def get_recipe(session: Session, recipe_id: int) -> RecipeView:
    recipe = _recipe(session, recipe_id)
    food = session.get(Food, recipe.food_id)
    rows = session.execute(
        select(RecipeItem, Food)
        .join(Food, Food.id == RecipeItem.food_id)
        .where(RecipeItem.recipe_id == recipe.id)
        .order_by(RecipeItem.position, RecipeItem.id)
    ).all()
    servings = standard_servings(session, {item_food.id for _, item_food in rows})
    items = [
        RecipeItemView(
            item_food, servings[item_food.id], item.grams, snapshot(item_food, item.grams)
        )
        for item, item_food in rows
    ]
    raw_grams = sum(item.grams for item in items)
    final_grams = recipe.cooked_grams or raw_grams
    portion_grams = round(final_grams / recipe.portions, 1)
    return RecipeView(
        id=recipe.id,
        food=food,
        description=recipe.description,
        portions=recipe.portions,
        cooked_grams=recipe.cooked_grams,
        raw_grams=raw_grams,
        portion_grams=portion_grams,
        items=items,
        totals=snapshot(food, final_grams),
        per_portion=snapshot(food, portion_grams),
    )


def list_recipes(session: Session) -> list[RecipeView]:
    """All recipes, the one saved last first."""
    ids = session.scalars(select(Recipe.id).order_by(Recipe.updated_at.desc(), Recipe.id.desc()))
    return [get_recipe(session, recipe_id) for recipe_id in ids]


def recipe_id_of(session: Session, food_id: int) -> int | None:
    """The recipe whose food this is, so the app opens the recipe instead of the food."""
    return session.scalar(select(Recipe.id).where(Recipe.food_id == food_id))


def recipe_food_ids(session: Session) -> set[int]:
    """The foods that are recipes, so the search can mark them."""
    return set(session.scalars(select(Recipe.food_id)))


def create_recipe(
    session: Session,
    name: str,
    items: list[tuple[int, float]],
    portions: int = 1,
    cooked_grams: float | None = None,
    description: str = "",
) -> RecipeView:
    """A new recipe with its food; raises NotFound for an unknown ingredient, InvalidRecipe."""
    ingredients = _check(session, items, portions, cooked_grams)
    fields, servings = _fields(name, ingredients, items, portions, cooked_grams)
    food = foods.create_food(session, fields, servings)
    recipe = Recipe(
        food_id=food.id, description=description, portions=portions, cooked_grams=cooked_grams
    )
    session.add(recipe)
    session.flush()
    _replace_items(session, recipe, items)
    session.commit()
    return get_recipe(session, recipe.id)


def update_recipe(
    session: Session,
    recipe_id: int,
    name: str | None = None,
    items: list[tuple[int, float]] | None = None,
    portions: int | None = None,
    cooked_grams: float | None = KEEP,
    description: str | None = None,
) -> RecipeView:
    """Change what is given and compute the food anew; entries keep their snapshots."""
    recipe = _recipe(session, recipe_id)
    food = session.get(Food, recipe.food_id)
    items = items if items is not None else items_of(session, recipe_id)
    portions = portions if portions is not None else recipe.portions
    cooked_grams = recipe.cooked_grams if cooked_grams is KEEP else cooked_grams
    ingredients = _check(session, items, portions, cooked_grams, own_food_id=food.id)
    fields, servings = _fields(name or food.name, ingredients, items, portions, cooked_grams)
    recipe.portions, recipe.cooked_grams = portions, cooked_grams
    if description is not None:
        recipe.description = description
    recipe.updated_at = func.now()
    _replace_items(session, recipe, items)
    foods.update_food(session, food.id, fields, servings)
    return get_recipe(session, recipe_id)
