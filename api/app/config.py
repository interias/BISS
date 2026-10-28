"""Runtime configuration from environment variables."""

import os
from dataclasses import dataclass
from pathlib import Path


def _float(name: str, default: float) -> float:
    value = os.environ.get(name)
    return float(value) if value else default


@dataclass(frozen=True)
class Settings:
    database_url: str
    goal_kcal: float
    goal_protein: float
    goal_carbs: float
    goal_fat: float
    # Product images; the volume images is mounted here in the api container.
    images_dir: Path


def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get(
            "DATABASE_URL", "postgresql+psycopg://biss:biss@localhost:5432/biss"
        ),
        goal_kcal=_float("GOAL_KCAL", 2400),
        goal_protein=_float("GOAL_PROTEIN", 160),
        goal_carbs=_float("GOAL_CARBS", 260),
        goal_fat=_float("GOAL_FAT", 75),
        images_dir=Path(os.environ.get("IMAGES_DIR", "/images")),
    )
