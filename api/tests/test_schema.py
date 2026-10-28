from datetime import UTC, datetime

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect, select, text
from sqlalchemy.orm import Session

from app.models import Base, Food, OffCache
from app.search.normalize import normalize
from app.sources import off
from tests.conftest import API_DIR
from tests.factories import off_answer


def test_migration_creates_the_tables(engine: Engine) -> None:
    tables = set(inspect(engine).get_table_names())
    assert {"food", "food_source_data", "serving", "entry", "goal"} <= tables
    assert "off_cache" in tables


def test_every_table_has_a_model(engine: Engine) -> None:
    tables = set(inspect(engine).get_table_names()) - {"alembic_version"}
    assert set(Base.metadata.tables) == tables


def test_extensions_are_installed(session: Session) -> None:
    extensions = set(session.scalars(text("SELECT extname FROM pg_extension")))
    assert {"pg_trgm", "unaccent"} <= extensions


@pytest.mark.parametrize("index", ["food_name_norm_trgm", "off_cache_name_norm_trgm"])
def test_name_norm_has_a_trigram_index(session: Session, index: str) -> None:
    definition = session.scalar(
        text("SELECT indexdef FROM pg_indexes WHERE indexname = :index"), {"index": index}
    )
    assert "gin" in definition
    assert "gin_trgm_ops" in definition


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Äpfel", "aepfel"),
        ("Möhre", "moehre"),
        ("Müsli", "muesli"),
        ("Weißbrot", "weissbrot"),
        ("Crème fraîche", "creme fraiche"),
        ("Karotte/Möhre, roh", "karotte moehre roh"),
        ("Hähnchen-Brustfilet", "haehnchen brustfilet"),
        ("Vollmilch 1,5 l", "vollmilch"),
        ("Haferflocken 500 g", "haferflocken"),
        ("Haferflocken 500g Packung", "haferflocken packung"),
        ("Gouda 48 % Fett i. Tr.", "gouda 48 fett i tr"),
        ("  Brot  --  hell  ", "brot hell"),
    ],
)
def test_name_norm_is_generated(session: Session, name: str, expected: str) -> None:
    food = Food(name=name, kcal=0, protein=0, carbs=0, fat=0, source="own")
    session.add(food)
    session.flush()
    assert session.scalar(select(Food.name_norm).where(Food.id == food.id)) == expected


@pytest.mark.parametrize(
    "product",
    [
        {},
        {"product_name_de": "Müsli-Riegel 40 g", "brands": "Bäckerei Groß"},
        {"product_name_de": "  ", "product_name": "Test Bar Cocoa"},
        {"product_name_de": None, "product_name": "Test Bar"},
        {"product_name_de": 7, "product_name": "Test Bar"},
        {"product_name_de": None, "product_name": None},
        {"brands": " , Zweitmarke, Drittmarke"},
        {"brands": ""},
        {"brands": None},
        {"brands": ["Testmarke"]},
    ],
)
def test_off_cache_norms_follow_the_draft(session: Session, product: dict) -> None:
    """name_norm and brand_norm are the normalised name and brand that off.draft() reads."""
    payload = off_answer("2000000021089", **product)
    session.add(OffCache(gtin="02000000021089", payload=payload, fetched_at=datetime.now(UTC)))
    session.flush()
    row = session.execute(
        select(OffCache.name_norm, OffCache.brand_norm).where(OffCache.gtin == "02000000021089")
    ).one()
    found = off.draft("02000000021089", payload)
    name = off._text(payload["product"].get("product_name_de")) or off._text(
        payload["product"].get("product_name")
    )
    assert row.name_norm == (None if name is None else normalize(name))
    if found is not None:
        assert row.brand_norm == (None if found.brand is None else normalize(found.brand))


def off_cache_schema(engine: Engine) -> tuple[set[str], set[str]]:
    """Column and index names of off_cache."""
    schema = inspect(engine)
    return (
        {column["name"] for column in schema.get_columns("off_cache")},
        {index["name"] for index in schema.get_indexes("off_cache")},
    )


def test_migration_0003_downgrades_and_upgrades(engine: Engine) -> None:
    config = Config(API_DIR / "alembic.ini")
    config.attributes["database_url"] = engine.url.render_as_string(hide_password=False)
    try:
        command.downgrade(config, "0002")
        assert off_cache_schema(engine) == ({"gtin", "payload", "fetched_at"}, set())
    finally:
        command.upgrade(config, "head")
    assert off_cache_schema(engine) == (
        {"gtin", "payload", "fetched_at", "name_norm", "brand_norm"},
        {"off_cache_name_norm_trgm"},
    )


def entry_columns(engine: Engine) -> dict[str, bool]:
    schema = inspect(engine)
    schema.clear_cache()
    return {column["name"]: column["nullable"] for column in schema.get_columns("entry")}


def test_migration_0004_adds_nullable_group_columns_and_keeps_entries(engine: Engine) -> None:
    config = Config(API_DIR / "alembic.ini")
    config.attributes["database_url"] = engine.url.render_as_string(hide_password=False)
    try:
        command.downgrade(config, "0003")
        assert "group_id" not in entry_columns(engine)
        with engine.begin() as connection:
            food = connection.execute(
                text(
                    "INSERT INTO food (name, kcal, protein, carbs, fat, source) "
                    "VALUES ('Migrationstest', 100, 1, 1, 1, 'own') RETURNING id"
                )
            ).scalar_one()
            connection.execute(
                text(
                    "INSERT INTO entry (food_id, grams, meal, eaten_at, day, kcal, protein, "
                    "carbs, fat) VALUES (:food, 50, 'lunch', now(), current_date, 50, 0.5, "
                    "0.5, 0.5)"
                ),
                {"food": food},
            )
        command.upgrade(config, "head")
        columns = entry_columns(engine)
        assert (columns["group_id"], columns["group_name"]) == (True, True)
        with engine.connect() as connection:
            rows = connection.execute(
                text("SELECT grams, kcal, group_id, group_name FROM entry WHERE food_id = :f"),
                {"f": food},
            ).all()
        assert [tuple(row) for row in rows] == [(50, 50, None, None)]
    finally:
        command.upgrade(config, "head")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "DELETE FROM entry WHERE food_id IN "
                    "(SELECT id FROM food WHERE name = 'Migrationstest')"
                )
            )
            connection.execute(text("DELETE FROM food WHERE name = 'Migrationstest'"))
