import csv
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.importers.bls import import_bls
from app.models import Food, FoodSourceData, Serving

FIXTURES = Path(__file__).parent / "fixtures"
MINI_CSV = FIXTURES / "bls_mini.csv"
MINI_SERVINGS = FIXTURES / "servings_mini.csv"


def run_import(session: Session) -> int:
    return import_bls(session, csv_path=MINI_CSV, servings_path=MINI_SERVINGS)


def bls_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Food).where(Food.source == "bls"))


def test_import_adds_every_row(session: Session) -> None:
    assert run_import(session) == 3
    assert bls_count(session) == 3


def test_second_run_changes_nothing(session: Session) -> None:
    run_import(session)
    assert run_import(session) == 0
    assert bls_count(session) == 3
    assert session.scalar(select(func.count()).select_from(FoodSourceData)) == 3
    assert session.scalar(select(func.count()).select_from(Serving)) == 2


def test_food_values_and_normalised_name(session: Session) -> None:
    run_import(session)
    food = session.scalars(select(Food).where(Food.source_id == "T000002")).one()
    assert (food.name, food.kcal, food.protein, food.carbs, food.fat) == (
        "Testbrot, hell",
        250,
        8.5,
        48,
        1.2,
    )
    assert food.name_norm == "testbrot hell"
    assert food.basis == "g"
    assert food.fetched_at is not None


def test_markers_for_traces_and_missing_values(session: Session) -> None:
    run_import(session)
    bread = session.scalars(select(Food).where(Food.source_id == "T000002")).one()
    oil = session.scalars(select(Food).where(Food.source_id == "T000003")).one()
    assert (bread.fiber, bread.sat_fat) == (0.0, 0.0)  # TR and <LOD
    assert (oil.fiber, oil.sat_fat) == (None, None)  # "-" means not stated


def test_source_data_keeps_the_raw_row(session: Session) -> None:
    run_import(session)
    with MINI_CSV.open(encoding="utf-8", newline="") as file:
        raw = next(row for row in csv.DictReader(file) if row["code"] == "T000002")
    source_data = session.scalars(
        select(FoodSourceData).where(FoodSourceData.source_id == "T000002")
    ).one()
    assert source_data.source == "bls"
    assert source_data.payload == raw


def test_estimated_standard_servings(session: Session) -> None:
    run_import(session)
    serving = session.scalars(select(Serving).join(Food).where(Food.source_id == "T000001")).one()
    assert (serving.label, serving.grams, serving.origin, serving.is_default) == (
        "1 Apfel",
        150,
        "estimated",
        True,
    )


def test_serving_for_unknown_code_fails(session: Session, tmp_path: Path) -> None:
    servings = tmp_path / "servings.csv"
    servings.write_text("code,name,label,grams,origin\nX999999,?,1 Stück,10,estimated\n")
    with pytest.raises(ValueError, match="X999999"):
        import_bls(session, csv_path=MINI_CSV, servings_path=servings)
