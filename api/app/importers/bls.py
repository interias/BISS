"""Seed the BLS 4.0 foods and their estimated standard servings.

Runs on API start (see the Dockerfile) only while no foods with source=bls exist. Run by
hand on an existing database it updates the BLS foods without touching overlay fields
(food.overridden, SPEC 4). The raw CSV row is kept in food_source_data.

    uv run python -m app.importers.bls
"""

import csv
import sys
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import any_, case, exists, func, literal, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domain.category import bls_category
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
        "category": bls_category(row["code"]),
        "fetched_at": fetched_at,
        **values,
    }


def _read(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


def has_bls_foods(session: Session) -> bool:
    return bool(session.scalar(select(exists().where(Food.source == SOURCE))))


def _upsert_foods(session: Session, rows: list[dict[str, str]], fetched_at: datetime) -> None:
    """Insert new BLS foods; at known ones update every field not in overridden."""
    statement = insert(Food)
    food = Food.__table__.c

    def from_source(field: str):
        kept = literal(field) == any_(food.overridden)
        return case((kept, food[field]), else_=statement.excluded[field])

    session.execute(
        statement.on_conflict_do_update(
            constraint="food_source_source_id",
            set_={
                **{field: from_source(field) for field in ("name", "category", *CORE, *OPTIONAL)},
                "fetched_at": statement.excluded.fetched_at,
                "updated_at": func.now(),
            },
        ),
        [_food(row, fetched_at) for row in rows],
    )


def _add_servings(
    session: Session, servings_path: Path, food_ids: dict[str, int], known: set[str]
) -> None:
    """Estimated standard servings for the foods new in this run.

    Existing servings stay: an unchanged estimated one with the same label takes the new
    grams, an own one (also an edited estimate) is never touched, nothing is duplicated.
    A known food without servings keeps none, since they were removed on purpose.
    """
    existing: dict[int, list[Serving]] = {}
    for serving in session.scalars(select(Serving).where(Serving.food_id.in_(food_ids.values()))):
        existing.setdefault(serving.food_id, []).append(serving)

    for row in _read(servings_path):
        if row["code"] not in food_ids:
            raise ValueError(f"serving {row['label']!r} refers to unknown BLS code {row['code']}")
        food_id = food_ids[row["code"]]
        grams = float(row["grams"])
        if row["code"] in known:
            for serving in existing.get(food_id, []):
                if serving.origin == "estimated" and serving.label == row["label"]:
                    serving.grams = grams
        elif food_id not in existing:
            serving = Serving(
                food_id=food_id,
                label=row["label"],
                grams=grams,
                origin=row["origin"],
                is_default=True,
            )
            session.add(serving)
            existing[food_id] = [serving]


def import_bls(
    session: Session, csv_path: Path = CSV_PATH, servings_path: Path = SERVINGS_PATH
) -> int:
    """Import or update the extract; return the number of foods added."""
    rows = _read(csv_path)
    fetched_at = datetime.now(UTC)
    known = set(session.scalars(select(Food.source_id).where(Food.source == SOURCE)))
    _upsert_foods(session, rows, fetched_at)
    food_ids = {
        source_id: food_id
        for food_id, source_id in session.execute(
            select(Food.id, Food.source_id).where(Food.source == SOURCE)
        )
    }

    raw_rows = [
        {
            "food_id": food_ids[row["code"]],
            "source": SOURCE,
            "source_id": row["code"],
            "payload": row,
            "fetched_at": fetched_at,
        }
        for row in rows
    ]
    if raw_rows:
        statement = insert(FoodSourceData)
        session.execute(
            statement.on_conflict_do_update(
                index_elements=["food_id", "source"],
                set_={
                    "source_id": statement.excluded.source_id,
                    "payload": statement.excluded.payload,
                    "fetched_at": statement.excluded.fetched_at,
                },
            ),
            raw_rows,
        )

    _add_servings(session, servings_path, food_ids, known)
    session.commit()
    return len({row["code"] for row in rows} - known)


def main() -> None:
    from app.db import get_session

    with get_session() as session:
        # On API start the import only seeds; updating existing foods is a manual step.
        count = 0 if has_bls_foods(session) else import_bls(session)
    message = f"imported {count} BLS foods" if count else "BLS foods present, nothing to import"
    print(message, file=sys.stderr)


if __name__ == "__main__":
    main()
