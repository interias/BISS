import pytest
from sqlalchemy import Engine, inspect, select, text
from sqlalchemy.orm import Session

from app.models import Base, Food


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


def test_name_norm_has_a_trigram_index(session: Session) -> None:
    definition = session.scalar(
        text("SELECT indexdef FROM pg_indexes WHERE indexname = 'food_name_norm_trgm'")
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
