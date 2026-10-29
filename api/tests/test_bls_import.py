import csv
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
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
    assert food.category == "fish"  # from the code: T is the BLS group of fish
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


def updated_csv(tmp_path: Path, old: str, new: str, source: Path = MINI_CSV) -> Path:
    """A copy of a fixture with one value replaced, as a later BLS release."""
    path = tmp_path / source.name
    text = source.read_text(encoding="utf-8")
    assert old in text
    path.write_text(text.replace(old, new), encoding="utf-8")
    return path


def bread(session: Session) -> Food:
    session.expire_all()
    return session.scalars(select(Food).where(Food.source_id == "T000002")).one()


def raw_row(session: Session, food: Food) -> dict:
    return session.scalars(
        select(FoodSourceData.payload).where(FoodSourceData.food_id == food.id)
    ).one()


def test_second_run_updates_values_and_raw_row(session: Session, tmp_path: Path) -> None:
    run_import(session)
    update = updated_csv(tmp_path, '"Testbrot, hell",250,8.5', '"Testbrot hell",260,9.5')

    assert import_bls(session, csv_path=update, servings_path=MINI_SERVINGS) == 0

    food = bread(session)
    assert (food.name, food.kcal, food.protein, food.carbs) == ("Testbrot hell", 260, 9.5, 48)
    assert food.name_norm == "testbrot hell"
    assert (raw_row(session, food)["name"], raw_row(session, food)["kcal"]) == (
        "Testbrot hell",
        "260",
    )
    assert bls_count(session) == 3


def test_second_run_keeps_overridden_fields(session: Session, tmp_path: Path) -> None:
    run_import(session)
    food = bread(session)
    food.name, food.kcal, food.overridden = "Weißbrot", 240.0, ["name", "kcal"]
    session.commit()
    update = updated_csv(tmp_path, '"Testbrot, hell",250,8.5', '"Testbrot hell",260,9.5')

    import_bls(session, csv_path=update, servings_path=MINI_SERVINGS)

    food = bread(session)
    assert (food.name, food.kcal, food.protein) == ("Weißbrot", 240, 9.5)
    assert food.overridden == ["name", "kcal"]
    assert raw_row(session, food)["kcal"] == "260"


def test_second_run_adds_new_foods(session: Session, tmp_path: Path) -> None:
    run_import(session)
    update = tmp_path / "bls.csv"
    update.write_text(
        MINI_CSV.read_text(encoding="utf-8") + "T000004,Testkäse,350,25,0,28,0,0,18,1.8\n",
        encoding="utf-8",
    )
    assert import_bls(session, csv_path=update, servings_path=MINI_SERVINGS) == 1
    assert bls_count(session) == 4


def test_second_run_keeps_own_servings_and_adds_no_duplicates(
    session: Session, tmp_path: Path
) -> None:
    run_import(session)
    food = bread(session)
    slice_ = session.scalars(select(Serving).where(Serving.food_id == food.id)).one()
    slice_.grams, slice_.origin = 50.0, "own"
    session.commit()
    servings = updated_csv(tmp_path, "1 Apfel,150", "1 Apfel,180", source=MINI_SERVINGS)

    import_bls(session, csv_path=MINI_CSV, servings_path=servings)

    rows = session.scalars(select(Serving).join(Food).order_by(Food.source_id)).all()
    assert [(s.label, s.grams, s.origin, s.is_default) for s in rows] == [
        ("1 Apfel", 180, "estimated", True),  # an unchanged estimate takes the new grams
        ("1 Scheibe", 50, "own", True),  # the own change stays
    ]


def test_second_run_does_not_restore_removed_servings(client: TestClient, session: Session) -> None:
    run_import(session)
    food = bread(session)
    assert client.patch(f"/api/v1/foods/{food.id}", json={"servings": []}).status_code == 200

    import_bls(session, csv_path=MINI_CSV, servings_path=MINI_SERVINGS)

    assert session.scalars(select(Serving).where(Serving.food_id == food.id)).all() == []


def test_patched_bls_food_survives_a_second_run(
    client: TestClient, session: Session, tmp_path: Path
) -> None:
    run_import(session)
    food = bread(session)
    client.patch(f"/api/v1/foods/{food.id}", json={"per_100": {"kcal": 245}})
    update = updated_csv(tmp_path, '"Testbrot, hell",250,8.5', '"Testbrot, hell",260,9.5')

    import_bls(session, csv_path=update, servings_path=MINI_SERVINGS)

    body = client.get(f"/api/v1/foods/{food.id}").json()
    assert (body["per_100"]["kcal"], body["per_100"]["protein"]) == (245, 9.5)


def test_serving_for_unknown_code_fails(session: Session, tmp_path: Path) -> None:
    servings = tmp_path / "servings.csv"
    servings.write_text("code,name,label,grams,origin\nX999999,?,1 Stück,10,estimated\n")
    with pytest.raises(ValueError, match="X999999"):
        import_bls(session, csv_path=MINI_CSV, servings_path=servings)
