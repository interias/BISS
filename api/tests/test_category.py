import csv
from datetime import UTC, datetime

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, inspect, text
from sqlalchemy.orm import Session

from app.barcode import chain
from app.domain.category import BLS_GROUPS, Category, bls_category, off_category
from app.importers.bls import CSV_PATH
from app.sources import off
from tests.conftest import API_DIR
from tests.factories import add_cached, add_food, off_answer

NOW = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("code", "category"),
    [
        ("B100000", Category.BREAD),
        ("C133000", Category.GRAINS),
        ("D100000", Category.SWEETS),
        ("E111000", Category.EGGS),
        ("E410000", Category.GRAINS),
        ("F503100", Category.FRUIT),
        ("H710000", Category.LEGUMES),
        ("K110000", Category.POTATOES),
        ("K710000", Category.VEGETABLES),
        ("M111000", Category.DAIRY),
        ("P100000", Category.DRINKS),
        ("W100000", Category.SAUSAGE),
        ("Y100000", Category.DISHES),
    ],
)
def test_bls_code_gives_the_category(code: str, category: Category) -> None:
    assert bls_category(code) == category


@pytest.mark.parametrize("code", [None, "", "Z123456"])
def test_bls_without_known_group_has_none(code: str | None) -> None:
    assert bls_category(code) is None


def test_every_food_of_the_bls_extract_has_a_category() -> None:
    with CSV_PATH.open(encoding="utf-8", newline="") as file:
        letters = {row["code"][0] for row in csv.DictReader(file)}
    assert letters <= set(BLS_GROUPS)


@pytest.mark.parametrize(
    ("tags", "category"),
    [
        (["en:dairies", "en:desserts", "en:skyrs"], Category.DAIRY),
        (["en:beverages", "en:plant-based-beverages"], Category.DRINKS),
        (["en:snacks", "en:sweet-snacks", "en:biscuits-and-cakes"], Category.SWEETS),
        (["en:plant-based-foods", "en:breads"], Category.BREAD),
        (["en:something-else"], Category.OTHER),
        ([], Category.OTHER),
        (None, Category.OTHER),
    ],
)
def test_off_tags_give_the_category(tags: list[str] | None, category: Category) -> None:
    assert off_category(tags) == category


def test_off_draft_and_stored_food_carry_the_category(session: Session) -> None:
    add_cached(session, "2000000000015", NOW, categories_tags=["en:snacks", "en:sweet-snacks"])
    found = off.draft("02000000000015", off_answer(categories_tags=["en:sweet-snacks"]))
    assert found is not None and found.category == Category.SWEETS
    assert off.draft("02000000000015", off_answer(categories_tags="en:x")).category == "other"
    food = chain.food_for_entry(session, "2000000000015", NOW)
    assert food.category == "sweets"


def test_category_in_summaries_and_details(client: TestClient, session: Session) -> None:
    banana = add_food(session, "Banane roh", source="bls", source_id="F503100", category="fruit")
    add_food(session, "Bananenbrot", category=None)
    hits = client.get("/api/v1/foods/search", params={"q": "banane"}).json()
    assert {hit["name"]: hit["category"] for hit in hits} == {
        "Banane roh": "fruit",
        "Bananenbrot": None,
    }
    assert client.get(f"/api/v1/foods/{banana.id}").json()["category"] == "fruit"


def test_own_food_takes_and_changes_its_category(client: TestClient) -> None:
    body = {
        "name": "Haferkeks",
        "category": "sweets",
        "per_100": {"kcal": 460, "protein": 8, "carbs": 64, "fat": 18},
    }
    created = client.post("/api/v1/foods", json=body).json()
    assert created["category"] == "sweets"
    changed = client.patch(f"/api/v1/foods/{created['id']}", json={"category": "bread"}).json()
    assert changed["category"] == "bread"
    cleared = client.patch(f"/api/v1/foods/{created['id']}", json={"category": None}).json()
    assert cleared["category"] is None
    bad = client.post("/api/v1/foods", json=body | {"category": "pizza"})
    assert bad.status_code == 422


def test_changed_category_of_a_bls_food_is_an_overlay(client: TestClient, session: Session) -> None:
    food = add_food(session, "Apfel roh", source="bls", source_id="F100000", category="fruit")
    client.patch(f"/api/v1/foods/{food.id}", json={"category": "sweets"})
    session.refresh(food)
    assert food.category == "sweets"
    assert "category" in food.overridden


def test_migration_0006_fills_bls_foods_and_downgrades(engine: Engine) -> None:
    config = Config(API_DIR / "alembic.ini")
    config.attributes["database_url"] = engine.url.render_as_string(hide_password=False)
    try:
        command.downgrade(config, "0005")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO food (name, kcal, protein, carbs, fat, source, source_id) VALUES "
                    "('Migrationstest Ei', 1, 1, 1, 1, 'bls', 'E111000'), "
                    "('Migrationstest Pilz', 1, 1, 1, 1, 'bls', 'K710000'), "
                    "('Migrationstest Brot', 1, 1, 1, 1, 'bls', 'B100000'), "
                    "('Migrationstest eigen', 1, 1, 1, 1, 'own', NULL)"
                )
            )
        command.upgrade(config, "head")
        with engine.connect() as connection:
            rows = connection.execute(
                text("SELECT name, category FROM food WHERE name LIKE 'Migrationstest%'")
            ).all()
        assert dict(rows) == {
            "Migrationstest Ei": "eggs",
            "Migrationstest Pilz": "vegetables",
            "Migrationstest Brot": "bread",
            "Migrationstest eigen": None,
        }
        command.downgrade(config, "0005")
        schema = inspect(engine)
        schema.clear_cache()
        assert "category" not in {c["name"] for c in schema.get_columns("food")}
    finally:
        command.upgrade(config, "head")
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM food WHERE name LIKE 'Migrationstest%'"))
