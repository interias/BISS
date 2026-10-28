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
    # Open Food Facts API (ADR-0002); another base URL points it at a stub.
    off_base_url: str
    # Label extraction (ADR-0004): the fast model first, the strong one as fallback.
    llm_model_fast: str
    llm_model_strong: str
    # agent: Claude Agent SDK; fake: invented draft without a model (tests, e2e).
    # Not checked at startup: any other value fails only at a label request, with a 500.
    label_extractor: str


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
        off_base_url=os.environ.get("OFF_BASE_URL", "https://world.openfoodfacts.org"),
        llm_model_fast=os.environ.get("LLM_MODEL_FAST") or "claude-haiku-5-5",
        llm_model_strong=os.environ.get("LLM_MODEL_STRONG") or "claude-sonnet-5-5",
        label_extractor=os.environ.get("LABEL_EXTRACTOR") or "agent",
    )
