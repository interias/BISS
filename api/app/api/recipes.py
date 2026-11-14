from fastapi import APIRouter, HTTPException, status

from app.api import convert, schemas
from app.api.deps import SessionDep
from app.services import recipes
from app.services.recipes import KEEP, InvalidRecipe, NotFound

router = APIRouter(prefix="/recipes", tags=["recipes"])

NOT_FOUND = {404: {"description": "unknown recipe or food"}}
INVALID = {422: {"description": "no ingredient, bad grams, portions or cooked weight"}}


def _items(items: list[schemas.RecipeItemIn] | None) -> list[tuple[int, float]] | None:
    return None if items is None else [(item.food_id, item.grams) for item in items]


@router.post("", status_code=status.HTTP_201_CREATED, responses=NOT_FOUND | INVALID)
def create_recipe(body: schemas.RecipeCreate, session: SessionDep) -> schemas.Recipe:
    """Save an own dish. Its food carries the values per 100 g of the finished dish and the
    serving "1 Portion"; it is logged like any food (POST /entries with food_id)."""
    try:
        view = recipes.create_recipe(
            session,
            body.name,
            _items(body.items),
            body.portions,
            body.cooked_grams,
            body.description,
        )
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidRecipe as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return convert.recipe(view)


@router.get("")
def list_recipes(session: SessionDep) -> list[schemas.Recipe]:
    """All recipes, the one saved last first ("Meine Rezepte")."""
    return [convert.recipe(view) for view in recipes.list_recipes(session)]


@router.get("/{recipe_id}", responses=NOT_FOUND)
def get_recipe(recipe_id: int, session: SessionDep) -> schemas.Recipe:
    """A recipe with its ingredients, the whole dish and one portion."""
    try:
        return convert.recipe(recipes.get_recipe(session, recipe_id))
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.patch("/{recipe_id}", responses=NOT_FOUND | INVALID)
def update_recipe(
    recipe_id: int, body: schemas.RecipeUpdate, session: SessionDep
) -> schemas.Recipe:
    """Change what is sent; items replace all ingredients. cooked_grams null takes the
    weighed dish away again. The food is computed anew, logged entries keep their values."""
    try:
        view = recipes.update_recipe(
            session,
            recipe_id,
            body.name,
            _items(body.items),
            body.portions,
            body.cooked_grams if "cooked_grams" in body.model_fields_set else KEEP,
            body.description,
        )
    except NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidRecipe as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return convert.recipe(view)
