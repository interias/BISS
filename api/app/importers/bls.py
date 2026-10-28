"""Seed the BLS 4.0 foods and their estimated standard servings.

Runs on API start (see the Dockerfile) and may run any number of times: it does nothing
once foods with source=bls exist. The raw CSV row is kept in food_source_data.

    uv run python -m app.importers.bls
"""

import csv
import sys
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import exists, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Food, FoodSourceData, Serving

SOURCE = "bls"
# data/bls in the repository; /data/bls in the api container.
DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "bls"
CSV_PATH = DATA_DIR / "bls_4_0_extract.csv"
SERVINGS_PATH = DATA_DIR / "servings.csv"

FIELDS = ["code", "name", "kcal", "protein", "carbs", "fat", "fiber", "sugar", "sat_fat", "salt"]
CORE = ("kcal", "protein", "carbs", "fat")
OPTIONAL = ("fiber", "sugar", "sat_fat", "salt")


# BLS markers for traces and values below the limit of detection or quantification.
NEGLIGIBLE = {"TR", "<LOD", "<LOQ", "<LOD or <LOQ"}


def _number(value: str) -> float | None:
    """Parse a BLS value; "-" or an empty cell means not stated."""
    value = value.strip()
    if value in NEGLIGIBLE:
        return 0.0
    if value in {"", "-"}:
        return None
    return float(value)


def _food(row: dict[str, str], fetched_at: datetime) -> dict:
    values = {field: _number(row[field]) for field in (*CORE, *OPTIONAL)}
    # Core values are required; the few BLS foods without one count it as 0.
    for field in CORE:
        if values[field] is None:
            values[field] = 0.0
    return {
        "name": row["name"],
        "source": SOURCE,
        "source_id": row["code"],
        "fetched_at": fetched_at,
        **values,
    }


def _read(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


def has_bls_foods(session: Session) -> bool:
    return bool(session.scalar(select(exists().where(Food.source == SOURCE))))


def import_bls(
    session: Session, csv_path: Path = CSV_PATH, servings_path: Path = SERVINGS_PATH
) -> int:
    """Import the extract unless BLS foods exist; return the number of foods added."""
    if has_bls_foods(session):
        return 0

    rows = _read(csv_path)
    fetched_at = datetime.now(UTC)
    inserted = session.execute(
        insert(Food)
        .on_conflict_do_nothing(constraint="food_source_source_id")
        .returning(Food.id, Food.source_id),
        [_food(row, fetched_at) for row in rows],
    ).all()
    food_ids = {source_id: food_id for food_id, source_id in inserted}

    raw_rows = [
        {
            "food_id": food_ids[row["code"]],
            "source": SOURCE,
            "source_id": row["code"],
            "payload": row,
            "fetched_at": fetched_at,
        }
        for row in rows
        if row["code"] in food_ids
    ]
    if raw_rows:
        session.execute(insert(FoodSourceData).on_conflict_do_nothing(), raw_rows)

    servings = []
    for row in _read(servings_path):
        if row["code"] not in food_ids:
            raise ValueError(f"serving {row['label']!r} refers to unknown BLS code {row['code']}")
        servings.append(
            {
                "food_id": food_ids[row["code"]],
                "label": row["label"],
                "grams": float(row["grams"]),
                "origin": row["origin"],
                "is_default": True,
            }
        )
    if servings:
        session.execute(insert(Serving), servings)

    session.commit()
    return len(food_ids)


def main() -> None:
    from app.db import get_session

    with get_session() as session:
        count = import_bls(session)
    message = f"imported {count} BLS foods" if count else "BLS foods present, nothing to import"
    print(message, file=sys.stderr)


if __name__ == "__main__":
    main()
