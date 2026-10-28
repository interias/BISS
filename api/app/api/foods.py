from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api import convert, schemas
from app.api.deps import SessionDep
from app.models import Food, Serving
from app.search.search import search_foods
from app.services.foods import FALLBACK_SERVING, StandardServing, standard_serving

router = APIRouter(prefix="/foods", tags=["foods"])


@router.get("/search")
def search(
    session: SessionDep,
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[schemas.FoodSummary]:
    """Search own foods, BLS and cached products; best match first, duplicates merged."""
    return [
        convert.food_summary(
            hit,
            StandardServing(hit.serving_label, hit.serving_grams, hit.serving_origin)
            if hit.serving_label is not None
            else FALLBACK_SERVING,
        )
        for hit in search_foods(session, q, limit=limit)
    ]


@router.get("/{food_id}", responses={404: {"description": "unknown food"}})
def get_food(food_id: int, session: SessionDep) -> schemas.FoodDetail:
    """A food with its values per 100 g (or 100 ml), its servings and its source."""
    food = session.get(Food, food_id)
    if food is None:
        raise HTTPException(status_code=404, detail="food not found")
    servings = session.scalars(
        select(Serving).where(Serving.food_id == food_id).order_by(Serving.grams, Serving.id)
    ).all()
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
        servings=[schemas.Serving.model_validate(s) for s in servings],
        standard_serving=schemas.StandardServing.model_validate(standard_serving(session, food_id)),
    )
