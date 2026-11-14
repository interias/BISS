"""Rezept: POST, GET and PATCH /recipes and the food a recipe is logged with (ADR-0012)."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Food, Serving
from tests.factories import add_food

RECIPES = "/api/v1/recipes"


def ingredients(session: Session) -> tuple[Food, Food, Food]:
    flour = add_food(
        session,
        "Weizen Vollkornmehl",
        kcal=320,
        protein=12,
        carbs=60,
        fat=2,
        fiber=10,
        source="bls",
    )
    skyr = add_food(session, "Skyr natur", kcal=64, protein=11, carbs=4, fat=0.2, fiber=0)
    egg = add_food(session, "Hühnerei roh", kcal=140, protein=12, carbs=1, fat=10, source="bls")
    return flour, skyr, egg


def create(client: TestClient, flour: Food, skyr: Food, egg: Food, **fields) -> dict:
    body = {
        "name": "Skyrbrötchen",
        "description": "Verrühren, 20 Minuten bei 200 °C Umluft backen.",
        "items": [
            {"food_id": flour.id, "grams": 200},
            {"food_id": skyr.id, "grams": 250},
            {"food_id": egg.id, "grams": 90},
        ],
        "portions": 5,
    } | fields
    response = client.post(RECIPES, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_recipe_without_a_weighed_dish_takes_the_sum_of_its_ingredients(
    client: TestClient, session: Session
) -> None:
    recipe = create(client, *ingredients(session))

    # 640 + 160 + 126 = 926 kcal in 540 g.
    assert (recipe["raw_grams"], recipe["cooked_grams"], recipe["portion_grams"]) == (
        540,
        None,
        108,
    )
    assert recipe["per_100"]["kcal"] == 171.5
    assert recipe["per_100"]["protein"] == 11.5
    assert recipe["totals"]["kcal"] == 926.1
    assert recipe["per_portion"]["kcal"] == 185.2
    assert [(i["food"]["name"], i["grams"]) for i in recipe["items"]] == [
        ("Weizen Vollkornmehl", 200),
        ("Skyr natur", 250),
        ("Hühnerei roh", 90),
    ]
    assert recipe["description"].startswith("Verrühren")


def test_a_weighed_dish_concentrates_the_values_and_sets_the_portion(
    client: TestClient, session: Session
) -> None:
    recipe = create(client, *ingredients(session), cooked_grams=450)

    # The same 926 kcal in 450 g of baked rolls: 100 g carry more, a portion is 90 g.
    assert (recipe["cooked_grams"], recipe["portion_grams"]) == (450, 90)
    assert recipe["per_100"]["kcal"] == 205.8
    assert recipe["per_portion"]["kcal"] == 185.2
    assert recipe["totals"]["kcal"] == 926.1


def test_the_food_of_a_recipe_is_logged_in_portions_like_any_food(
    client: TestClient, session: Session
) -> None:
    recipe = create(client, *ingredients(session), cooked_grams=450)

    food = client.get(f"/api/v1/foods/{recipe['food_id']}").json()
    assert (food["name"], food["source"], food["category"]) == ("Skyrbrötchen", "own", "dishes")
    assert food["recipe_id"] == recipe["id"]
    assert food["standard_serving"] == {"label": "1 Portion", "grams": 90, "origin": "own"}
    # The egg has no fibre value: the fibre of the dish is unknown, not too low.
    assert food["per_100"]["fiber"] is None

    # Two portions.
    entry = client.post("/api/v1/entries", json={"food_id": recipe["food_id"], "grams": 180}).json()
    assert entry["macros"]["kcal"] == 370.4
    hits = client.get("/api/v1/foods/search", params={"q": "Skyrbrötchen"}).json()["hits"]
    assert hits[0]["id"] == recipe["food_id"]
    # A plain food is no recipe.
    plain = add_food(session, "Linsen")
    assert client.get(f"/api/v1/foods/{plain.id}").json()["recipe_id"] is None


def test_weighing_later_and_changing_portions_computes_the_food_anew(
    client: TestClient, session: Session
) -> None:
    flour, skyr, egg = ingredients(session)
    recipe = create(client, flour, skyr, egg)
    entry = client.post("/api/v1/entries", json={"food_id": recipe["food_id"], "grams": 108}).json()
    url = f"{RECIPES}/{recipe['id']}"

    weighed = client.patch(url, json={"cooked_grams": 450}).json()
    assert (weighed["portion_grams"], weighed["per_100"]["kcal"]) == (90, 205.8)
    assert weighed["portions"] == 5

    fewer = client.patch(url, json={"portions": 3, "name": "Skyrbrötchen groß"}).json()
    assert (fewer["name"], fewer["portion_grams"], fewer["cooked_grams"]) == (
        "Skyrbrötchen groß",
        150,
        450,
    )
    servings = session.scalars(select(Serving).where(Serving.food_id == recipe["food_id"])).all()
    assert [(s.label, s.grams, s.is_default) for s in servings] == [("1 Portion", 150, True)]

    # Other ingredients; null takes the weighed dish away again.
    changed = client.patch(
        url, json={"items": [{"food_id": skyr.id, "grams": 500}], "cooked_grams": None}
    ).json()
    assert (changed["raw_grams"], changed["cooked_grams"], changed["per_100"]["kcal"]) == (
        500,
        None,
        64,
    )
    assert client.get(url).json() == changed
    # The entry logged before keeps its snapshot.
    day = client.get(f"/api/v1/days/{entry['day']}").json()
    assert day["totals"]["kcal"] == entry["macros"]["kcal"] == 185.2


def test_an_ml_ingredient_counts_by_its_volume(client: TestClient, session: Session) -> None:
    milk = add_food(
        session, "Milch", kcal=64, protein=3, carbs=5, fat=3.5, basis="ml", density=1.03
    )
    body = {"name": "Milchreis", "items": [{"food_id": milk.id, "grams": 206}]}
    recipe = client.post(RECIPES, json=body).json()
    # 206 g are 200 ml: 128 kcal in 206 g of the dish, 62.1 kcal per 100 g. The whole dish
    # is what an entry of all of it would store, from the rounded value.
    assert recipe["totals"]["kcal"] == 127.9
    assert recipe["per_100"]["kcal"] == 62.1


def test_recipe_refuses_what_makes_no_dish(client: TestClient, session: Session) -> None:
    flour, skyr, egg = ingredients(session)
    recipe = create(client, flour, skyr, egg)
    item = {"food_id": flour.id, "grams": 100}

    def post(**fields) -> int:
        return client.post(RECIPES, json={"name": "x", "items": [item]} | fields).status_code

    assert post(items=[]) == 422
    assert post(items=[{"food_id": flour.id, "grams": 0}]) == 422
    assert post(portions=0) == 422
    assert post(cooked_grams=0) == 422
    assert post(name="") == 422
    assert post(items=[{"food_id": 999999, "grams": 10}]) == 404
    url = f"{RECIPES}/{recipe['id']}"
    own = {"items": [{"food_id": recipe["food_id"], "grams": 10}]}
    assert client.patch(url, json=own).status_code == 422
    assert client.get(f"{RECIPES}/999999").status_code == 404
    assert client.patch(f"{RECIPES}/999999", json={"portions": 2}).status_code == 404
    # Nothing of the refused requests is stored.
    assert session.scalars(select(Food).where(Food.name == "x")).all() == []
